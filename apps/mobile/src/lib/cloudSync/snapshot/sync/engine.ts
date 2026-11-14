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
import { unpublishedEntryMedia, withoutDeferredMedia } from './deferredMedia';
import { SQLiteSyncStateStore } from './sqliteState';
import type {
  ListedDeviceHead,
  BaseShadowCheckpoint,
  MediaUploadSource,
  SnapshotJournalStore,
  SnapshotMediaStore,
  SnapshotProvider,
  SnapshotSyncHooks,
  SnapshotSyncResult,
} from './types';
import { isolateProgress, LocalStorageError, SnapshotProviderError } from './types';
import { attentionReasonForProviderError } from '../../failureClassification';
import { AttentionError, RetryableSyncError } from './errors';
import {
  activeFrontier,
  commonAncestorDomain,
  domainOf,
  headSignature,
  headsCovered,
  includesOtherDevices,
  isHeadShapeValid,
  normalizeObservations,
  remoteContainsBase,
  type RemoteHeadSnapshot,
  type SnapshotLineage,
} from './frontier';
import { SnapshotPublisher } from './publication';
import type { VerifiedSnapshotCache } from './snapshotCache';

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
 * uncompressed size. Damaged bytes can state any size, so this only skips an
 * honest snapshot that cannot fit before decoding it; the decoder itself
 * enforces the remaining allowance, and a successful decode verifies it.
 */
function statedUncompressedBytes(bytes: Uint8Array): number {
  if (bytes.length < 4) return 0;
  const end = bytes.length;
  return (
    (bytes[end - 4] | (bytes[end - 3] << 8) | (bytes[end - 2] << 16)) +
    bytes[end - 1] * 0x1000000
  );
}

/** Nothing to publish or apply, though attachments may still wait for Wi-Fi. */
interface UpToDate {
  upToDate: true;
  deferredMediaCount: number;
  /** Heads just listed with a refresh, which cleanup can reuse. */
  listedHeads?: ListedDeviceHead[];
}

/**
 * A pass that found nothing to do, and what it found that with. While the
 * base-shadow file, both generations and the remote heads stay the same, the
 * next pass would find the same, so it skips decoding the shadow and capturing
 * the journal. Only a full plan records one, so the shadow was verified and no
 * attachment was waiting for Wi-Fi. Journal changes that settle without a
 * generation bump (remote applies) also replace the base checkpoint.
 */
interface SettledPass {
  checkpoint: BaseShadowCheckpoint;
  shadowBytes: Uint8Array;
  acceptedDeviceHeads: ObservedDeviceHead[];
  journalGeneration: number;
  settledGeneration: number;
}

interface PlannedCandidate {
  existingSnapshot?: RemoteHeadSnapshot;
  /** What is published: the merge without the attachments waiting for Wi-Fi. */
  domain: SnapshotDomain;
  /** The whole merge, applied locally so waiting attachments stay. */
  appliedDomain: SnapshotDomain;
  /** Attachments left out of `domain` until Wi-Fi. */
  deferredMediaCount: number;
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
  private settledPass: SettledPass | null = null;
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
    /** Verified snapshots kept across passes; without it, each pass downloads anew. */
    private readonly snapshotCache?: VerifiedSnapshotCache,
  ) {
    this.hooks = { ...hooks, progress: isolateProgress(hooks.progress) };
    this.cleanup = new SnapshotCleanup({
      vaultId,
      stateStore,
      shadowManager,
      provider,
      hooks: this.hooks,
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
      hooks: this.hooks,
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

    // Content-addressed payloads cannot change under the same hash. Reuse
    // successfully decoded payloads during this pass, and from earlier passes
    // through the snapshot cache.
    const verifiedSnapshots = new Map<string, JournalSnapshotPayload>();
    const ancestorBudget: AncestorBudget = {
      downloads: MAX_ANCESTOR_DOWNLOADS,
      compressedBytes: MAX_ANCESTOR_COMPRESSED_BYTES,
      decodedBytes: MAX_ANCESTOR_DECODED_BYTES,
    };
    let pending = this.stateStore.loadPending(this.vaultId, this.deviceId);
    // Known only for a candidate planned in this pass; a resumed one recovers
    // its waiting attachments from the local journal.
    let appliedDomain: SnapshotDomain | undefined;
    let deferredMediaCount = 0;
    for (let attempt = 0; attempt < MAX_HEAD_RECHECKS; attempt += 1) {
      if (!pending) {
        if (durable.journalGeneration > durable.settledGeneration) {
          this.hooks.activity?.('preparing-local-changes');
          await this.hooks.at?.('after-local-mutation');
        }
        const plan = await this.planCandidate(verifiedSnapshots, ancestorBudget);
        if ('upToDate' in plan) {
          await this.cleanup.run(plan.listedHeads);
          this.stateStore.clearPause(this.vaultId, this.deviceId);
          return {
            status: 'up-to-date',
            actionableChanges: 0,
            deferredMediaCount: plan.deferredMediaCount,
          };
        }
        appliedDomain = plan.appliedDomain;
        deferredMediaCount = plan.deferredMediaCount;
        if (plan.existingSnapshot) {
          await this.publisher.adopt(
            plan.existingSnapshot,
            plan.observedDeviceHeads,
            plan.capturedGeneration,
            plan.appliedDomain,
          );
          const settled = this.stateStore.loadState(this.vaultId, this.deviceId);
          return {
            status: 'pulled',
            snapshotId: plan.existingSnapshot.snapshotId,
            actionableChanges: actionableChanges(
              settled.journalGeneration,
              settled.settledGeneration,
            ),
            deferredMediaCount,
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

      if (!(await this.publisher.resume(pending, appliedDomain))) {
        // The candidate went stale before upload; its data is still local.
        pending = null;
        continue;
      }
      this.stateStore.clearPause(this.vaultId, this.deviceId);
      durable = this.stateStore.loadState(this.vaultId, this.deviceId);
      // A publication resumed from an earlier pass was not planned here; what
      // it left out for Wi-Fi is what the journal holds beyond its snapshot.
      if (!appliedDomain) deferredMediaCount = await this.countUnpublishedMedia();
      return {
        status: 'published',
        snapshotId: pending.snapshotId,
        actionableChanges: actionableChanges(
          durable.journalGeneration,
          durable.settledGeneration,
        ),
        deferredMediaCount,
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
  ): Promise<PlannedCandidate | UpToDate> {
    for (let attempt = 0; attempt < MAX_HEAD_RECHECKS; attempt += 1) {
      this.hooks.progress?.({ type: 'plan', phase: 'checking' });
      const listed = await this.provider.listHeads(this.vaultId, true);
      const remoteHeads = await this.loadAndNormalizeHeads(
        listed,
        verifiedSnapshots,
        true,
      );
      const frontier = activeFrontier(remoteHeads);
      if (frontier.length > 8) {
        throw new AttentionError('frontier-too-wide', 'active-parent-cap');
      }
      const checkpoint = this.stateStore.loadBaseCheckpoint(this.vaultId, this.deviceId);
      if (await this.unchangedSinceSettledPass(checkpoint, remoteHeads)) {
        return { upToDate: true, deferredMediaCount: 0, listedHeads: listed };
      }
      this.settledPass = null;
      const loadedBase = await this.shadowManager.load(checkpoint);
      const captured = await this.journal.capture();
      const durable = this.stateStore.loadState(this.vaultId, this.deviceId);

      const accepted = loadedBase.shadow?.acceptedDeviceHeads ?? [];
      const covered = headsCovered(remoteHeads, accepted);
      const baseDomain = loadedBase.shadow ? domainOf(loadedBase.shadow.payload) : null;
      if (
        loadedBase.shadow &&
        covered &&
        durable.journalGeneration <= durable.settledGeneration &&
        // Attachments a publication left out for Wi-Fi are settled locally,
        // yet still to publish.
        unpublishedEntryMedia(captured.domain, baseDomain).length === 0
      ) {
        if (checkpoint && loadedBase.bytes) {
          this.settledPass = {
            checkpoint,
            shadowBytes: loadedBase.bytes,
            acceptedDeviceHeads: accepted,
            journalGeneration: durable.journalGeneration,
            settledGeneration: durable.settledGeneration,
          };
        }
        return { upToDate: true, deferredMediaCount: 0, listedHeads: listed };
      }

      this.hooks.progress?.({ type: 'plan', phase: 'merging' });
      let merged = captured.domain;
      // Only the captured local side carries local provenance. After the
      // first merge it holds remote content, which is never pristine.
      let localProfilePristine = captured.localProfilePristine;
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
        merged = mergeSnapshotDomains(baseDomain, merged, domainOf(remote.payload), {
          localProfilePristine,
        });
        localProfilePristine = false;
      }

      await this.journal.rememberRemoteConflicts?.(
        frontier.flatMap((remote) =>
          remote.payload.conflicts.map((conflict) => conflict.conflictId),
        ),
      );
      const deferredHashes = await this.synchronizeMedia(
        captured.domain,
        baseDomain,
        frontier,
        merged,
        captured.generation,
      );
      const published = withoutDeferredMedia(merged, deferredHashes);
      const deferredMediaCount = merged.media.length - published.media.length;
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
      const publishedContent = canonicalize(published);
      // Compare journal state, not snapshot IDs: sequence, author, parents and
      // observations change even when all user data is identical. A matching
      // complete snapshot is already a backup of this merge; acknowledge it
      // locally instead of starting an endless exchange of acknowledgments.
      const existingSnapshot = frontier.find(
        (remote) => canonicalize(domainOf(remote.payload)) === publishedContent,
      );
      // Only attachments waiting for Wi-Fi differ from the settled base: there
      // is nothing to publish or apply until they upload.
      if (
        deferredMediaCount > 0 &&
        covered &&
        existingSnapshot &&
        existingSnapshot.snapshotId === loadedBase.shadow?.snapshotId &&
        captured.generation <= durable.settledGeneration
      ) {
        return { upToDate: true, deferredMediaCount };
      }
      return {
        existingSnapshot,
        domain: published,
        appliedDomain: merged,
        deferredMediaCount,
        capturedGeneration: captured.generation,
        parentSnapshotIds: [...new Set(parentSnapshotIds)].sort(),
        observedDeviceHeads: observed,
        mediaHashes: [...new Set(published.media.map((asset) => asset.blobHash))].sort(),
      };
    }
    throw new SnapshotProviderError(
      'transient',
      'Heads changed during every bounded planning attempt',
    );
  }

  /** Whether the last settled pass still describes local and remote state. */
  private async unchangedSinceSettledPass(
    checkpoint: BaseShadowCheckpoint | null,
    remoteHeads: RemoteHeadSnapshot[],
  ): Promise<boolean> {
    const settled = this.settledPass;
    if (!settled || !checkpoint) return false;
    const durable = this.stateStore.loadState(this.vaultId, this.deviceId);
    return (
      checkpoint.fileName === settled.checkpoint.fileName &&
      checkpoint.canonicalSha256 === settled.checkpoint.canonicalSha256 &&
      checkpoint.byteCount === settled.checkpoint.byteCount &&
      checkpoint.committedGeneration === settled.checkpoint.committedGeneration &&
      durable.journalGeneration === settled.journalGeneration &&
      durable.settledGeneration === settled.settledGeneration &&
      headsCovered(remoteHeads, settled.acceptedDeviceHeads) &&
      (await this.shadowManager.fileMatches(checkpoint, settled.shadowBytes))
    );
  }

  private async countUnpublishedMedia(): Promise<number> {
    const checkpoint = this.stateStore.loadBaseCheckpoint(this.vaultId, this.deviceId);
    const loadedBase = await this.shadowManager.load(checkpoint);
    const captured = await this.journal.capture();
    return unpublishedEntryMedia(
      captured.domain,
      loadedBase.shadow ? domainOf(loadedBase.shadow.payload) : null,
    ).length;
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
        let payload = this.verifiedSnapshot(snapshotId, verifiedSnapshots);
        if (!payload) {
          // Reserve a maximum-size transfer: its size is unknown until it ends.
          if (
            budget.downloads <= 0 ||
            budget.compressedBytes < SNAPSHOT_CAPS.compressedBytes ||
            budget.decodedBytes <= 0
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
            payload = decodeSnapshot(bytes, snapshotId, budget.decodedBytes).payload;
          } catch {
            // The output a failed decode inflated is unknown, up to the whole
            // allowance: charge all of it rather than trust the stated size.
            budget.decodedBytes = 0;
            continue;
          }
          budget.decodedBytes -= decodedBytes;
          if (payload.vaultId !== this.vaultId) continue;
          verifiedSnapshots.set(snapshotId, payload);
          this.snapshotCache?.set(this.vaultId, snapshotId, payload, decodedBytes);
        }
        ancestors.push({ snapshotId, payload });
        next.push(...payload.parentSnapshotIds);
      }
      generation = next;
    }
    return ancestors;
  }

  /**
   * An ancestor already verified during this pass or an earlier one. A cached
   * entry was validated for this vault before it was stored. Ancestors are
   * optional merge bases, so a cached one may outlive its remote object; it is
   * not added to `verifiedSnapshots`, which head targets treat as present.
   */
  private verifiedSnapshot(
    snapshotId: string,
    verifiedSnapshots: Map<string, JournalSnapshotPayload>,
  ): JournalSnapshotPayload | undefined {
    return (
      verifiedSnapshots.get(snapshotId) ??
      this.snapshotCache?.get(this.vaultId, snapshotId)
    );
  }

  /**
   * Reuses cached head targets that the provider still lists. The cache saves
   * only the download: an absent target is evicted and read like an uncached
   * one, so a deleted backup still reports `head-snapshot-missing`.
   */
  private async reuseCachedHeadTargets(
    heads: ListedDeviceHead[],
    verifiedSnapshots: Map<string, JournalSnapshotPayload>,
  ): Promise<void> {
    if (!this.snapshotCache) return;
    const cached = new Map<string, JournalSnapshotPayload>();
    for (const { head } of heads) {
      if (verifiedSnapshots.has(head.snapshotId)) continue;
      const payload = this.snapshotCache.get(this.vaultId, head.snapshotId);
      if (payload) cached.set(head.snapshotId, payload);
    }
    if (cached.size === 0) return;
    // Heads were just listed with a refresh, so this reads the same fresh
    // inventory; Drive serves it from its state store without a request.
    const present = new Set(
      (await this.provider.listSnapshots(this.vaultId)).map(
        (snapshot) => snapshot.snapshotId,
      ),
    );
    for (const [snapshotId, payload] of cached) {
      if (present.has(snapshotId)) verifiedSnapshots.set(snapshotId, payload);
      else this.snapshotCache.delete(this.vaultId, snapshotId);
    }
  }

  /** `reportProgress` is false for the re-check, which normally reads nothing new. */
  private async loadAndNormalizeHeads(
    listed: ListedDeviceHead[],
    verifiedSnapshots: Map<string, JournalSnapshotPayload>,
    reportProgress = false,
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

    // Cached snapshots read as instant checks, not downloads.
    await this.reuseCachedHeadTargets(normalized, verifiedSnapshots);
    const unread = normalized.filter(
      (candidate) => !verifiedSnapshots.has(candidate.head.snapshotId),
    );
    if (reportProgress) {
      this.hooks.progress?.({
        type: 'plan',
        phase: 'checking',
        items: { done: normalized.length - unread.length, total: normalized.length },
      });
      if (unread.length > 0) {
        const sizes = unread.map((candidate) => candidate.snapshotBytes);
        this.hooks.progress?.({
          type: 'plan',
          phase: 'downloading',
          items: { done: 0, total: unread.length },
          // Bytes only when every size is known; otherwise count files.
          bytesTotal: sizes.every((size) => size !== undefined)
            ? sizes.reduce<number>((total, size) => total + size!, 0)
            : undefined,
        });
      }
    }

    const snapshots: RemoteHeadSnapshot[] = [];
    for (const candidate of normalized) {
      let payload = verifiedSnapshots.get(candidate.head.snapshotId);
      let downloadedBytes: number | null = null;
      if (!payload) {
        this.hooks.activity?.('reading-remote-snapshot');
        const bytes = await this.provider.downloadSnapshot(
          this.vaultId,
          candidate.head.snapshotId,
        );
        if (reportProgress) this.hooks.progress?.({ type: 'item', phase: 'downloading' });
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
        downloadedBytes = statedUncompressedBytes(bytes);
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
      // Keep it for later passes only once every check above has passed.
      if (downloadedBytes !== null) {
        this.snapshotCache?.set(
          this.vaultId,
          candidate.head.snapshotId,
          payload,
          downloadedBytes,
        );
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

  /**
   * Uploads the local media the merged journal needs and the provider lacks.
   * Remote media missing locally is not downloaded here: applying the journal
   * records it as a pending attachment, so a restore shows the text first and
   * the runtime hydrates the files afterwards. A blob counts as present only
   * when the provider reports it, so a published snapshot never references
   * media that neither side holds.
   *
   * When the provider refuses uploads until Wi-Fi, new local entry
   * attachments wait: their hashes are returned, and the caller publishes
   * without them. Media a snapshot already references, and profile photos,
   * still hold back the whole publication.
   */
  private async synchronizeMedia(
    local: SnapshotDomain,
    base: SnapshotDomain | null,
    remotes: RemoteHeadSnapshot[],
    merged: SnapshotDomain,
    capturedGeneration: number,
  ): Promise<Set<string>> {
    const localHashes = new Set(local.media.map((asset) => asset.blobHash));
    const remoteHashes = new Set(
      remotes.flatMap((remote) => remote.payload.media.map((asset) => asset.blobHash)),
    );
    // shortcut: a new profile photo is not deferrable, since leaving it out
    // would also change the profile; it waits for Wi-Fi with the journal as
    // before. Defer it too if users report profile edits stuck on cellular.
    const referencedHashes = new Set([
      ...remoteHashes,
      ...(base?.media ?? []).map((asset) => asset.blobHash),
      ...merged.media
        .filter((asset) => asset.ownerType !== 'entry')
        .map((asset) => asset.blobHash),
    ]);
    const newLocalHashes = new Set(
      unpublishedEntryMedia(local, base).map((asset) => asset.blobHash),
    );
    const deferrable = (blobHash: string) =>
      newLocalHashes.has(blobHash) && !referencedHashes.has(blobHash);
    const requiredHashes = [
      ...new Set(merged.media.map((asset) => asset.blobHash)),
    ].sort();
    const remotelyPresent = await this.provider.hasMediaBatch(
      this.vaultId,
      requiredHashes,
    );
    // Open every source before the first upload, so progress knows the totals.
    const uploads: { blobHash: string; source: MediaUploadSource }[] = [];
    // Opening a source hashes the whole file. Attachments that would only wait
    // for Wi-Fi are not read on every pass on mobile data.
    const waitForWifi =
      requiredHashes.some(
        (blobHash) => !remotelyPresent.has(blobHash) && deferrable(blobHash),
      ) && (await this.provider.mediaTransfersAllowed?.()) === false;
    const deferred = new Set<string>();
    for (const blobHash of requiredHashes) {
      if (remotelyPresent.has(blobHash)) continue;
      if (waitForWifi && deferrable(blobHash)) {
        deferred.add(blobHash);
        continue;
      }
      const source = await this.mediaStore.openVerifiedSource(blobHash);
      if (!source) {
        // Apply the already-validated logical journal before pausing. This
        // keeps a fresh text restore useful while still refusing to publish a
        // snapshot that references an absent remote blob.
        await this.journal.applyMergedIfGeneration(merged, capturedGeneration, {
          remoteDerived: remotes.some((remote) =>
            includesOtherDevices(remote.payload, this.deviceId),
          ),
        });
        throw new AttentionError(
          localHashes.has(blobHash) && !remoteHashes.has(blobHash)
            ? 'local-media-unreadable'
            : 'missing-media',
          'required-media-unavailable',
        );
      }
      if (source.contentHash !== blobHash) {
        throw new AttentionError('local-media-unreadable', 'local-media-hash-mismatch');
      }
      uploads.push({ blobHash, source });
      // Planning reads every file first; a cancelled pass stops between them.
      await this.hooks.at?.('during-media-inspection');
    }
    if (uploads.length > 0) {
      this.hooks.progress?.({
        type: 'plan',
        phase: 'uploading-media',
        items: { done: 0, total: uploads.length },
        bytesTotal: uploads.reduce((total, { source }) => total + source.byteLength, 0),
      });
    }
    // Media that cannot wait goes first, so a refusal stops the pass before
    // any attachment is deferred.
    uploads.sort(
      (left, right) =>
        Number(deferrable(left.blobHash)) - Number(deferrable(right.blobHash)),
    );
    const skippedUnread = deferred.size;
    for (const { blobHash, source } of uploads) {
      if (deferred.size > skippedUnread) {
        // The policy refused an earlier upload; the remaining ones wait too.
        deferred.add(blobHash);
        continue;
      }
      this.hooks.progress?.({ type: 'phase', phase: 'uploading-media' });
      try {
        await this.provider.uploadMedia(this.vaultId, blobHash, source);
      } catch (error) {
        if (
          error instanceof SnapshotProviderError &&
          error.code === 'wifi-only-media' &&
          deferrable(blobHash)
        ) {
          deferred.add(blobHash);
          continue;
        }
        throw error;
      }
      this.hooks.progress?.({ type: 'item', phase: 'uploading-media' });
      await this.hooks.at?.('during-media-transfer');
    }
    return deferred;
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
