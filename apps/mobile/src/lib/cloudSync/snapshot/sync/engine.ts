import { SNAPSHOT_CAPS, SnapshotValidationError } from '../caps';
import { canonicalize } from '../canonical';
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
  commonAncestorDomain,
  domainOf,
  headSignature,
  headsCovered,
  isHeadShapeValid,
  normalizeObservations,
  remoteContainsBase,
  type RemoteHeadSnapshot,
  type SnapshotLineage,
} from './frontier';
import { SnapshotPublisher } from './publication';

const MAX_HEAD_RECHECKS = 4;
// A merge base older than the local base is found by walking retained
// parents, only while heads have diverged. Past any limit below, the merge
// uses an older verified common ancestor, or no base as before.
// shortcut: per sync pass (all re-plans included), at most 12 ancestor
// downloads (four devices publishing at once), 32 MiB transferred (two
// maximum-size snapshots) and 64 MiB of decoded JSON kept (one maximum-size
// snapshot, beside the heads); raise them once on-device memory and data
// measurements show larger vaults regularly fall back to a no-base merge.
const MAX_ANCESTOR_DEPTH = 4;
const MAX_ANCESTOR_DOWNLOADS = 12;
const MAX_ANCESTOR_COMPRESSED_BYTES = 2 * SNAPSHOT_CAPS.compressedBytes;
const MAX_ANCESTOR_DECODED_BYTES = SNAPSHOT_CAPS.uncompressedBytes;

/** Shared by every plan in one sync pass, so re-planning cannot reset it. */
interface AncestorBudget {
  downloads: number;
  compressedBytes: number;
  decodedBytes: number;
}

/**
 * A valid snapshot is one gzip member, so its last four bytes state the
 * uncompressed size. Decoding rejects a wrong value, so it is safe to charge
 * before the expensive decode.
 */
function statedUncompressedBytes(bytes: Uint8Array): number {
  if (bytes.length < 4) return 0;
  const end = bytes.length;
  return (
    (bytes[end - 4] | (bytes[end - 3] << 8) | (bytes[end - 2] << 16)) +
    bytes[end - 1] * 0x1000000
  );
}

interface PlannedCandidate {
  existingSnapshot?: RemoteHeadSnapshot;
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

    // Content-addressed payloads cannot change under the same hash. Reuse only
    // successfully decoded payloads during this pass; later syncs verify anew.
    const verifiedSnapshots = new Map<string, JournalSnapshotPayload>();
    const ancestorBudget: AncestorBudget = {
      downloads: MAX_ANCESTOR_DOWNLOADS,
      compressedBytes: MAX_ANCESTOR_COMPRESSED_BYTES,
      decodedBytes: MAX_ANCESTOR_DECODED_BYTES,
    };
    let pending = this.stateStore.loadPending(this.vaultId, this.deviceId);
    for (let attempt = 0; attempt < MAX_HEAD_RECHECKS; attempt += 1) {
      if (!pending) {
        if (durable.journalGeneration > durable.settledGeneration) {
          this.hooks.activity?.('preparing-local-changes');
          await this.hooks.at?.('after-local-mutation');
        }
        const plan = await this.planCandidate(verifiedSnapshots, ancestorBudget);
        if (!plan) {
          await this.cleanup.run();
          this.stateStore.clearPause(this.vaultId, this.deviceId);
          return { status: 'up-to-date', actionableChanges: 0 };
        }
        if (plan.existingSnapshot) {
          await this.publisher.adopt(
            plan.existingSnapshot,
            plan.observedDeviceHeads,
            plan.capturedGeneration,
          );
          const settled = this.stateStore.loadState(this.vaultId, this.deviceId);
          return {
            status: 'pulled',
            snapshotId: plan.existingSnapshot.snapshotId,
            actionableChanges: actionableChanges(
              settled.journalGeneration,
              settled.settledGeneration,
            ),
          };
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

      if (!(await this.publisher.resume(pending))) {
        // The candidate went stale before upload; its data is still local.
        pending = null;
        continue;
      }
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
    throw new SnapshotProviderError(
      'transient',
      'Heads changed before every bounded candidate upload attempt',
    );
  }

  private async planCandidate(
    verifiedSnapshots: Map<string, JournalSnapshotPayload>,
    ancestorBudget: AncestorBudget,
  ): Promise<PlannedCandidate | null> {
    for (let attempt = 0; attempt < MAX_HEAD_RECHECKS; attempt += 1) {
      const listed = await this.provider.listHeads(this.vaultId, true);
      const remoteHeads = await this.loadAndNormalizeHeads(listed, verifiedSnapshots);
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
      if (
        loadedBase.shadow &&
        covered &&
        durable.journalGeneration <= durable.settledGeneration
      ) {
        return null;
      }

      let merged = captured.domain;
      // Snapshots the merged journal provably contains: the local base, each
      // remote merged so far, and their retained ancestors when needed.
      const history = new Map<string, SnapshotLineage>();
      const tips: SnapshotLineage[] = [];
      const walked = new Set<string>();
      if (loadedBase.shadow) {
        history.set(loadedBase.shadow.snapshotId, loadedBase.shadow);
        tips.push(loadedBase.shadow);
      }
      for (const remote of frontier.sort((left, right) =>
        left.snapshotId.localeCompare(right.snapshotId),
      )) {
        if (loadedBase.shadow?.snapshotId === remote.snapshotId) continue;
        // Merge against what both sides provably contain. The local base is
        // wrong for a concurrent remote: its changes would look like remote
        // deletions. Without a provable ancestor, merge with no base.
        // A fresh device has no local base, but each remote it merges still
        // becomes shared history for the next one.
        for (const tip of tips) {
          if (walked.has(tip.snapshotId) || remoteContainsBase(remote, tip)) continue;
          walked.add(tip.snapshotId);
          for (const ancestor of await this.loadAncestors(
            tip.payload,
            verifiedSnapshots,
            ancestorBudget,
          )) {
            history.set(ancestor.snapshotId, ancestor);
          }
        }
        const baseDomain = commonAncestorDomain(remote, [...history.values()]);
        history.set(remote.snapshotId, remote);
        tips.push(remote);
        merged = mergeSnapshotDomains(baseDomain, merged, domainOf(remote.payload));
      }

      await this.synchronizeMedia(captured.domain, frontier, merged, captured.generation);
      await this.hooks.beforeHeadRecheck?.();
      const rechecked = await this.loadAndNormalizeHeads(
        await this.provider.listHeads(this.vaultId, true),
        verifiedSnapshots,
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
      const mergedContent = canonicalize(merged);
      return {
        // Compare journal state, not snapshot IDs: sequence, author, parents and
        // observations change even when all user data is identical. A matching
        // complete snapshot is already a backup of this merge; acknowledge it
        // locally instead of starting an endless exchange of acknowledgments.
        existingSnapshot: frontier.find(
          (remote) => canonicalize(domainOf(remote.payload)) === mergedContent,
        ),
        domain: merged,
        capturedGeneration: captured.generation,
        parentSnapshotIds: [...new Set(parentSnapshotIds)].sort(),
        observedDeviceHeads: observed,
        mediaHashes: [...new Set(merged.media.map((asset) => asset.blobHash))].sort(),
      };
    }
    throw new SnapshotProviderError(
      'transient',
      'Heads changed during every bounded planning attempt',
    );
  }

  /**
   * Retained ancestors of a snapshot, nearest first. Retention cleanup may have
   * deleted some; a missing, damaged or over-budget snapshot only ends that
   * line of history, so the caller falls back to an older or no base instead
   * of failing. Authorization and transient provider errors still propagate.
   */
  private async loadAncestors(
    descendant: JournalSnapshotPayload,
    verifiedSnapshots: Map<string, JournalSnapshotPayload>,
    budget: AncestorBudget,
  ): Promise<SnapshotLineage[]> {
    const ancestors: SnapshotLineage[] = [];
    const visited = new Set<string>();
    let generation = descendant.parentSnapshotIds;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && generation.length > 0; depth += 1) {
      const next: string[] = [];
      for (const snapshotId of [...generation].sort()) {
        if (visited.has(snapshotId)) continue;
        visited.add(snapshotId);
        let payload = verifiedSnapshots.get(snapshotId);
        if (!payload) {
          // Reserve a maximum-size transfer: its size is unknown until it ends.
          if (
            budget.downloads <= 0 ||
            budget.compressedBytes < SNAPSHOT_CAPS.compressedBytes
          ) {
            continue;
          }
          budget.downloads -= 1;
          // Charge the reservation up front: a damaged transfer may be fully
          // received before the provider rejects it. Refund what goes unused.
          budget.compressedBytes -= SNAPSHOT_CAPS.compressedBytes;
          let bytes: Uint8Array | null;
          try {
            this.hooks.activity?.('reading-remote-snapshot');
            bytes = await this.provider.downloadSnapshot(this.vaultId, snapshotId);
          } catch (error) {
            // Damaged bytes (checksum, size, conflicting copies) of an optional
            // ancestor must not pause a sync whose heads are all valid.
            if (error instanceof SnapshotProviderError && error.code === 'invalid-data') {
              continue;
            }
            throw error;
          }
          await this.hooks.at?.('during-remote-snapshot-download');
          budget.compressedBytes += SNAPSHOT_CAPS.compressedBytes - (bytes?.length ?? 0);
          if (!bytes) continue;
          const decodedBytes = statedUncompressedBytes(bytes);
          if (decodedBytes > budget.decodedBytes) continue;
          try {
            payload = decodeSnapshot(bytes, snapshotId).payload;
          } catch {
            continue;
          }
          budget.decodedBytes -= decodedBytes;
          if (payload.vaultId !== this.vaultId) continue;
          verifiedSnapshots.set(snapshotId, payload);
        }
        ancestors.push({ snapshotId, payload });
        next.push(...payload.parentSnapshotIds);
      }
      generation = next;
    }
    return ancestors;
  }

  private async loadAndNormalizeHeads(
    listed: ListedDeviceHead[],
    verifiedSnapshots: Map<string, JournalSnapshotPayload>,
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
          this.hooks.activity?.('reading-remote-snapshot');
          const bytes = await this.provider.downloadSnapshot(
            this.vaultId,
            candidate.head.snapshotId,
          );
          if (!bytes) continue;
          try {
            const decoded = decodeSnapshot(bytes, candidate.head.snapshotId);
            if (decoded.payload.vaultId === this.vaultId) valid.push(candidate);
          } catch {
            // A single valid retry-created duplicate can safely defeat invalid bytes.
          }
        }
        if (valid.length !== 1) {
          throw new AttentionError(
            'ambiguous-device-head',
            'same-sequence-different-snapshot',
          );
        }
        normalized.push(valid[0]);
      } else {
        normalized.push([...unique.values()][0]);
      }
    }

    const snapshots: RemoteHeadSnapshot[] = [];
    for (const candidate of normalized) {
      let payload = verifiedSnapshots.get(candidate.head.snapshotId);
      if (!payload) {
        this.hooks.activity?.('reading-remote-snapshot');
        const bytes = await this.provider.downloadSnapshot(
          this.vaultId,
          candidate.head.snapshotId,
        );
        await this.hooks.at?.('during-remote-snapshot-download');
        if (!bytes)
          throw new AttentionError('head-snapshot-missing', 'head-target-not-found');
        try {
          payload = decodeSnapshot(bytes, candidate.head.snapshotId).payload;
        } catch (error) {
          const code = error instanceof SnapshotValidationError ? error.code : 'unknown';
          if (
            error instanceof SnapshotValidationError &&
            code === 'invalid-literal' &&
            /^\$\.format\b/.test(error.message)
          ) {
            throw new AttentionError('unsupported-format', 'remote-format-version');
          }
          throw new AttentionError(
            'invalid-remote-snapshot',
            `snapshot-validation-${code}`,
          );
        }
        verifiedSnapshots.set(candidate.head.snapshotId, payload);
      }
      if (payload.vaultId !== this.vaultId) {
        throw new AttentionError('wrong-vault', 'snapshot-vault-mismatch');
      }
      if (
        payload.authorDeviceId !== candidate.head.deviceId ||
        payload.deviceSequence !== candidate.head.deviceSequence
      ) {
        throw new AttentionError('invalid-remote-snapshot', 'head-envelope-mismatch');
      }
      snapshots.push({
        head: candidate.head,
        snapshotId: candidate.head.snapshotId,
        payload,
      });
    }
    return snapshots.sort((left, right) =>
      left.head.deviceId.localeCompare(right.head.deviceId),
    );
  }

  private async synchronizeMedia(
    local: SnapshotDomain,
    remotes: RemoteHeadSnapshot[],
    merged: SnapshotDomain,
    capturedGeneration: number,
  ): Promise<void> {
    const localHashes = new Set(local.media.map((asset) => asset.blobHash));
    const remoteHashes = new Set(
      remotes.flatMap((remote) => remote.payload.media.map((asset) => asset.blobHash)),
    );
    const requiredHashes = [
      ...new Set(merged.media.map((asset) => asset.blobHash)),
    ].sort();
    const remotelyPresent = await this.provider.hasMediaBatch(
      this.vaultId,
      requiredHashes,
    );
    for (const blobHash of requiredHashes) {
      const remotePresent = remotelyPresent.has(blobHash);
      // An upload source already proves local availability. Do not hash the
      // same bytes first for hasVerified and then again to open the source.
      const source = remotePresent
        ? null
        : await this.mediaStore.openVerifiedSource(blobHash);
      const localPresent = remotePresent
        ? await this.mediaStore.hasVerified(blobHash)
        : source !== null;
      if (!remotePresent && localPresent) {
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
          if (
            !(error instanceof SnapshotProviderError) ||
            !['transient', 'rate-limited', 'wifi-only-media'].includes(error.code)
          )
            throw error;
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
      const reason =
        error.code === 'derived-id-collision'
          ? 'derived-id-collision'
          : 'normalized-model-not-ready';
      this.stateStore.setPause(
        this.vaultId,
        this.deviceId,
        reason,
        `merge-${error.code}`,
      );
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
        this.stateStore.setPause(
          this.vaultId,
          this.deviceId,
          attention,
          `provider-${error.code}`,
        );
        return { status: 'attention', reason: attention, actionableChanges: remaining };
      }
      this.stateStore.setRetryError(
        this.vaultId,
        this.deviceId,
        `provider-${error.code}`,
      );
      return {
        status: 'retry',
        reason:
          error.code === 'rate-limited'
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
      this.stateStore.setRetryError(
        this.vaultId,
        this.deviceId,
        'base-shadow-read-failed',
      );
      return { status: 'retry', reason: 'transient', actionableChanges: remaining };
    }
    throw error;
  }
}
