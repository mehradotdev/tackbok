import { SnapshotValidationError } from '../caps';
import { decodeSnapshot } from '../codec';
import { mergeSnapshotDomains } from '../merge';
import type { SnapshotDomain } from '../types';
import { BaseShadowCommitError, BaseShadowManager } from './baseShadow';
import { AttentionError, RetryableSyncError } from './errors';
import { domainOf, normalizeObservations } from './frontier';
import { SQLiteSyncStateStore } from './sqliteState';
import type {
  BaseShadow,
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

  async resume(initial: PendingPublication): Promise<void> {
    const { deviceId, hooks, provider, stateStore, vaultId } = this.options;
    let pending = initial;
    let decoded: ReturnType<typeof decodeSnapshot>;
    try {
      decoded = decodeSnapshot(pending.compressedBytes, pending.snapshotId);
    } catch (error) {
      const code = error instanceof SnapshotValidationError ? error.code : 'unknown';
      throw new AttentionError(
        'invalid-remote-snapshot',
        `local-candidate-validation-${code}`,
      );
    }
    if (decoded.payload.vaultId !== vaultId ||
        decoded.payload.authorDeviceId !== deviceId ||
        decoded.payload.deviceSequence !== pending.deviceSequence) {
      throw new AttentionError('invalid-remote-snapshot', 'local-candidate-envelope-mismatch');
    }

    if (pending.stage === 'candidate-persisted') {
      await this.ensurePendingMedia(pending);
      await provider.uploadSnapshot(
        vaultId,
        pending.snapshotId,
        pending.compressedBytes,
        decoded.payload.createdAt,
      );
      pending = stateStore.advancePending(
        vaultId, deviceId, pending.snapshotId, 'snapshot-uploaded');
      await hooks.at?.('after-snapshot-uploaded');
    }
    if (pending.stage === 'snapshot-uploaded') {
      const verified = await provider.verifySnapshot(
        vaultId,
        pending.snapshotId,
        pending.compressedBytes,
      );
      if (!verified) {
        throw new AttentionError('invalid-remote-snapshot', 'uploaded-snapshot-verification-failed');
      }
      pending = stateStore.advancePending(
        vaultId, deviceId, pending.snapshotId, 'snapshot-verified');
      await hooks.at?.('after-snapshot-verified');
    }
    if (pending.stage === 'snapshot-verified') {
      await provider.updateDeviceHead(vaultId, {
        format: 'tackbok-device-head',
        vaultId,
        deviceId,
        deviceSequence: pending.deviceSequence,
        snapshotId: pending.snapshotId,
        updatedAt: this.options.now(),
      });
      pending = stateStore.advancePending(
        vaultId, deviceId, pending.snapshotId, 'head-advanced');
      await hooks.at?.('after-head-advanced');
    }
    if (pending.stage === 'head-advanced') {
      await this.applyPublishedDomain(
        domainOf(decoded.payload),
        pending.capturedGeneration,
      );
      await hooks.at?.('during-merge-application');
      pending = stateStore.advancePending(
        vaultId, deviceId, pending.snapshotId, 'domain-applied');
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
      let checkpoint;
      try {
        checkpoint = await this.options.shadowManager.prepareAndReplace(
          deviceId,
          pending.capturedGeneration,
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
        stateStore.settleWithBase(checkpoint, pending.capturedGeneration);
      } catch (error) {
        if (isDatabaseBusy(error)) {
          throw new RetryableSyncError('base-shadow-checkpoint-database-busy');
        }
        if (isStorageFull(error)) {
          throw new AttentionError('local-storage-full', 'base-shadow-checkpoint-storage-full');
        }
        throw new AttentionError('cleanup-inconsistent', 'base-shadow-checkpoint-inconsistent');
      }
      await hooks.at?.('after-base-checkpoint-settled');
      await this.options.afterSettlement();
    }
  }

  /** Reconciles remote-derived published state with edits made after capture. */
  private async applyPublishedDomain(
    publishedDomain: SnapshotDomain,
    capturedGeneration: number,
  ): Promise<void> {
    const { deviceId, journal, shadowManager, stateStore, vaultId } = this.options;
    if (await journal.applyMergedIfGeneration(
      publishedDomain,
      capturedGeneration,
    )) return;

    const checkpoint = stateStore.loadBaseCheckpoint(vaultId, deviceId);
    const loadedBase = await shadowManager.load(checkpoint);
    const baseDomain = loadedBase.shadow ? domainOf(loadedBase.shadow.payload) : null;

    for (let attempt = 0; attempt < MAX_JOURNAL_RECONCILIATION_ATTEMPTS; attempt += 1) {
      const latest = await journal.capture();
      const reconciled = mergeSnapshotDomains(
        baseDomain,
        latest.domain,
        publishedDomain,
      );
      if (await journal.applyMergedIfGeneration(
        reconciled,
        latest.generation,
      )) return;
    }

    throw new RetryableSyncError('journal-changed-during-publication-reconciliation');
  }

  private async ensurePendingMedia(pending: PendingPublication): Promise<void> {
    const { hooks, mediaStore, provider, vaultId } = this.options;
    const remotelyPresent = await provider.hasMediaBatch(vaultId, pending.mediaHashes);
    for (const blobHash of pending.mediaHashes) {
      if (remotelyPresent.has(blobHash)) continue;
      const source = await mediaStore.openVerifiedSource(blobHash);
      if (!source) {
        throw new AttentionError('missing-media', 'pending-media-unavailable');
      }
      if (source.contentHash !== blobHash) {
        throw new AttentionError('local-media-unreadable', 'pending-media-hash-mismatch');
      }
      await provider.uploadMedia(vaultId, blobHash, source);
      await hooks.at?.('during-media-transfer');
    }
  }
}
