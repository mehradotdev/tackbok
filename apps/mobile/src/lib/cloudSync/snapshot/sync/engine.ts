import { SnapshotValidationError } from '../caps';
import { decodeSnapshot, encodeSnapshot } from '../codec';
import { SnapshotMergeError, mergeSnapshotDomains } from '../merge';
import type {
  JournalSnapshotPayload,
  ObservedDeviceHead,
  SnapshotDomain,
} from '../types';
import { BaseShadowManager, BaseShadowReadError } from './baseShadow';
import { SnapshotCleanup } from './cleanup';
import { SQLiteSyncStateStore } from './sqliteState';
import type {
  ListedDeviceHead,
  SnapshotJournalStore,
  SnapshotMediaStore,
  SnapshotProvider,
  SnapshotSyncHooks,
  SnapshotSyncResult,
} from './types';
import { LocalStorageError, SnapshotProviderError } from './types';
import { attentionReasonForProviderError } from '../../failureClassification';
import { AttentionError, RetryableSyncError } from './errors';
import {
  activeFrontier,
  domainOf,
  headSignature,
  headsCovered,
  isHeadShapeValid,
  normalizeObservations,
  remoteContainsBase,
  type RemoteHeadSnapshot,
} from './frontier';
import { SnapshotPublisher } from './publication';

const MAX_HEAD_RECHECKS = 4;

interface PlannedCandidate {
  domain: SnapshotDomain;
  capturedGeneration: number;
  parentSnapshotIds: string[];
  observedDeviceHeads: ObservedDeviceHead[];
  mediaHashes: string[];
}

function actionableChanges(journalGeneration: number, settledGeneration: number): number {
  return Math.max(0, journalGeneration - settledGeneration);
}

export class SnapshotSyncEngine {
  private running = false;
  private readonly cleanup: SnapshotCleanup;
  private readonly publisher: SnapshotPublisher;

  constructor(
    private readonly vaultId: string,
    private readonly deviceId: string,
    private readonly stateStore: SQLiteSyncStateStore,
    private readonly shadowManager: BaseShadowManager,
    private readonly journal: SnapshotJournalStore,
    private readonly mediaStore: SnapshotMediaStore,
    private readonly provider: SnapshotProvider,
    private readonly hooks: SnapshotSyncHooks = {},
    private readonly now: () => number = Date.now,
  ) {
    this.cleanup = new SnapshotCleanup({
      vaultId,
      stateStore,
      shadowManager,
      provider,
      hooks,
      now,
    });
    this.publisher = new SnapshotPublisher({
      vaultId,
      deviceId,
      stateStore,
      shadowManager,
      journal,
      mediaStore,
      provider,
      hooks,
      now,
      afterSettlement: () => this.cleanup.run(),
    });
  }

  async sync(): Promise<SnapshotSyncResult> {
    if (this.running) throw new Error('A snapshot sync pass is already running');
    this.running = true;
    try {
      return await this.syncExclusive();
    } catch (error) {
      return this.handleExpectedFailure(error);
    } finally {
      this.running = false;
    }
  }

  private async syncExclusive(): Promise<SnapshotSyncResult> {
    const revocations = await this.provider.listRevocations(this.vaultId);
    if (revocations.includes('journal-deleted')) {
      throw new AttentionError('journal-deleted', 'revocation-journal-deleted');
    }
    if (revocations.includes('backup-deleted')) {
      throw new AttentionError('backup-deleted', 'revocation-backup-deleted');
    }

    let durable = this.stateStore.loadState(this.vaultId, this.deviceId);
    if (durable.pauseReason) {
      return {
        status: 'attention',
        reason: durable.pauseReason,
        actionableChanges: actionableChanges(
          durable.journalGeneration,
          durable.settledGeneration,
        ),
      };
    }

    let pending = this.stateStore.loadPending(this.vaultId, this.deviceId);
    if (!pending) {
      if (durable.journalGeneration > durable.settledGeneration) {
        await this.hooks.at?.('after-local-mutation');
      }
      const plan = await this.planCandidate();
      if (!plan) {
        await this.cleanup.run();
        this.stateStore.clearPause(this.vaultId, this.deviceId);
        return { status: 'up-to-date', actionableChanges: 0 };
      }
      pending = this.stateStore.createPending(
        this.vaultId,
        this.deviceId,
        plan.capturedGeneration,
        (deviceSequence) => {
          const encoded = encodeSnapshot({
            format: 'tackbok-snapshot',
            vaultId: this.vaultId,
            parentSnapshotIds: plan.parentSnapshotIds,
            observedDeviceHeads: plan.observedDeviceHeads,
            authorDeviceId: this.deviceId,
            deviceSequence,
            createdAt: this.now(),
            ...plan.domain,
          });
          return {
            snapshotId: encoded.snapshotId,
            compressedBytes: encoded.compressedBytes,
            mediaHashes: plan.mediaHashes,
          };
        },
      );
      await this.hooks.at?.('after-candidate-persisted');
    }

    await this.publisher.resume(pending);
    this.stateStore.clearPause(this.vaultId, this.deviceId);
    durable = this.stateStore.loadState(this.vaultId, this.deviceId);
    return {
      status: 'published',
      snapshotId: pending.snapshotId,
      actionableChanges: actionableChanges(
        durable.journalGeneration,
        durable.settledGeneration,
      ),
    };
  }

  private async planCandidate(): Promise<PlannedCandidate | null> {
    for (let attempt = 0; attempt < MAX_HEAD_RECHECKS; attempt += 1) {
      const listed = await this.provider.listHeads(this.vaultId, true);
      const remoteHeads = await this.loadAndNormalizeHeads(listed);
      const checkpoint = this.stateStore.loadBaseCheckpoint(this.vaultId, this.deviceId);
      const loadedBase = await this.shadowManager.load(checkpoint);
      const captured = await this.journal.capture();
      const durable = this.stateStore.loadState(this.vaultId, this.deviceId);
      const frontier = activeFrontier(remoteHeads);
      if (frontier.length > 8) {
        throw new AttentionError('frontier-too-wide', 'active-parent-cap');
      }

      const accepted = loadedBase.shadow?.acceptedDeviceHeads ?? [];
      const covered = headsCovered(remoteHeads, accepted);
      if (loadedBase.shadow && covered &&
          durable.journalGeneration <= durable.settledGeneration) {
        return null;
      }

      let merged = captured.domain;
      const baseDomain = loadedBase.shadow ? domainOf(loadedBase.shadow.payload) : null;
      for (const remote of frontier.sort((left, right) =>
        left.snapshotId.localeCompare(right.snapshotId))) {
        if (loadedBase.shadow?.snapshotId === remote.snapshotId) continue;
        const remoteDescendsFromBase = loadedBase.shadow
          ? remoteContainsBase(remote, loadedBase.shadow)
          : false;
        merged = mergeSnapshotDomains(
          remoteDescendsFromBase ? baseDomain : null,
          merged,
          domainOf(remote.payload),
        );
      }

      await this.synchronizeMedia(captured.domain, frontier, merged, captured.generation);
      await this.hooks.beforeHeadRecheck?.();
      const rechecked = await this.loadAndNormalizeHeads(
        await this.provider.listHeads(this.vaultId, true),
      );
      if (headSignature(remoteHeads) !== headSignature(rechecked)) continue;

      const ownSequence = remoteHeads
        .filter((head) => head.head.deviceId === this.deviceId)
        .reduce((greatest, head) => Math.max(greatest, head.head.deviceSequence), 0);
      this.stateStore.ensureNextSequenceAtLeast(
        this.vaultId,
        this.deviceId,
        ownSequence + 1,
      );
      const parentSnapshotIds = frontier.map((remote) => remote.snapshotId);
      if (parentSnapshotIds.length === 0 && loadedBase.shadow) {
        parentSnapshotIds.push(loadedBase.shadow.snapshotId);
      }
      const observed = normalizeObservations([
        ...remoteHeads.map(({ head }) => ({
          deviceId: head.deviceId,
          deviceSequence: head.deviceSequence,
          snapshotId: head.snapshotId,
        })),
        ...frontier.flatMap((remote) => remote.payload.observedDeviceHeads),
      ]);
      return {
        domain: merged,
        capturedGeneration: captured.generation,
        parentSnapshotIds: [...new Set(parentSnapshotIds)].sort(),
        observedDeviceHeads: observed,
        mediaHashes: [...new Set(merged.media.map((asset) => asset.blobHash))].sort(),
      };
    }
    throw new SnapshotProviderError('transient', 'Heads changed during every bounded planning attempt');
  }

  private async loadAndNormalizeHeads(
    listed: ListedDeviceHead[],
  ): Promise<RemoteHeadSnapshot[]> {
    const grouped = new Map<string, ListedDeviceHead[]>();
    for (const candidate of listed) {
      if (candidate.head.format !== 'tackbok-device-head') {
        throw new AttentionError('unsupported-format', 'unsupported-device-head-format');
      }
      if (!isHeadShapeValid(candidate.head)) {
        throw new AttentionError('invalid-remote-snapshot', 'invalid-device-head-shape');
      }
      if (candidate.head.vaultId !== this.vaultId) {
        throw new AttentionError('wrong-vault', 'device-head-vault-mismatch');
      }
      const values = grouped.get(candidate.head.deviceId) ?? [];
      values.push(candidate);
      grouped.set(candidate.head.deviceId, values);
    }

    const normalized: ListedDeviceHead[] = [];
    for (const values of grouped.values()) {
      const sequence = Math.max(...values.map((value) => value.head.deviceSequence));
      const greatest = values.filter((value) => value.head.deviceSequence === sequence);
      const unique = new Map(greatest.map((value) => [value.head.snapshotId, value]));
      if (unique.size > 1) {
        const valid: ListedDeviceHead[] = [];
        for (const candidate of unique.values()) {
          const bytes = await this.provider.downloadSnapshot(this.vaultId, candidate.head.snapshotId);
          if (!bytes) continue;
          try {
            const decoded = decodeSnapshot(bytes, candidate.head.snapshotId);
            if (decoded.payload.vaultId === this.vaultId) valid.push(candidate);
          } catch {
            // A single valid retry-created duplicate can safely defeat invalid bytes.
          }
        }
        if (valid.length !== 1) {
          throw new AttentionError('ambiguous-device-head', 'same-sequence-different-snapshot');
        }
        normalized.push(valid[0]);
      } else {
        normalized.push([...unique.values()][0]);
      }
    }

    const snapshots: RemoteHeadSnapshot[] = [];
    for (const candidate of normalized) {
      const bytes = await this.provider.downloadSnapshot(this.vaultId, candidate.head.snapshotId);
      await this.hooks.at?.('during-remote-snapshot-download');
      if (!bytes) throw new AttentionError('head-snapshot-missing', 'head-target-not-found');
      let payload: JournalSnapshotPayload;
      try {
        payload = decodeSnapshot(bytes, candidate.head.snapshotId).payload;
      } catch (error) {
        const code = error instanceof SnapshotValidationError ? error.code : 'unknown';
        if (error instanceof SnapshotValidationError && code === 'invalid-literal' &&
            /^\$\.format\b/.test(error.message)) {
          throw new AttentionError('unsupported-format', 'remote-format-version');
        }
        throw new AttentionError('invalid-remote-snapshot', `snapshot-validation-${code}`);
      }
      if (payload.vaultId !== this.vaultId) {
        throw new AttentionError('wrong-vault', 'snapshot-vault-mismatch');
      }
      if (payload.authorDeviceId !== candidate.head.deviceId ||
          payload.deviceSequence !== candidate.head.deviceSequence) {
        throw new AttentionError('invalid-remote-snapshot', 'head-envelope-mismatch');
      }
      snapshots.push({
        head: candidate.head,
        snapshotId: candidate.head.snapshotId,
        payload,
      });
    }
    return snapshots.sort((left, right) => left.head.deviceId.localeCompare(right.head.deviceId));
  }

  private async synchronizeMedia(
    local: SnapshotDomain,
    remotes: RemoteHeadSnapshot[],
    merged: SnapshotDomain,
    capturedGeneration: number,
  ): Promise<void> {
    const localHashes = new Set(local.media.map((asset) => asset.blobHash));
    const remoteHashes = new Set(remotes.flatMap((remote) =>
      remote.payload.media.map((asset) => asset.blobHash)));
    const requiredHashes = [...new Set(merged.media.map((asset) => asset.blobHash))].sort();
    const remotelyPresent = await this.provider.hasMediaBatch(this.vaultId, requiredHashes);
    for (const blobHash of requiredHashes) {
      const remotePresent = remotelyPresent.has(blobHash);
      const localPresent = await this.mediaStore.hasVerified(blobHash);
      if (!remotePresent && localPresent) {
        const source = await this.mediaStore.openVerifiedSource(blobHash);
        if (!source || source.contentHash !== blobHash) {
          throw new AttentionError('local-media-unreadable', 'local-media-hash-mismatch');
        }
        await this.provider.uploadMedia(this.vaultId, blobHash, source);
        await this.hooks.at?.('during-media-transfer');
      } else if (remotePresent && !localPresent) {
        try {
          const downloaded = await this.provider.downloadMedia(
            this.vaultId,
            blobHash,
            await this.mediaStore.openDownloadSink(blobHash),
          );
          if (!downloaded) {
            await this.journal.applyMergedIfGeneration(merged, capturedGeneration);
            throw new AttentionError('missing-media', 'remote-media-hash-mismatch');
          }
          await this.hooks.at?.('during-media-transfer');
        } catch (error) {
          // A policy/transient download block (notably Wi-Fi-only media) must
          // not hold back the compressed metadata snapshot. The production
          // journal records a visible pending attachment and hydrates it in a
          // later bounded media pass. Integrity/auth failures remain blocking.
          if (!(error instanceof SnapshotProviderError) ||
              !['transient', 'rate-limited', 'wifi-only-media'].includes(error.code)) throw error;
        }
      } else if (!remotePresent && !localPresent) {
        // Apply the already-validated logical journal before pausing. This
        // keeps a fresh text restore useful while still refusing to publish a
        // snapshot that references an absent remote blob.
        await this.journal.applyMergedIfGeneration(merged, capturedGeneration);
        throw new AttentionError(
          localHashes.has(blobHash) && !remoteHashes.has(blobHash)
            ? 'local-media-unreadable'
            : 'missing-media',
          'required-media-unavailable',
        );
      }
    }
  }

  private handleExpectedFailure(error: unknown): SnapshotSyncResult {
    const state = this.stateStore.loadState(this.vaultId, this.deviceId);
    const remaining = actionableChanges(state.journalGeneration, state.settledGeneration);
    if (error instanceof AttentionError) {
      this.stateStore.setPause(
        this.vaultId,
        this.deviceId,
        error.reason,
        error.errorClass,
      );
      return { status: 'attention', reason: error.reason, actionableChanges: remaining };
    }
    if (error instanceof SnapshotMergeError) {
      const reason = error.code === 'derived-id-collision'
        ? 'derived-id-collision'
        : 'invalid-remote-snapshot';
      this.stateStore.setPause(this.vaultId, this.deviceId, reason, `merge-${error.code}`);
      return { status: 'attention', reason, actionableChanges: remaining };
    }
    if (error instanceof SnapshotValidationError) {
      this.stateStore.setPause(
        this.vaultId,
        this.deviceId,
        'normalized-model-not-ready',
        `local-candidate-${error.code}`,
      );
      return {
        status: 'attention',
        reason: 'normalized-model-not-ready',
        actionableChanges: remaining,
      };
    }
    if (error instanceof LocalStorageError) {
      this.stateStore.setPause(
        this.vaultId,
        this.deviceId,
        error.reason,
        error.errorClass,
      );
      return {
        status: 'attention',
        reason: error.reason,
        actionableChanges: remaining,
      };
    }
    if (error instanceof SnapshotProviderError) {
      const attention = attentionReasonForProviderError(error.code);
      if (attention) {
        this.stateStore.setPause(this.vaultId, this.deviceId, attention, `provider-${error.code}`);
        return { status: 'attention', reason: attention, actionableChanges: remaining };
      }
      this.stateStore.setRetryError(this.vaultId, this.deviceId, `provider-${error.code}`);
      return {
        status: 'retry',
        reason: error.code === 'rate-limited'
          ? 'rate-limited'
          : error.code === 'wifi-only-media'
            ? 'wifi-only-media'
            : 'transient',
        actionableChanges: remaining,
      };
    }
    if (error instanceof RetryableSyncError) {
      this.stateStore.setRetryError(this.vaultId, this.deviceId, error.errorClass);
      return { status: 'retry', reason: 'transient', actionableChanges: remaining };
    }
    if (error instanceof BaseShadowReadError) {
      this.stateStore.setRetryError(this.vaultId, this.deviceId, 'base-shadow-read-failed');
      return { status: 'retry', reason: 'transient', actionableChanges: remaining };
    }
    throw error;
  }

}
