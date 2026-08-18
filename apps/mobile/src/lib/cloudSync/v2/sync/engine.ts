import { canonicalizeV2 } from '../canonical';
import { SnapshotV2ValidationError } from '../caps';
import { decodeSnapshotV2, encodeSnapshotV2 } from '../codec';
import { SnapshotV2MergeError, mergeSnapshotDomainsV2 } from '../merge';
import type {
  JournalSnapshotPayloadV2,
  ObservedDeviceHeadV2,
  SnapshotDomainV2,
} from '../types';
import { BaseShadowCommitError, BaseShadowManagerV2 } from './baseShadow';
import { SQLiteV2SyncStateStore } from './sqliteState';
import type {
  BaseShadowV1,
  DeviceHeadV2,
  ListedDeviceHeadV2,
  SnapshotV2JournalStore,
  SnapshotV2MediaStore,
  SnapshotV2Provider,
  V2AttentionReason,
  V2PendingPublication,
  V2ProviderErrorCode,
  V2SyncHooks,
  V2SyncResult,
} from './types';
import { V2LocalStorageError, V2ProviderError } from './types';

const RETENTION_COUNT = 3;
const CLEANUP_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HEAD_RECHECKS = 4;
const MAX_JOURNAL_RECONCILIATION_ATTEMPTS = 4;

class AttentionError extends Error {
  constructor(
    readonly reason: V2AttentionReason,
    readonly errorClass: string,
  ) {
    super(errorClass);
    this.name = 'AttentionError';
  }
}

class RetryableSyncError extends Error {
  constructor(readonly errorClass: string) {
    super(errorClass);
    this.name = 'RetryableSyncError';
  }
}

interface RemoteHeadSnapshot {
  head: DeviceHeadV2;
  snapshotId: string;
  payload: JournalSnapshotPayloadV2;
}

interface PlannedCandidate {
  domain: SnapshotDomainV2;
  capturedGeneration: number;
  parentSnapshotIds: string[];
  observedDeviceHeads: ObservedDeviceHeadV2[];
  mediaHashes: string[];
}

function domainOf(payload: JournalSnapshotPayloadV2): SnapshotDomainV2 {
  return {
    entries: payload.entries,
    tags: payload.tags,
    entryTags: payload.entryTags,
    prompts: payload.prompts,
    profile: payload.profile,
    media: payload.media,
    tombstones: payload.tombstones,
    conflicts: payload.conflicts,
  };
}

function actionableChanges(journalGeneration: number, settledGeneration: number): number {
  return Math.max(0, journalGeneration - settledGeneration);
}

function observationMap(values: ObservedDeviceHeadV2[]): Map<string, ObservedDeviceHeadV2> {
  const result = new Map<string, ObservedDeviceHeadV2>();
  for (const value of values) {
    const existing = result.get(value.deviceId);
    if (!existing || value.deviceSequence > existing.deviceSequence ||
        (value.deviceSequence === existing.deviceSequence && value.snapshotId < existing.snapshotId)) {
      result.set(value.deviceId, { ...value });
    }
  }
  return result;
}

function normalizeObservations(values: ObservedDeviceHeadV2[]): ObservedDeviceHeadV2[] {
  const grouped = new Map<string, ObservedDeviceHeadV2[]>();
  for (const value of values) {
    const candidates = grouped.get(value.deviceId) ?? [];
    candidates.push(value);
    grouped.set(value.deviceId, candidates);
  }
  const result: ObservedDeviceHeadV2[] = [];
  for (const [deviceId, candidates] of grouped) {
    const greatest = Math.max(...candidates.map((candidate) => candidate.deviceSequence));
    const atGreatest = candidates.filter((candidate) => candidate.deviceSequence === greatest);
    const snapshotIds = [...new Set(atGreatest.map((candidate) => candidate.snapshotId))];
    if (snapshotIds.length !== 1) {
      throw new AttentionError('ambiguous-device-head', 'same-sequence-different-snapshot');
    }
    result.push({ deviceId, deviceSequence: greatest, snapshotId: snapshotIds[0] });
  }
  return result.sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

function isHeadShapeValid(head: DeviceHeadV2): boolean {
  return head.format === 'tackbok-device-head' && head.formatVersion === 2 &&
    typeof head.vaultId === 'string' && typeof head.deviceId === 'string' &&
    Number.isSafeInteger(head.deviceSequence) && head.deviceSequence >= 0 &&
    /^[0-9a-f]{64}$/.test(head.snapshotId) &&
    Number.isSafeInteger(head.updatedAt) && head.updatedAt >= 0;
}

export class SnapshotV2SyncEngine {
  private running = false;

  constructor(
    private readonly vaultId: string,
    private readonly deviceId: string,
    private readonly stateStore: SQLiteV2SyncStateStore,
    private readonly shadowManager: BaseShadowManagerV2,
    private readonly journal: SnapshotV2JournalStore,
    private readonly mediaStore: SnapshotV2MediaStore,
    private readonly provider: SnapshotV2Provider,
    private readonly hooks: V2SyncHooks = {},
    private readonly now: () => number = Date.now,
  ) {}

  async sync(): Promise<V2SyncResult> {
    if (this.running) throw new Error('A protocol-v2 sync pass is already running');
    this.running = true;
    try {
      return await this.syncExclusive();
    } catch (error) {
      return this.handleExpectedFailure(error);
    } finally {
      this.running = false;
    }
  }

  private async syncExclusive(): Promise<V2SyncResult> {
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
        await this.reapOldShadows();
        await this.cleanupSnapshots();
        this.stateStore.clearPause(this.vaultId, this.deviceId);
        return { status: 'up-to-date', actionableChanges: 0 };
      }
      pending = this.stateStore.createPending(
        this.vaultId,
        this.deviceId,
        plan.capturedGeneration,
        (deviceSequence) => {
          const encoded = encodeSnapshotV2({
            format: 'tackbok-snapshot',
            formatVersion: 2,
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

    await this.resumePending(pending);
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
      const frontier = this.activeFrontier(remoteHeads);
      if (frontier.length > 8) {
        throw new AttentionError('frontier-too-wide', 'active-parent-cap');
      }

      const accepted = loadedBase.shadow?.acceptedDeviceHeads ?? [];
      const covered = this.headsCovered(remoteHeads, accepted);
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
          ? this.remoteContainsBase(remote, loadedBase.shadow)
          : false;
        merged = mergeSnapshotDomainsV2(
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
      if (this.headSignature(remoteHeads) !== this.headSignature(rechecked)) continue;

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
    throw new V2ProviderError('transient', 'Heads changed during every bounded planning attempt');
  }

  private async loadAndNormalizeHeads(
    listed: ListedDeviceHeadV2[],
  ): Promise<RemoteHeadSnapshot[]> {
    const grouped = new Map<string, ListedDeviceHeadV2[]>();
    for (const candidate of listed) {
      if (candidate.head.format !== 'tackbok-device-head' ||
          candidate.head.formatVersion !== 2) {
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

    const normalized: ListedDeviceHeadV2[] = [];
    for (const values of grouped.values()) {
      const sequence = Math.max(...values.map((value) => value.head.deviceSequence));
      const greatest = values.filter((value) => value.head.deviceSequence === sequence);
      const unique = new Map(greatest.map((value) => [value.head.snapshotId, value]));
      if (unique.size > 1) {
        const valid: ListedDeviceHeadV2[] = [];
        for (const candidate of unique.values()) {
          const bytes = await this.provider.downloadSnapshot(this.vaultId, candidate.head.snapshotId);
          if (!bytes) continue;
          try {
            const decoded = decodeSnapshotV2(bytes, candidate.head.snapshotId);
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
      let payload: JournalSnapshotPayloadV2;
      try {
        payload = decodeSnapshotV2(bytes, candidate.head.snapshotId).payload;
      } catch (error) {
        const code = error instanceof SnapshotV2ValidationError ? error.code : 'unknown';
        if (error instanceof SnapshotV2ValidationError && code === 'invalid-literal' &&
            /^\$\.(format|formatVersion)\b/.test(error.message)) {
          throw new AttentionError('unsupported-format', 'remote-protocol-version');
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

  private activeFrontier(heads: RemoteHeadSnapshot[]): RemoteHeadSnapshot[] {
    return heads.filter((candidate) => !heads.some((observer) => {
      if (observer === candidate) return false;
      if (observer.payload.authorDeviceId === candidate.head.deviceId) {
        if (observer.payload.deviceSequence > candidate.head.deviceSequence) return true;
        if (observer.payload.deviceSequence === candidate.head.deviceSequence &&
            observer.snapshotId === candidate.snapshotId) return true;
      }
      const seen = observer.payload.observedDeviceHeads.find((value) =>
        value.deviceId === candidate.head.deviceId);
      return Boolean(seen && (seen.deviceSequence > candidate.head.deviceSequence ||
        (seen.deviceSequence === candidate.head.deviceSequence &&
         seen.snapshotId === candidate.snapshotId)));
    }));
  }

  private remoteContainsBase(remote: RemoteHeadSnapshot, base: BaseShadowV1): boolean {
    if (remote.snapshotId === base.snapshotId ||
        remote.payload.parentSnapshotIds.includes(base.snapshotId)) return true;
    const baseAuthor = base.payload.authorDeviceId;
    const baseSequence = base.payload.deviceSequence;
    if (remote.payload.authorDeviceId === baseAuthor &&
        remote.payload.deviceSequence > baseSequence) return true;
    const observed = remote.payload.observedDeviceHeads.find((value) =>
      value.deviceId === baseAuthor);
    return Boolean(observed && (observed.deviceSequence > baseSequence ||
      (observed.deviceSequence === baseSequence &&
       observed.snapshotId === base.snapshotId)));
  }

  private headsCovered(
    heads: RemoteHeadSnapshot[],
    accepted: ObservedDeviceHeadV2[],
  ): boolean {
    const known = observationMap(accepted);
    return heads.every((candidate) => {
      const value = known.get(candidate.head.deviceId);
      return Boolean(value && (value.deviceSequence > candidate.head.deviceSequence ||
        (value.deviceSequence === candidate.head.deviceSequence &&
         value.snapshotId === candidate.snapshotId)));
    });
  }

  private headSignature(heads: RemoteHeadSnapshot[]): string {
    return canonicalizeV2(heads.map(({ head }) => ({
      deviceId: head.deviceId,
      deviceSequence: head.deviceSequence,
      snapshotId: head.snapshotId,
    })));
  }

  private async synchronizeMedia(
    local: SnapshotDomainV2,
    remotes: RemoteHeadSnapshot[],
    merged: SnapshotDomainV2,
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
          if (!(error instanceof V2ProviderError) ||
              !['transient', 'rate-limited'].includes(error.code)) throw error;
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

  private async resumePending(initial: V2PendingPublication): Promise<void> {
    let pending = initial;
    let decoded: ReturnType<typeof decodeSnapshotV2>;
    try {
      decoded = decodeSnapshotV2(pending.compressedBytes, pending.snapshotId);
    } catch (error) {
      const code = error instanceof SnapshotV2ValidationError ? error.code : 'unknown';
      throw new AttentionError(
        'invalid-remote-snapshot',
        `local-candidate-validation-${code}`,
      );
    }
    if (decoded.payload.vaultId !== this.vaultId ||
        decoded.payload.authorDeviceId !== this.deviceId ||
        decoded.payload.deviceSequence !== pending.deviceSequence) {
      throw new AttentionError('invalid-remote-snapshot', 'local-candidate-envelope-mismatch');
    }

    if (pending.stage === 'candidate-persisted') {
      await this.ensurePendingMedia(pending);
      await this.provider.uploadSnapshot(
        this.vaultId,
        pending.snapshotId,
        pending.compressedBytes,
        decoded.payload.createdAt,
      );
      pending = this.stateStore.advancePending(
        this.vaultId, this.deviceId, pending.snapshotId, 'snapshot-uploaded');
      await this.hooks.at?.('after-snapshot-uploaded');
    }
    if (pending.stage === 'snapshot-uploaded') {
      const verified = await this.provider.verifySnapshot(
        this.vaultId,
        pending.snapshotId,
        pending.compressedBytes,
      );
      if (!verified) {
        throw new AttentionError('invalid-remote-snapshot', 'uploaded-snapshot-verification-failed');
      }
      pending = this.stateStore.advancePending(
        this.vaultId, this.deviceId, pending.snapshotId, 'snapshot-verified');
      await this.hooks.at?.('after-snapshot-verified');
    }
    if (pending.stage === 'snapshot-verified') {
      await this.provider.updateDeviceHead(this.vaultId, {
        format: 'tackbok-device-head',
        formatVersion: 2,
        vaultId: this.vaultId,
        deviceId: this.deviceId,
        deviceSequence: pending.deviceSequence,
        snapshotId: pending.snapshotId,
        updatedAt: this.now(),
      });
      pending = this.stateStore.advancePending(
        this.vaultId, this.deviceId, pending.snapshotId, 'head-advanced');
      await this.hooks.at?.('after-head-advanced');
    }
    if (pending.stage === 'head-advanced') {
      await this.applyPublishedDomain(
        domainOf(decoded.payload),
        pending.capturedGeneration,
      );
      await this.hooks.at?.('during-merge-application');
      pending = this.stateStore.advancePending(
        this.vaultId, this.deviceId, pending.snapshotId, 'domain-applied');
    }
    if (pending.stage === 'domain-applied') {
      const acceptedDeviceHeads = normalizeObservations([
        ...decoded.payload.observedDeviceHeads,
        {
          deviceId: this.deviceId,
          deviceSequence: pending.deviceSequence,
          snapshotId: pending.snapshotId,
        },
      ]);
      const shadow: BaseShadowV1 = {
        format: 'tackbok-base-shadow',
        shadowFormatVersion: 1,
        protocolFormatVersion: 2,
        vaultId: this.vaultId,
        snapshotId: pending.snapshotId,
        acceptedDeviceHeads,
        payload: decoded.payload,
      };
      let checkpoint;
      try {
        checkpoint = await this.shadowManager.prepareAndReplace(
          this.deviceId,
          pending.capturedGeneration,
          shadow,
          this.hooks.at,
        );
      } catch (error) {
        if (error instanceof BaseShadowCommitError) {
          throw new AttentionError('local-storage-full', 'base-shadow-commit-failed');
        }
        throw error;
      }
      try {
        this.stateStore.settleWithBase(checkpoint, pending.capturedGeneration);
      } catch {
        throw new AttentionError('local-storage-full', 'base-shadow-checkpoint-failed');
      }
      await this.hooks.at?.('after-base-checkpoint-settled');
      await this.reapOldShadows();
      await this.cleanupSnapshots();
    }
  }

  /**
   * A publication can outlive the journal generation it captured. A failed
   * CAS therefore cannot be treated as "the late local edit won": the
   * published domain may also contain remote-authored state that the journal
   * has never materialized. Reconcile that complete published state with a
   * fresh journal capture before allowing the base shadow to advance.
   *
   * The previous base remains authoritative until settlement. It gives the
   * merge the ancestry needed to preserve both late local edits and the
   * remote-derived part of the publication. If the shadow is unavailable,
   * the codec's conservative two-way merge is the safe fallback. Repeated
   * writers leave the head-advanced pending record intact for a later pass.
   */
  private async applyPublishedDomain(
    publishedDomain: SnapshotDomainV2,
    capturedGeneration: number,
  ): Promise<void> {
    if (await this.journal.applyMergedIfGeneration(
      publishedDomain,
      capturedGeneration,
    )) return;

    const checkpoint = this.stateStore.loadBaseCheckpoint(this.vaultId, this.deviceId);
    const loadedBase = await this.shadowManager.load(checkpoint);
    const baseDomain = loadedBase.shadow ? domainOf(loadedBase.shadow.payload) : null;

    for (let attempt = 0; attempt < MAX_JOURNAL_RECONCILIATION_ATTEMPTS; attempt += 1) {
      const latest = await this.journal.capture();
      const reconciled = mergeSnapshotDomainsV2(
        baseDomain,
        latest.domain,
        publishedDomain,
      );
      if (await this.journal.applyMergedIfGeneration(
        reconciled,
        latest.generation,
      )) return;
    }

    throw new RetryableSyncError('journal-changed-during-publication-reconciliation');
  }

  private async ensurePendingMedia(pending: V2PendingPublication): Promise<void> {
    const remotelyPresent = await this.provider.hasMediaBatch(
      this.vaultId,
      pending.mediaHashes,
    );
    for (const blobHash of pending.mediaHashes) {
      if (remotelyPresent.has(blobHash)) continue;
      const source = await this.mediaStore.openVerifiedSource(blobHash);
      if (!source) {
        throw new AttentionError('missing-media', 'pending-media-unavailable');
      }
      if (source.contentHash !== blobHash) {
        throw new AttentionError('local-media-unreadable', 'pending-media-hash-mismatch');
      }
      await this.provider.uploadMedia(this.vaultId, blobHash, source);
      await this.hooks.at?.('during-media-transfer');
    }
  }

  private async reapOldShadows(): Promise<void> {
    for (const fileName of this.stateStore.listShadowReaperFiles()) {
      try {
        await this.shadowManager.reap(fileName);
        this.stateStore.completeShadowReap(fileName);
      } catch {
        // The new checkpoint already committed. A later pass retries cleanup.
      }
    }
  }

  private async cleanupSnapshots(): Promise<void> {
    try {
      const heads = await this.provider.listHeads(this.vaultId, false);
      // Multiple logical heads may still represent unresolved branches. V7-2
      // chooses leakage over deleting lineage it cannot yet prove redundant.
      const logicalDevices = new Set(heads.map((value) => value.head.deviceId));
      if (logicalDevices.size > 1) return;
      const snapshots = await this.provider.listSnapshots(this.vaultId);
      const newest = [...snapshots]
        .sort((left, right) => right.createdAt - left.createdAt ||
          right.snapshotId.localeCompare(left.snapshotId))
        .slice(0, RETENTION_COUNT);
      const protectedIds = new Set([
        ...heads.map((value) => value.head.snapshotId),
        ...newest.map((value) => value.snapshotId),
      ]);
      for (const snapshot of snapshots) {
        if (protectedIds.has(snapshot.snapshotId) ||
            this.now() - snapshot.createdAt < CLEANUP_GRACE_MS) continue;
        await this.hooks.at?.('during-snapshot-cleanup');
        await this.provider.deleteSnapshot(this.vaultId, snapshot.snapshotId);
      }
    } catch (error) {
      if (!(error instanceof V2ProviderError)) throw error;
      // Cleanup is best effort: provider failure retains excess history.
    }
  }

  private handleExpectedFailure(error: unknown): V2SyncResult {
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
    if (error instanceof SnapshotV2MergeError) {
      const reason = error.code === 'derived-id-collision'
        ? 'derived-id-collision'
        : 'invalid-remote-snapshot';
      this.stateStore.setPause(this.vaultId, this.deviceId, reason, `merge-${error.code}`);
      return { status: 'attention', reason, actionableChanges: remaining };
    }
    if (error instanceof V2LocalStorageError) {
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
    if (error instanceof V2ProviderError) {
      const attention = this.providerAttentionReason(error.code);
      if (attention) {
        this.stateStore.setPause(this.vaultId, this.deviceId, attention, `provider-${error.code}`);
        return { status: 'attention', reason: attention, actionableChanges: remaining };
      }
      this.stateStore.setRetryError(this.vaultId, this.deviceId, `provider-${error.code}`);
      return {
        status: 'retry',
        reason: error.code === 'rate-limited' ? 'rate-limited' : 'transient',
        actionableChanges: remaining,
      };
    }
    if (error instanceof RetryableSyncError) {
      this.stateStore.setRetryError(this.vaultId, this.deviceId, error.errorClass);
      return { status: 'retry', reason: 'transient', actionableChanges: remaining };
    }
    throw error;
  }

  private providerAttentionReason(code: V2ProviderErrorCode): V2AttentionReason | null {
    if (code === 'authorization-required') return 'authorization-required';
    if (code === 'quota-full') return 'provider-quota-full';
    if (code === 'permission-denied') return 'provider-permission-denied';
    if (code === 'invalid-data') return 'invalid-remote-snapshot';
    return null;
  }
}
