import { SnapshotValidationError } from '../caps';
import { decodeSnapshot } from '../codec';
import { mergeSnapshotDomains } from '../merge';
import type { ObservedDeviceHead, SnapshotDomain } from '../types';
import { BaseShadowCommitError, BaseShadowManager } from './baseShadow';
import { restoreDeferredMedia } from './deferredMedia';
import { AttentionError, RetryableSyncError } from './errors';
import {
  domainOf,
  includesOtherDevices,
  normalizeObservations,
  type RemoteHeadSnapshot,
} from './frontier';
import { SQLiteSyncStateStore } from './sqliteState';
import type {
  BaseShadow,
  MediaUploadSource,
  PendingPublication,
  SnapshotJournalStore,
  SnapshotMediaStore,
  SnapshotProvider,
  SnapshotSyncHooks,
} from './types';

const MAX_JOURNAL_RECONCILIATION_ATTEMPTS = 4;

function isDatabaseBusy(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked|database is busy|cannot start a transaction/i.test(message);
}

function isStorageFull(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ENOSPC|no space left|disk.*full|storage.*full/i.test(message);
}

export interface SnapshotPublisherOptions {
  vaultId: string;
  deviceId: string;
  stateStore: SQLiteSyncStateStore;
  shadowManager: BaseShadowManager;
  journal: SnapshotJournalStore;
  mediaStore: SnapshotMediaStore;
  provider: SnapshotProvider;
  hooks: SnapshotSyncHooks;
  now(): number;
  afterSettlement(): Promise<void>;
}

export class SnapshotPublisher {
  constructor(private readonly options: SnapshotPublisherOptions) {}

  /**
   * `appliedDomain` is the remote's journal plus any local attachments still
   * waiting for Wi-Fi; it defaults to the remote's journal.
   */
  async adopt(
    remote: RemoteHeadSnapshot,
    acceptedDeviceHeads: ObservedDeviceHead[],
    capturedGeneration: number,
    appliedDomain: SnapshotDomain = domainOf(remote.payload),
  ): Promise<void> {
    const { deviceId, journal, hooks, vaultId } = this.options;
    hooks.activity?.('applying-remote-snapshot');
    hooks.progress?.({ type: 'phase', phase: 'merging' });
    // A concurrent edit invalidates the plan. Re-plan on retry rather than
    // overwriting it or marking a generation that was never backed up settled.
    if (
      !(await journal.applyMergedIfGeneration(appliedDomain, capturedGeneration, {
        remoteDerived: includesOtherDevices(remote.payload, deviceId),
      }))
    ) {
      throw new RetryableSyncError('journal-changed-during-remote-adoption');
    }
    await hooks.at?.('during-merge-application');
    await this.commitBase(
      {
        format: 'tackbok-base-shadow',
        vaultId,
        snapshotId: remote.snapshotId,
        payload: remote.payload,
        acceptedDeviceHeads,
      },
      capturedGeneration,
      false,
    );
  }

  /**
   * Returns false when a not-yet-uploaded candidate was planned against heads
   * that have since changed. It is discarded and the caller must re-plan.
   * `plannedDomain` is the whole merge planned in this pass, waiting
   * attachments included; without it they are recovered from the journal.
   */
  async resume(
    initial: PendingPublication,
    plannedDomain?: SnapshotDomain,
  ): Promise<boolean> {
    const { deviceId, hooks, provider, stateStore, vaultId } = this.options;
    let pending = initial;
    let decoded: ReturnType<typeof decodeSnapshot>;
    try {
      decoded = decodeSnapshot(pending.compressedBytes, pending.snapshotId);
    } catch (error) {
      const code = error instanceof SnapshotValidationError ? error.code : 'unknown';
      throw new AttentionError(
        'normalized-model-not-ready',
        `local-candidate-validation-${code}`,
      );
    }
    if (
      decoded.payload.vaultId !== vaultId ||
      decoded.payload.authorDeviceId !== deviceId ||
      decoded.payload.deviceSequence !== pending.deviceSequence
    ) {
      throw new AttentionError(
        'normalized-model-not-ready',
        'local-candidate-envelope-mismatch',
      );
    }

    // Report direction explicitly: a resumed publication starts at any stage
    // and must read as saving, never as the downloads checked on the way.
    if (pending.stage === 'candidate-persisted') {
      await this.ensurePendingMedia(pending);
      // A candidate can wait across suspension or process death. If another
      // device published meanwhile, uploading it would overwrite that work.
      // Before upload nothing remote references it, so re-planning is safe.
      if (await this.headsChangedSince(decoded.payload.observedDeviceHeads)) {
        stateStore.discardPending(vaultId, deviceId, pending.snapshotId);
        return false;
      }
      hooks.activity?.('publishing-local-snapshot');
      hooks.progress?.({
        type: 'plan',
        phase: 'uploading',
        bytesTotal: pending.compressedBytes.byteLength,
      });
      await provider.uploadSnapshot(
        vaultId,
        pending.snapshotId,
        pending.compressedBytes,
        decoded.payload.createdAt,
      );
      pending = stateStore.advancePending(
        vaultId,
        deviceId,
        pending.snapshotId,
        'snapshot-uploaded',
      );
      await hooks.at?.('after-snapshot-uploaded');
    }
    if (pending.stage === 'snapshot-uploaded') {
      hooks.activity?.('publishing-local-snapshot');
      hooks.progress?.({ type: 'phase', phase: 'uploading' });
      const verified = await provider.verifySnapshot(
        vaultId,
        pending.snapshotId,
        pending.compressedBytes,
      );
      if (!verified) {
        throw new AttentionError(
          'invalid-remote-snapshot',
          'uploaded-snapshot-verification-failed',
        );
      }
      pending = stateStore.advancePending(
        vaultId,
        deviceId,
        pending.snapshotId,
        'snapshot-verified',
      );
      await hooks.at?.('after-snapshot-verified');
    }
    if (pending.stage === 'snapshot-verified') {
      hooks.activity?.('publishing-local-snapshot');
      hooks.progress?.({ type: 'phase', phase: 'uploading' });
      await provider.updateDeviceHead(vaultId, {
        format: 'tackbok-device-head',
        vaultId,
        deviceId,
        deviceSequence: pending.deviceSequence,
        snapshotId: pending.snapshotId,
        updatedAt: this.options.now(),
      });
      pending = stateStore.advancePending(
        vaultId,
        deviceId,
        pending.snapshotId,
        'head-advanced',
      );
      await hooks.at?.('after-head-advanced');
    }
    if (pending.stage === 'head-advanced') {
      hooks.activity?.('publishing-local-snapshot');
      hooks.progress?.({ type: 'phase', phase: 'uploading' });
      await this.applyPublishedDomain(
        domainOf(decoded.payload),
        plannedDomain,
        pending.capturedGeneration,
        includesOtherDevices(decoded.payload, deviceId),
      );
      await hooks.at?.('during-merge-application');
      pending = stateStore.advancePending(
        vaultId,
        deviceId,
        pending.snapshotId,
        'domain-applied',
      );
    }
    if (pending.stage === 'domain-applied') {
      const acceptedDeviceHeads = normalizeObservations([
        ...decoded.payload.observedDeviceHeads,
        {
          deviceId,
          deviceSequence: pending.deviceSequence,
          snapshotId: pending.snapshotId,
        },
      ]);
      const shadow: BaseShadow = {
        format: 'tackbok-base-shadow',
        vaultId,
        snapshotId: pending.snapshotId,
        acceptedDeviceHeads,
        payload: decoded.payload,
      };
      await this.commitBase(shadow, pending.capturedGeneration, true);
    }
    return true;
  }

  private async commitBase(
    shadow: BaseShadow,
    capturedGeneration: number,
    publication: boolean,
  ): Promise<void> {
    const { deviceId, hooks, stateStore, vaultId } = this.options;
    let checkpoint;
    try {
      checkpoint = await this.options.shadowManager.prepareAndReplace(
        deviceId,
        capturedGeneration,
        shadow,
        hooks.at,
      );
    } catch (error) {
      if (error instanceof BaseShadowCommitError) {
        throw new AttentionError('local-storage-full', 'base-shadow-commit-failed');
      }
      throw error;
    }
    try {
      if (publication) stateStore.settleWithBase(checkpoint, capturedGeneration);
      else stateStore.settlePulledBase(checkpoint, capturedGeneration);
    } catch (error) {
      if (isDatabaseBusy(error)) {
        throw new RetryableSyncError('base-shadow-checkpoint-database-busy');
      }
      if (isStorageFull(error)) {
        throw new AttentionError(
          'local-storage-full',
          'base-shadow-checkpoint-storage-full',
        );
      }
      throw new AttentionError(
        'cleanup-inconsistent',
        'base-shadow-checkpoint-inconsistent',
      );
    }
    await hooks.at?.('after-base-checkpoint-settled');
    stateStore.clearPause(vaultId, deviceId);
    await this.options.afterSettlement();
  }

  /**
   * Reconciles remote-derived published state with edits made after capture.
   * Attachments left out of the publication for Wi-Fi stay in the journal.
   */
  private async applyPublishedDomain(
    publishedDomain: SnapshotDomain,
    plannedDomain: SnapshotDomain | undefined,
    capturedGeneration: number,
    remoteDerived: boolean,
  ): Promise<void> {
    const { deviceId, journal, shadowManager, stateStore, vaultId } = this.options;
    // The base is still the one this publication was merged against.
    let loaded: SnapshotDomain | null | undefined;
    const loadBase = async () => {
      if (loaded !== undefined) return loaded;
      const checkpoint = stateStore.loadBaseCheckpoint(vaultId, deviceId);
      const loadedBase = await shadowManager.load(checkpoint);
      loaded = loadedBase.shadow ? domainOf(loadedBase.shadow.payload) : null;
      return loaded;
    };
    let applied = plannedDomain;
    if (!applied) {
      // shortcut: a missing or damaged base restores every unpublished local
      // attachment, so one a remote deletion dropped comes back, as in any
      // merge without a base. Dropping them instead could delete new photos
      // that never reached Drive; upgrade if pending publications record
      // their deferred attachments.
      const captured = await journal.capture();
      applied =
        captured.generation === capturedGeneration
          ? restoreDeferredMedia(publishedDomain, captured.domain, await loadBase())
          : publishedDomain;
    }
    if (
      await journal.applyMergedIfGeneration(applied, capturedGeneration, {
        remoteDerived,
      })
    )
      return;

    // The merge below keeps local attachments the publication left out: the
    // base lacks them too, so they read as local additions.
    const baseDomain = await loadBase();

    for (let attempt = 0; attempt < MAX_JOURNAL_RECONCILIATION_ATTEMPTS; attempt += 1) {
      const latest = await journal.capture();
      // Keep the fresh capture's provenance: an unrelated local edit must not
      // turn a quiet first-join adoption into a conflict.
      const reconciled = mergeSnapshotDomains(
        baseDomain,
        latest.domain,
        publishedDomain,
        {
          localProfilePristine: latest.localProfilePristine,
        },
      );
      if (
        await journal.applyMergedIfGeneration(reconciled, latest.generation, {
          remoteDerived,
        })
      )
        return;
    }

    throw new RetryableSyncError('journal-changed-during-publication-reconciliation');
  }

  /**
   * Whether another device published after this candidate was planned. A
   * same-sequence head with a different snapshot only counts when that snapshot
   * is valid: planning ignores invalid retry duplicates, but stops on a valid
   * one as an ambiguous head, so re-planning must surface it.
   */
  private async headsChangedSince(observed: ObservedDeviceHead[]): Promise<boolean> {
    const { provider, vaultId } = this.options;
    const seen = new Map(observed.map((value) => [value.deviceId, value]));
    for (const { head } of await provider.listHeads(vaultId, true)) {
      const known = seen.get(head.deviceId);
      if (!known || head.deviceSequence > known.deviceSequence) return true;
      if (
        head.deviceSequence === known.deviceSequence &&
        head.snapshotId !== known.snapshotId &&
        (await this.isValidRemoteSnapshot(head.snapshotId))
      ) {
        return true;
      }
    }
    return false;
  }

  private async isValidRemoteSnapshot(snapshotId: string): Promise<boolean> {
    const { hooks, provider, vaultId } = this.options;
    hooks.activity?.('reading-remote-snapshot');
    const bytes = await provider.downloadSnapshot(vaultId, snapshotId);
    if (!bytes) return false;
    try {
      return decodeSnapshot(bytes, snapshotId).payload.vaultId === vaultId;
    } catch {
      return false;
    }
  }

  private async ensurePendingMedia(pending: PendingPublication): Promise<void> {
    const { hooks, mediaStore, provider, vaultId } = this.options;
    const remotelyPresent = await provider.hasMediaBatch(vaultId, pending.mediaHashes);
    // Open every source before the first upload, so progress knows the totals.
    const uploads: { blobHash: string; source: MediaUploadSource }[] = [];
    for (const blobHash of pending.mediaHashes) {
      if (remotelyPresent.has(blobHash)) continue;
      const source = await mediaStore.openVerifiedSource(blobHash);
      if (!source) {
        throw new AttentionError('missing-media', 'pending-media-unavailable');
      }
      if (source.contentHash !== blobHash) {
        throw new AttentionError('local-media-unreadable', 'pending-media-hash-mismatch');
      }
      uploads.push({ blobHash, source });
      await hooks.at?.('during-media-inspection');
    }
    if (uploads.length > 0) {
      hooks.progress?.({
        type: 'plan',
        phase: 'uploading-media',
        items: { done: 0, total: uploads.length },
        bytesTotal: uploads.reduce((total, { source }) => total + source.byteLength, 0),
      });
    }
    for (const { blobHash, source } of uploads) {
      await provider.uploadMedia(vaultId, blobHash, source);
      hooks.progress?.({ type: 'item', phase: 'uploading-media' });
      await hooks.at?.('during-media-transfer');
    }
  }
}
