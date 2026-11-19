/**
 * Cloud sync v2 engine (#185, P6). One pass:
 *
 * 1. Revocations ("Delete journal everywhere", "Delete backup") stop it.
 * 2. The local metadata is bound to this vault; the first pass with a vault
 *    (or with another one) rebuilds it under a new device ID
 *    (`rebuildSyncMetadataInTransaction`).
 * 3. Heads are listed and checked. A head of an unknown major version or
 *    with an unknown required feature pauses sync and asks for an update,
 *    before anything is downloaded, written or deleted.
 * 4. **Nothing changed**: every other device's head is one this device has
 *    already taken in, it has no unpublished write, its own head is where it
 *    left it and no attachment waits to publish. The pass ends without a
 *    capture, a download or an upload.
 * 5. New attachments whose blobs can upload are uploaded, then stamped
 *    (published). A stamped attachment always has its blob on the provider.
 * 6. Only heads that changed are downloaded. The local journal is captured,
 *    joined with them (`absorb`: no base, any order), acknowledged
 *    (`markSeen`) when this device will publish, compacted, and applied.
 * 7. It publishes when it has writes it has not published, has never
 *    published in this vault (it publishes as soon as it joins), lost its
 *    head, holds other devices' writes it last acknowledged more than a
 *    day ago (acknowledgements let compaction run; publishing one on every
 *    pull would double the uploads), or has just compacted deleted values
 *    (so its head stops holding them).
 *
 * Cleanup: after a publication, the heads of devices that left the active
 * roster (180 days) are pruned; after a publication or once a day, leftover
 * head files under this device's own ID go, then snapshots no head points
 * to, keeping one a day for 30 days (`retention.ts`). At most once a day, in
 * a pass that skipped no head, media blobs nothing has referred to for 30
 * days go (`mediaGc.ts`). Both count time by the provider's clock.
 *
 * Another device's head that cannot be read (a corrupt head file, a missing
 * or invalid snapshot, two snapshots under one sequence) or whose clock is
 * more than 7 days ahead is skipped while at least one readable head exists,
 * and listed for the user (`SkippedHead`). Nothing is deleted: removing
 * unreadable heads is a confirmed user action (`removeUnreadableHeads`).
 * With no readable head at all (not even this device's own, or a record
 * that it published here before), the pass pauses instead.
 *
 * The join has no base, so there is no ancestor walk, virtual base or base
 * shadow, and a publication needs no staged candidate: everything it uploads
 * is already applied locally, so a pass stopped half way publishes on the
 * next one.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';

import {
  mediaAssets,
  runExclusiveDbTransaction,
  syncDevice,
  syncHeads,
  syncRecords,
} from '~/db';

import { attentionReasonForProviderError } from '../../failureClassification';
import type { CloudSyncTransaction } from '../../storage/repositories';
import { parsePendingRetirements } from '../../storage/syncStamps';
import {
  applySyncState,
  captureSyncState,
  rebuildSyncMetadataInTransaction,
  stampPublishedAttachmentsInTransaction,
  unpublishedAttachmentsInTransaction,
  type ApplyMediaFiles,
} from '../../storage/v2State';
import { ClockAheadError, MAX_CONTEXT_AHEAD_MS } from '../../v2/clock';
import {
  KNOWN_REQUIRED_FEATURES,
  SNAPSHOT_MAJOR,
  SnapshotUpdateRequiredError,
  type CodecWork,
  SnapshotHashUnavailableError,
  decodeEnvelopeAsync,
  encodeEnvelopeAsync,
  jsCodecWork,
} from '../../v2/codec';
import {
  absorb,
  activeDevices,
  compact,
  retireDevice,
  retiredDevices,
} from '../../v2/compact';
import { SyncJoinError } from '../../v2/join';
import { markSeen, rewriteDates } from '../../v2/ops';
import { isLive } from '../../v2/view';
import type { Ext, SyncState, VersionVector } from '../../v2/types';
import { SnapshotValidationError } from '../caps';
import { canonicalize } from '../canonical';
import { AttentionError, RetryableSyncError, SyncCancelledError } from './errors';
import {
  entriesHidden,
  isMassDeletion,
  massDeletionToken,
  type MassDeletionChoice,
} from './massDeletion';
import {
  collectMedia,
  loadSnapshotMedia,
  recordSnapshotMedia,
  recordedSnapshotMedia,
} from './mediaGc';
import { snapshotsToDelete } from './retention';
import type { SQLiteSyncStateStore } from './sqliteState';
import {
  isolateProgress,
  LocalStorageError,
  SnapshotProviderError,
  type DeviceHead,
  type ListedDeviceHead,
  type MediaUploadSource,
  type SkippedHead,
  type SnapshotMediaStore,
  type SnapshotProvider,
  type SnapshotSyncHooks,
  type SnapshotSyncResult,
} from './types';

export const HEAD_FORMAT = 'tackbok-head';
/** How long other devices' writes may wait for this device's acknowledgement. */
export const ACK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Local writes during a pass make the apply refuse; it captures and joins again. */
const MAX_APPLY_ATTEMPTS = 4;
const MAX_DELETES_PER_PASS = 10;
/**
 * Attachment uploads in flight at once. Drive takes 2-3 s to create even a
 * small file, so one at a time a journal with 1,500 photos took over an hour
 * to back up the first time (#185 P14). Three in flight at that latency make
 * about one create a second, well under Drive's sustained limit of about
 * three writes a second per user; a create is not retried, so staying under
 * it matters.
 */
export const MEDIA_UPLOAD_CONCURRENCY = 3;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Media garbage collection that could not finish runs again after this long. */
const MEDIA_GC_RETRY_MS = 60 * 60 * 1000;
/**
 * How long this device's own listed head is taken as proof that the blobs
 * it refers to were never collected (`newlyReferenced`). Well inside the
 * 180 days after which a quiet device's head may be pruned.
 */
const OWN_HEAD_TRUSTED_MS = 150 * 24 * 60 * 60 * 1000;
/** A snapshot that could not be read is downloaded again after this long. */
const UNREADABLE_RETRY_MS = 24 * 60 * 60 * 1000;
/** A head whose snapshot was missing is read again after this long. */
const MISSING_RETRY_MS = 60 * 60 * 1000;
/**
 * The error class of the pause for "no head can be read": the only pause
 * "Replace this backup" is offered for, and one that retries by itself once
 * the listed heads change.
 */
export const NO_READABLE_HEAD = 'no-readable-device-head';
/** The error class of the pause for two head files at one sequence under this ID. */
const SAME_SEQUENCE = 'same-sequence-different-snapshot';

export interface V2EngineOptions {
  vaultId: string;
  /** Key of this connection's pause and sequence state (`cloud_sync_state`). */
  stateKey: string;
  stateStore: SQLiteSyncStateStore;
  provider: SnapshotProvider;
  mediaStore: Pick<SnapshotMediaStore, 'openVerifiedSource'>;
  files: ApplyMediaFiles;
  hooks?: SnapshotSyncHooks;
  now?: () => number;
  /** Identifies the running build; a new one retries a failed join. */
  codeVersion?: string;
  /**
   * How snapshots are hashed and paced (`CodecWork`); the app hashes
   * natively. Defaults to pure JS.
   */
  codecWork?: CodecWork;
}

interface HeadRecord {
  snapshotId: string;
  /** This device's row: the snapshot its head was about to move to. */
  pendingSnapshotId: string | null;
  deviceSequence: number;
  ctx: VersionVector | null;
  updatedAt: number;
}

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** The head if it has the v2 shape; versioning is checked first by the caller. */
function headShape(value: Record<string, unknown>): DeviceHead | null {
  const required = value.required;
  if (
    !isCount(value.major) ||
    !Array.isArray(required) ||
    !required.every(isString) ||
    !isString(value.vaultId) ||
    !isString(value.deviceId) ||
    !isCount(value.deviceSequence) ||
    !/^[0-9a-f]{64}$/.test(String(value.snapshotId)) ||
    !isCount(value.updatedAt)
  )
    return null;
  return value as unknown as DeviceHead;
}

/** A readable head and the file it came from. */
interface ReadHead extends DeviceHead {
  physicalId: string;
}

/** Why a downloaded head could not be read; any other error stops the pass. */
const UNREADABLE_REASONS: readonly string[] = [
  'head-snapshot-missing',
  'invalid-remote-snapshot',
  'wrong-vault',
];

/** The stored answer to a mass-deletion pause (`answerMassDeletion`), if any. */
function readAnswer(
  context: string | null,
): { token: string; choice: MassDeletionChoice } | null {
  if (!context) return null;
  try {
    const value = JSON.parse(context) as { massDeletion?: unknown; choice?: unknown };
    return typeof value.massDeletion === 'string' &&
      (value.choice === 'apply' || value.choice === 'keep')
      ? { token: value.massDeletion, choice: value.choice }
      : null;
  } catch {
    return null;
  }
}

function sameVector(left: VersionVector | null, right: VersionVector): boolean {
  return left !== null && canonicalize(left) === canonicalize(right);
}

export class V2SyncEngine {
  private running = false;
  /**
   * Blobs this pass uploaded itself: there, so `publish` need not ask again
   * (a search that has not indexed them yet would upload a second copy).
   */
  private uploadedThisPass = new Set<string>();
  /** Retention runs after a publication, or at most this often. */
  private lastCleanupAt = Number.NEGATIVE_INFINITY;
  /** Media garbage collection runs from this provider time on (`collectMedia`). */
  private nextMediaGcAt = Number.NEGATIVE_INFINITY;
  private readonly hooks: SnapshotSyncHooks;
  private readonly now: () => number;

  constructor(private readonly options: V2EngineOptions) {
    this.hooks = { ...options.hooks, progress: isolateProgress(options.hooks?.progress) };
    this.now = options.now ?? (() => Date.now());
  }

  async sync(): Promise<SnapshotSyncResult> {
    if (this.running) throw new Error('A snapshot sync pass is already running');
    this.running = true;
    this.uploadedThisPass = new Set();
    try {
      return await this.pass();
    } catch (error) {
      return await this.fail(error);
    } finally {
      this.running = false;
    }
  }

  private get vaultId() {
    return this.options.vaultId;
  }

  private get codecWork() {
    return this.options.codecWork ?? jsCodecWork;
  }

  private async pass(): Promise<SnapshotSyncResult> {
    const { provider, stateStore, stateKey } = this.options;
    const revocations = await provider.listRevocations(this.vaultId);
    if (revocations.includes('journal-deleted'))
      throw new AttentionError('journal-deleted', 'revocation-journal-deleted');
    if (revocations.includes('backup-deleted'))
      throw new AttentionError('backup-deleted', 'revocation-backup-deleted');
    const durable = stateStore.loadState(this.vaultId, stateKey);
    if (durable.pauseReason && !(await this.mayRetry(durable)))
      return {
        status: 'attention',
        reason: durable.pauseReason,
        actionableChanges: Math.max(
          0,
          durable.journalGeneration - durable.settledGeneration,
        ),
      };

    this.hooks.progress?.({ type: 'plan', phase: 'checking' });
    const listed = await provider.listHeads(this.vaultId, true);
    // Versioning first: a head this build cannot read stops the pass before
    // anything is written or deleted, here or on the provider.
    const { heads, unreadable, ambiguous } = this.readHeads(listed);
    // Every listed head's snapshot is kept.
    const kept = listed.flatMap(({ head }) =>
      head && isString(head.snapshotId) ? [head.snapshotId] : [],
    );
    const deviceId = await this.bind();
    // More than one head file under this device's ID (`pruneHeads`).
    const duplicates =
      listed.filter(({ head }) => head && String(head.deviceId) === deviceId).length > 1;
    if (ambiguous.has(deviceId))
      throw new AttentionError('ambiguous-device-head', SAME_SEQUENCE);
    // This device's own head, unreadable, counts as lost: it publishes over it.
    const skipped = unreadable.filter((head) => head.deviceId !== deviceId);
    const records = await this.loadHeadRecords();
    const own = heads.get(deviceId);
    const ownRecord = records.get(deviceId);
    // This device's head points to a snapshot it neither published nor was
    // about to publish, at a sequence it has not passed: another install has
    // its ID (an OS restore of this database, or a copy of it on a new phone).
    // Both may have written under the same ID, so no join can tell their
    // writes apart: one's could read as replaced by the other's, and a
    // rebuild under a new ID would let stale values beat newer ones. Pause
    // and ask, writing and deleting nothing; an older head is a stale
    // listing. The way out is `continueAsNewDevice`; the install-bound
    // device ID (P13) is the real fix.
    if (
      own !== undefined &&
      own.snapshotId !== ownRecord?.snapshotId &&
      own.snapshotId !== ownRecord?.pendingSnapshotId &&
      own.deviceSequence >= (ownRecord?.deviceSequence ?? 0)
    )
      throw new AttentionError(
        'ambiguous-device-head',
        'device-id-used-by-another-install',
      );
    // After the check above: a copy of a device whose clock was ahead must
    // be told apart first, since the clock's way out deletes this ID's head.
    await this.assertOwnClockSane(deviceId);
    const changed: ReadHead[] = [];
    for (const head of heads.values()) {
      if (head.deviceId === deviceId) continue;
      const record = records.get(head.deviceId);
      // An older head than the one taken in (a stale listing) adds nothing.
      if (
        record?.snapshotId === head.snapshotId ||
        (record && head.deviceSequence < record.deviceSequence)
      )
        continue;
      // Skipped before: not downloaded again until its head moves or its
      // time to retry comes (a day for an unreadable snapshot, which may
      // have been a listing lag; for a clock far ahead, when it may fit).
      const prior = durable.skippedHeads.find(
        (candidate) =>
          candidate.deviceId === head.deviceId &&
          candidate.snapshotId === head.snapshotId,
      );
      if (prior?.retryAt !== undefined && prior.retryAt > this.now()) {
        skipped.push({ ...prior, physicalId: head.physicalId });
        continue;
      }
      changed.push(head);
    }
    // Whether any head can be read: this device's own, one taken in before
    // or waiting for its clock, or (below) one read in this pass. Without
    // one, unreadable heads pause.
    // A device that has published here before counts too: one back after
    // 180 days finds its head pruned (`pruneHeads`) and publishes.
    let readable =
      own !== undefined ||
      (ownRecord?.snapshotId ?? '') !== '' ||
      [...heads.values()].some(
        (head) =>
          head.deviceId !== deviceId &&
          !changed.includes(head) &&
          !skipped.some(
            (entry) => entry.deviceId === head.deviceId && entry.reason === 'unreadable',
          ),
      );
    this.requireReadable(readable || changed.length > 0, skipped, null);
    const ctx = await this.localContext();
    const retiring = await this.pendingRetirements();
    const unpublished = await runExclusiveDbTransaction((tx) =>
      unpublishedAttachmentsInTransaction(tx as CloudSyncTransaction),
    );
    const plan = this.publication(ctx, deviceId, own, ownRecord);
    const mediaReady =
      unpublished.length > 0 && (await provider.mediaTransfersAllowed?.()) !== false;
    if (changed.length === 0 && !plan.needed && !mediaReady && retiring.length === 0) {
      await this.cleanup(deviceId, kept, false, duplicates, skipped.length === 0);
      return this.settle(durable.journalGeneration, skipped, {
        status: 'up-to-date',
        actionableChanges: 0,
        deferredMediaCount: unpublished.length,
        skippedHeads: skipped,
      });
    }

    if (plan.needed || mediaReady) this.hooks.activity?.('preparing-local-changes');
    await this.hooks.at?.('after-local-mutation');
    const deferred = mediaReady
      ? await this.publishAttachments(unpublished)
      : unpublished.length;
    const { remotes, failed } = await this.download(changed);
    for (const { head, error } of failed)
      skipped.push({
        physicalId: head.physicalId,
        deviceId: head.deviceId,
        snapshotId: head.snapshotId,
        reason: 'unreadable',
        // A missing snapshot is often a listing behind another device's
        // retention (#185 P9): read again soon.
        retryAt:
          this.now() +
          (error.reason === 'head-snapshot-missing'
            ? MISSING_RETRY_MS
            : UNREADABLE_RETRY_MS),
      });
    readable ||= remotes.length > 0;
    this.requireReadable(readable, skipped, failed[0]?.error ?? null);

    let next: SyncState | null = null;
    let publish = false;
    let refused: { head: ReadHead; aheadMs: number }[] = [];
    let takenIn: DeviceHead[] = [];
    let revived: string[] = [];
    // The user's answer to an earlier mass-deletion pause (`massDeletion.ts`).
    const answer = durable.pauseReason === null ? readAnswer(durable.pauseContext) : null;
    for (let attempt = 0; attempt < MAX_APPLY_ATTEMPTS && !next; attempt++) {
      this.hooks.progress?.({ type: 'plan', phase: 'merging' });
      const captured = await captureSyncState();
      if (captured.deviceId !== deviceId)
        throw new RetryableSyncError('device-identity-changed');
      const writer = { device: deviceId, wallMs: this.now() };
      const joinAll = (base: SyncState) => {
        let joined = base;
        refused = [];
        back.clear();
        for (const remote of remotes) {
          try {
            const absorbed = absorb(joined, remote.state, writer);
            joined = absorbed.state;
            for (const id of absorbed.revived) back.add(id);
          } catch (error) {
            // A clock more than 7 days ahead of this one: that head is
            // skipped until it may fit (`retryAt`), and this device still
            // publishes. That device recovers with `continueAsNewDevice`.
            if (!(error instanceof ClockAheadError)) throw error;
            refused.push({ head: remote.head, aheadMs: error.aheadMs });
          }
        }
        return joined;
      };
      const back = new Set<string>();
      // This install's old IDs in this vault are retired with its own write,
      // after the join: a rebuilt journal has not seen them on the roster yet.
      const local = (base: SyncState) =>
        retiring.reduce(
          (next, old) => retireDevice(next, writer, old.deviceId, old.upTo),
          base,
        );
      let state = local(joinAll(captured.state));
      // This device's own ID was retired elsewhere and it has not published
      // since: it is a copy of an install that left the ID (an old backup
      // restored after "Delete all"). It may hold writes that read as
      // replaced against ones it never saw, so it pauses before applying
      // anything, as for another install using its ID.
      const retiredAt = retiredDevices(state)[deviceId];
      if (retiredAt !== undefined && (ownRecord?.ctx?.[deviceId] ?? -1) <= retiredAt)
        throw new AttentionError('ambiguous-device-head', 'device-id-retired');
      // Mass-deletion guard: deletes from elsewhere that would hide a large
      // share of this journal wait for the user. "Keep" writes each entry
      // again here first, an edit those deletes had not seen, so it stays.
      const hidden = entriesHidden(captured.state, state);
      const shown = [...captured.state.entries.values()].filter(isLive).length;
      // A pending "Keep" also covers fewer deletes than were asked about:
      // any change to the set asks again rather than deleting quietly.
      const keepPending = answer?.choice === 'keep' && hidden.length > 0;
      if (isMassDeletion(hidden.length, shown) || keepPending) {
        const token = massDeletionToken(hidden);
        if (answer?.token !== token)
          throw new AttentionError(
            'mass-deletion',
            `hides-${hidden.length}-of-${shown}`,
            token,
          );
        if (answer.choice === 'keep')
          state = local(joinAll(rewriteDates(captured.state, writer, hidden)));
      }
      publish = this.publication(state.ctx, deviceId, own, ownRecord).needed;
      // Compaction drops deleted values this device's head on the provider
      // may still hold: it publishes too, so deleted text does not linger
      // on Drive in a quiet device's head.
      // The need is recorded with the apply (`oweInTransaction`): the local
      // journal is compacted then, so a publication that fails would leave
      // nothing to notice it by.
      const probe = publish ? state : compact(state);
      const owed = !publish && probe.entries !== state.entries;
      if (owed) publish = true;
      // After `markSeen` the floor can rise further: compact again.
      state = publish ? compact(markSeen(state, writer)) : probe;
      this.hooks.activity?.('applying-remote-snapshot');
      takenIn = remotes
        .map((remote) => remote.head)
        .filter((head) => !refused.some((entry) => entry.head === head));
      const applied = await applySyncState(
        captured,
        state,
        this.options.files,
        async (tx) => {
          await this.recordTakenIn(tx, takenIn);
          if (owed) await this.oweInTransaction(tx, deviceId);
          if (retiring.length > 0) await this.clearPendingRetirements(tx);
        },
      );
      await this.hooks.at?.('during-merge-application');
      if (applied) {
        next = state;
        // A later head in this pass may have deleted it again.
        revived = [...back].filter((id) => isLive(state.entries.get(id)!)).sort();
      }
    }
    if (!next) throw new RetryableSyncError('journal-changed-during-apply');
    for (const { head, aheadMs } of refused)
      skipped.push({
        physicalId: head.physicalId,
        deviceId: head.deviceId,
        snapshotId: head.snapshotId,
        reason: 'clock-ahead',
        retryAt: this.now() + aheadMs - MAX_CONTEXT_AHEAD_MS,
      });
    const skippedHeads = skipped;
    if (!publish) {
      await this.cleanup(deviceId, kept, false, duplicates, skipped.length === 0);
      return this.settle(
        durable.journalGeneration,
        skipped,
        takenIn.length > 0
          ? {
              status: 'pulled',
              snapshotId: takenIn[takenIn.length - 1].snapshotId,
              actionableChanges: 0,
              deferredMediaCount: deferred,
              skippedHeads,
              revivedEntries: revived,
            }
          : {
              status: 'up-to-date',
              actionableChanges: 0,
              deferredMediaCount: deferred,
              skippedHeads,
              revivedEntries: revived,
            },
      );
    }
    const snapshotId = await this.publish(next, deviceId, own, ownRecord);
    await this.cleanup(
      deviceId,
      [...kept, snapshotId],
      true,
      duplicates,
      skipped.length === 0,
    );
    return this.settle(durable.journalGeneration, skipped, {
      status: 'published',
      snapshotId,
      actionableChanges: 0,
      deferredMediaCount: deferred,
      skippedHeads,
      revivedEntries: revived,
    });
  }

  /**
   * A successful pass backed up every local write counted before it started
   * (`journal_generation`, which the app's repositories advance). Writes made
   * during the pass stay counted, so the runtime runs another pass, the vault
   * shows as dirty and the media reaper keeps files their removal still needs.
   */
  private settle<R extends SnapshotSyncResult>(
    generation: number,
    skipped: readonly SkippedHead[],
    result: R,
  ): R {
    const { stateStore, stateKey } = this.options;
    stateStore.markSettled(this.vaultId, stateKey, generation);
    stateStore.setSkippedHeads(this.vaultId, stateKey, skipped);
    stateStore.clearPause(this.vaultId, stateKey);
    const durable = stateStore.loadState(this.vaultId, stateKey);
    return {
      ...result,
      actionableChanges: Math.max(
        0,
        durable.journalGeneration - durable.settledGeneration,
      ),
    };
  }

  /** Binds the metadata to this vault, rebuilding it once; returns this device's ID. */
  private bind(): Promise<string> {
    return runExclusiveDbTransaction(async (rawTx) => {
      const tx = rawTx as CloudSyncTransaction;
      const [device] = await tx
        .select()
        .from(syncDevice)
        .where(eq(syncDevice.id, 'self'));
      if (device?.vault_id === this.vaultId) return device.device_id;
      return rebuildSyncMetadataInTransaction(tx, this.vaultId, this.now());
    });
  }

  /**
   * This device's clock was far ahead and has since been corrected: its
   * state holds HLCs every other device refuses, so its snapshots would be
   * skipped everywhere until real time caught up. It pauses and offers to
   * continue as a new device (`continueAsNewDevice`). While its clock is
   * still ahead this cannot be seen here; other devices list it instead.
   *
   * A clock that is now behind looks the same from here, so the state must
   * also be ahead of the newest upload time the provider recorded (its own
   * clock, not the uploader's). With nothing uploaded yet the pass goes on;
   * if it publishes a snapshot others refuse, the next pass pauses.
   */
  private async assertOwnClockSane(deviceId: string) {
    const [device] = await runExclusiveDbTransaction((tx) =>
      tx
        .select({ ctx: syncDevice.ctx_json, roster: syncDevice.roster_json })
        .from(syncDevice)
        .where(eq(syncDevice.id, 'self')),
    );
    if (!device) return;
    // Only this device's own writes: moving them to a new ID is the way out,
    // and it cannot help with another device's.
    const ctx = JSON.parse(device.ctx) as VersionVector;
    const roster = JSON.parse(device.roster) as VersionVector;
    const highest = Math.max(ctx[deviceId] ?? -1, roster[deviceId] ?? -1);
    if (highest - this.now() <= MAX_CONTEXT_AHEAD_MS) return;
    const uploads = await this.options.provider.listSnapshots(this.vaultId);
    if (uploads.length === 0) return;
    const newest = Math.max(...uploads.map((upload) => upload.createdAt));
    // Behind the provider's own time: this clock is behind now, not ahead before.
    if (this.now() < newest) return;
    if (highest - newest > MAX_CONTEXT_AHEAD_MS)
      throw new AttentionError('device-clock-ahead', 'local-context-ahead');
  }

  /** This install's old IDs in this vault, waiting to be retired (`resetSyncIdentityInTransaction`). */
  private async pendingRetirements() {
    const [device] = await runExclusiveDbTransaction((tx) =>
      tx
        .select({ retired: syncDevice.retired_json, installId: syncDevice.install_id })
        .from(syncDevice)
        .where(eq(syncDevice.id, 'self')),
    );
    // Only while still bound to the install that left the ID: a copy that
    // reset ("Delete all") before its binding check rebound it would
    // otherwise retire the original install's live ID.
    return parsePendingRetirements(device?.retired).filter(
      (old) => old.vaultId === this.vaultId && old.installId === device?.installId,
    );
  }

  /**
   * Recorded in the state with the apply: the other vaults' stay pending.
   * One whose ID no state here has on its roster (it never published, or
   * its head could not be read) is cleared without being recorded; that ID
   * then only expires after 180 days, the conservative side.
   */
  private async clearPendingRetirements(tx: CloudSyncTransaction) {
    const [device] = await tx
      .select({ retired: syncDevice.retired_json })
      .from(syncDevice)
      .where(eq(syncDevice.id, 'self'));
    const left = parsePendingRetirements(device?.retired).filter(
      (old) => old.vaultId !== this.vaultId,
    );
    await tx
      .update(syncDevice)
      .set({ retired_json: JSON.stringify(left) })
      .where(eq(syncDevice.id, 'self'));
  }

  private async localContext(): Promise<VersionVector> {
    const [device] = await runExclusiveDbTransaction((tx) =>
      tx
        .select({ ctx: syncDevice.ctx_json })
        .from(syncDevice)
        .where(eq(syncDevice.id, 'self')),
    );
    return device ? (JSON.parse(device.ctx) as VersionVector) : {};
  }

  /**
   * Whether this device should publish what it holds: see the module
   * comment, step 7.
   */
  private publication(
    ctx: VersionVector,
    deviceId: string,
    own: DeviceHead | undefined,
    record: HeadRecord | undefined,
  ): { needed: boolean } {
    // A pending snapshot: a publication stopped part way, before its head
    // moved, or one owed for compacted values (`oweInTransaction`).
    if (
      !own ||
      !record ||
      own.snapshotId !== record.snapshotId ||
      !record.ctx ||
      record.pendingSnapshotId !== null
    )
      return { needed: true };
    if ((ctx[deviceId] ?? -1) > (record.ctx[deviceId] ?? -1)) return { needed: true };
    const ackDue =
      !sameVector(record.ctx, ctx) && this.now() - record.updatedAt >= ACK_INTERVAL_MS;
    return { needed: ackDue };
  }

  /**
   * The newest readable head per device. Versioning comes first: a head
   * this build cannot read because it is newer pauses sync, whatever else
   * it holds. A head that is merely damaged (unreadable, the wrong shape or
   * vault, two snapshots under one sequence) is returned in `unreadable`,
   * or, for two snapshots, in `ambiguous` too.
   */
  private readHeads(listed: readonly ListedDeviceHead[]): {
    heads: Map<string, ReadHead>;
    unreadable: SkippedHead[];
    ambiguous: Set<string>;
  } {
    const unreadable: SkippedHead[] = [];
    const byDevice = new Map<string, ReadHead[]>();
    for (const { physicalId, head: raw, keyDeviceId } of listed) {
      const value = raw as unknown;
      const record =
        typeof value === 'object' && value !== null && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
      if (record) {
        if (record.format !== HEAD_FORMAT)
          throw new AttentionError(
            'unsupported-format',
            'unsupported-device-head-format',
          );
        if (isCount(record.major) && record.major !== SNAPSHOT_MAJOR)
          throw new AttentionError('unsupported-format', 'remote-format-version');
        if (
          Array.isArray(record.required) &&
          record.required.some(
            (feature) => !KNOWN_REQUIRED_FEATURES.includes(String(feature)),
          )
        )
          throw new AttentionError('unsupported-format', 'remote-required-feature');
      }
      const head = record ? headShape(record) : null;
      if (!head || head.vaultId !== this.vaultId) {
        unreadable.push({
          physicalId,
          deviceId: isString(record?.deviceId) ? record.deviceId : (keyDeviceId ?? null),
          snapshotId: isString(record?.snapshotId) ? record.snapshotId : null,
          reason: 'unreadable',
        });
        continue;
      }
      const read = { ...head, physicalId };
      const list = byDevice.get(head.deviceId);
      if (list) list.push(read);
      else byDevice.set(head.deviceId, [read]);
    }
    const heads = new Map<string, ReadHead>();
    const ambiguous = new Set<string>();
    for (const [deviceId, list] of byDevice) {
      const sequence = Math.max(...list.map((head) => head.deviceSequence));
      const newest = list.filter((head) => head.deviceSequence === sequence);
      // Each publication takes a new sequence first, so two snapshots under
      // one sequence are not this build's doing.
      if (new Set(newest.map((head) => head.snapshotId)).size > 1) {
        ambiguous.add(deviceId);
        for (const head of newest)
          unreadable.push({
            physicalId: head.physicalId,
            deviceId,
            snapshotId: head.snapshotId,
            reason: 'unreadable',
          });
        continue;
      }
      heads.set(deviceId, newest[0]);
    }
    return { heads, unreadable, ambiguous };
  }

  /**
   * Skipping unreadable heads needs a readable one to go on with. Without
   * one the pass pauses, after recording what it skipped so the user can
   * remove those heads ("Replace this backup").
   */
  private requireReadable(
    readable: boolean,
    skipped: readonly SkippedHead[],
    error: AttentionError | null,
  ) {
    if (readable || !skipped.some((head) => head.reason === 'unreadable')) return;
    const { stateStore, stateKey } = this.options;
    stateStore.setSkippedHeads(this.vaultId, stateKey, skipped);
    throw new AttentionError(
      error?.reason ?? 'invalid-remote-snapshot',
      NO_READABLE_HEAD,
    );
  }

  private async loadHeadRecords(): Promise<Map<string, HeadRecord>> {
    const rows = await runExclusiveDbTransaction((tx) =>
      tx.select().from(syncHeads).where(eq(syncHeads.vault_id, this.vaultId)),
    );
    return new Map(
      rows.map((row) => [
        row.device_id,
        {
          snapshotId: row.snapshot_id,
          pendingSnapshotId: row.pending_snapshot_id,
          deviceSequence: row.device_sequence,
          ctx: row.ctx_json === null ? null : (JSON.parse(row.ctx_json) as VersionVector),
          updatedAt: row.updated_at,
        },
      ]),
    );
  }

  /**
   * A publication this device owes for values it compacted: its own head
   * record gets a pending snapshot ('' when none, which matches no head), so
   * every pass publishes until one succeeds (`publish` clears it). The
   * context it published stays: the retired-ID check reads it.
   */
  private async oweInTransaction(tx: CloudSyncTransaction, deviceId: string) {
    await tx
      .update(syncHeads)
      .set({ pending_snapshot_id: sql`coalesce(${syncHeads.pending_snapshot_id}, '')` })
      .where(
        and(eq(syncHeads.vault_id, this.vaultId), eq(syncHeads.device_id, deviceId)),
      );
  }

  /** Heads taken in, recorded in the apply's transaction. */
  private async recordTakenIn(tx: CloudSyncTransaction, heads: readonly DeviceHead[]) {
    for (const head of heads) {
      const values = {
        snapshot_id: head.snapshotId,
        device_sequence: head.deviceSequence,
        ctx_json: null,
        updated_at: this.now(),
      };
      await tx
        .insert(syncHeads)
        .values({ vault_id: this.vaultId, device_id: head.deviceId, ...values })
        .onConflictDoUpdate({
          target: [syncHeads.vault_id, syncHeads.device_id],
          set: values,
        });
    }
  }

  /**
   * Uploads the blobs of attachments not published yet, then stamps every
   * one whose blob the provider has. Returns how many still wait (Wi-Fi-only
   * media on mobile data). A file that cannot be read pauses sync: its
   * attachment would otherwise never publish.
   */
  private async publishAttachments(
    pending: readonly { assetId: string; blobHash: string | null }[],
  ): Promise<number> {
    const { provider, mediaStore } = this.options;
    const hashes = [
      ...new Set(pending.flatMap((asset) => (asset.blobHash ? [asset.blobHash] : []))),
    ];
    const present = await provider.hasMediaBatch(this.vaultId, hashes);
    const uploads: { blobHash: string; source: MediaUploadSource }[] = [];
    for (const blobHash of hashes) {
      if (present.has(blobHash)) continue;
      const source = await mediaStore.openVerifiedSource(blobHash);
      if (!source || source.contentHash !== blobHash)
        throw new AttentionError('local-media-unreadable', 'local-media-hash-mismatch');
      uploads.push({ blobHash, source });
      await this.hooks.at?.('during-media-inspection');
    }
    if (uploads.length > 0)
      this.hooks.progress?.({
        type: 'plan',
        phase: 'uploading-media',
        items: { done: 0, total: uploads.length },
        bytesTotal: uploads.reduce((total, { source }) => total + source.byteLength, 0),
      });
    // A few at a time (`MEDIA_UPLOAD_CONCURRENCY`). After a failure no new
    // upload starts; the ones in flight finish, then the first error is thrown.
    let next = 0;
    let stopped = false;
    let failure: { error: unknown } | null = null;
    const uploadNext = async () => {
      while (!stopped && next < uploads.length) {
        const { blobHash, source } = uploads[next++];
        try {
          await provider.uploadMedia(this.vaultId, blobHash, source);
          this.uploadedThisPass.add(blobHash);
          present.add(blobHash);
          this.hooks.progress?.({ type: 'item', phase: 'uploading-media' });
          await this.hooks.at?.('during-media-transfer');
        } catch (error) {
          stopped = true;
          // The policy refused: the rest wait for Wi-Fi too.
          if (
            !(error instanceof SnapshotProviderError && error.code === 'wifi-only-media')
          )
            failure ??= { error };
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(MEDIA_UPLOAD_CONCURRENCY, uploads.length) },
        uploadNext,
      ),
    );
    if (failure) throw (failure as { error: unknown }).error;
    const ready = new Set(
      pending
        .filter((asset) => asset.blobHash && present.has(asset.blobHash))
        .map((a) => a.assetId),
    );
    if (ready.size > 0)
      await runExclusiveDbTransaction((tx) =>
        stampPublishedAttachmentsInTransaction(
          tx as CloudSyncTransaction,
          ready,
          this.now(),
        ),
      );
    return pending.length - ready.size;
  }

  /**
   * Downloads and checks the snapshots of heads that changed. A snapshot
   * that is missing or fails its checks is returned in `failed`; one this
   * build is too old to read stops the pass.
   */
  private async download(heads: readonly ReadHead[]) {
    const { provider } = this.options;
    if (heads.length > 0)
      this.hooks.progress?.({
        type: 'plan',
        phase: 'downloading',
        items: { done: 0, total: heads.length },
      });
    const remotes: { head: ReadHead; state: SyncState }[] = [];
    const failed: { head: ReadHead; error: AttentionError }[] = [];
    for (const head of [...heads].sort((a, b) => (a.deviceId < b.deviceId ? -1 : 1))) {
      try {
        remotes.push({ head, state: await this.downloadOne(provider, head) });
      } catch (error) {
        const unreadable =
          error instanceof AttentionError
            ? UNREADABLE_REASONS.includes(error.reason)
              ? error
              : null
            : error instanceof SnapshotProviderError && error.code === 'invalid-data'
              ? new AttentionError('invalid-remote-snapshot', 'provider-invalid-data')
              : null;
        if (!unreadable) throw error;
        if (unreadable.reason === 'head-snapshot-missing' && (await this.moved(head)))
          throw new RetryableSyncError('head-moved-during-pass');
        failed.push({ head, error: unreadable });
      }
    }
    return { remotes, failed };
  }

  /**
   * Whether a head's file now points elsewhere or is gone: its old snapshot
   * may then have been deleted by retention (another device thins a day's
   * other snapshots once their heads move). The pass is retried with the
   * new listing rather than the head reported as unreadable.
   */
  private async moved(head: ReadHead): Promise<boolean> {
    const current = (await this.options.provider.listHeads(this.vaultId, true)).find(
      (listed) => listed.physicalId === head.physicalId,
    );
    return current?.head?.snapshotId !== head.snapshotId;
  }

  private async downloadOne(
    provider: SnapshotProvider,
    head: ReadHead,
  ): Promise<SyncState> {
    this.hooks.activity?.('reading-remote-snapshot');
    const bytes = await provider.downloadSnapshot(this.vaultId, head.snapshotId);
    this.hooks.progress?.({ type: 'item', phase: 'downloading' });
    await this.hooks.at?.('during-remote-snapshot-download');
    const state = await checkSnapshot(this.vaultId, head, bytes, this.codecWork);
    await this.recordMedia(head.snapshotId, state);
    return state;
  }

  /** Best effort: media garbage collection downloads a snapshot it lacks. */
  private async recordMedia(snapshotId: string, state: SyncState) {
    try {
      await recordSnapshotMedia(this.vaultId, snapshotId, state);
    } catch (error) {
      console.warn('Cloud sync could not record the media a snapshot uses', error);
    }
  }

  /**
   * Uploads blobs `state` needs that the provider lacks and this device
   * holds, then the snapshot, then moves the head. A blob neither side holds
   * belongs to another device's attachment (a later download reports it);
   * only one this device authored and can no longer read pauses sync.
   */
  private async publish(
    state: SyncState,
    deviceId: string,
    own: DeviceHead | undefined,
    record: HeadRecord | undefined,
  ): Promise<string> {
    const { provider, mediaStore, stateStore, stateKey } = this.options;
    const hashes = [...new Set([...state.media.values()].map((media) => media.blobHash))];
    // Blobs this snapshot newly refers to, that this device holds, are asked
    // of the provider itself, not its cache: a missed or late change can
    // leave the cache listing a blob another device's media garbage
    // collection deleted (an upload whose snapshot never made it, an entry
    // back after 180 days). Blobs its own listed head already refers to
    // cannot have been collected.
    const recheck = new Set(await this.newlyReferenced(hashes, own, record));
    const present = await provider.hasMediaBatch(
      this.vaultId,
      hashes.filter((blobHash) => !recheck.has(blobHash)),
    );
    if (recheck.size > 0)
      for (const blobHash of await provider.hasMediaBatch(
        this.vaultId,
        [...recheck],
        true,
      ))
        present.add(blobHash);
    const missing = hashes.filter((blobHash) => !present.has(blobHash));
    const sources = new Map<string, MediaUploadSource>();
    for (const blobHash of missing) {
      const source = await mediaStore.openVerifiedSource(blobHash);
      if (source && source.contentHash === blobHash) sources.set(blobHash, source);
    }
    // A blob the state needs that this device can upload (a new profile
    // photo; attachments are deferred before they are stamped) holds back
    // the whole publication. Said before any upload starts.
    if (sources.size > 0 && (await provider.mediaTransfersAllowed?.()) === false)
      throw new SnapshotProviderError(
        'wifi-only-media',
        'A profile photo waits for Wi-Fi',
      );
    for (const blobHash of missing) {
      const source = sources.get(blobHash);
      if (source) {
        await provider.uploadMedia(this.vaultId, blobHash, source);
        continue;
      }
      const [authored] = await runExclusiveDbTransaction((tx) =>
        tx
          .select({ id: mediaAssets.asset_id })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.blob_hash, blobHash),
              eq(mediaAssets.download_state, 'n/a'),
            ),
          )
          .limit(1),
      );
      if (authored)
        throw new AttentionError('local-media-unreadable', 'required-media-unavailable');
    }
    // Reserved in one transaction before the upload: neither a retry nor an
    // overlapping pass ever reuses a sequence.
    const deviceSequence = stateStore.reserveSequence(
      this.vaultId,
      stateKey,
      Math.max((own?.deviceSequence ?? 0) + 1, (record?.deviceSequence ?? 0) + 1),
    );
    const createdAt = this.now();
    const encoded = await encodeEnvelopeAsync(
      state,
      { authorDeviceId: deviceId, deviceSequence, createdAt },
      this.codecWork,
    );
    await this.recordMedia(encoded.snapshotId, state);
    this.hooks.activity?.('publishing-local-snapshot');
    this.hooks.progress?.({
      type: 'plan',
      phase: 'uploading',
      items: { done: 0, total: 1 },
      bytesTotal: encoded.bytes.length,
    });
    await provider.uploadSnapshot(
      this.vaultId,
      encoded.snapshotId,
      encoded.bytes,
      createdAt,
    );
    await this.hooks.at?.('after-snapshot-uploaded');
    if (!(await provider.verifySnapshot(this.vaultId, encoded.snapshotId, encoded.bytes)))
      throw new SnapshotProviderError('transient', 'Uploaded snapshot did not verify');
    await this.hooks.at?.('after-snapshot-verified');
    // Recorded before the head moves: a pass stopped after the move then
    // sees its own snapshot, not another install's.
    await runExclusiveDbTransaction(async (tx) => {
      await tx
        .insert(syncHeads)
        .values({
          vault_id: this.vaultId,
          device_id: deviceId,
          snapshot_id: record?.snapshotId ?? '',
          device_sequence: record?.deviceSequence ?? 0,
          ctx_json: record?.ctx ? JSON.stringify(record.ctx) : null,
          pending_snapshot_id: encoded.snapshotId,
          updated_at: record?.updatedAt ?? createdAt,
        })
        .onConflictDoUpdate({
          target: [syncHeads.vault_id, syncHeads.device_id],
          set: { pending_snapshot_id: encoded.snapshotId },
        });
    });
    await provider.updateDeviceHead(this.vaultId, {
      format: HEAD_FORMAT,
      major: SNAPSHOT_MAJOR,
      required: encoded.header.features.required,
      vaultId: this.vaultId,
      deviceId,
      deviceSequence,
      snapshotId: encoded.snapshotId,
      updatedAt: createdAt,
    });
    this.hooks.progress?.({ type: 'item', phase: 'uploading' });
    await this.hooks.at?.('after-head-advanced');
    await runExclusiveDbTransaction(async (tx) => {
      const values = {
        snapshot_id: encoded.snapshotId,
        device_sequence: deviceSequence,
        ctx_json: JSON.stringify(state.ctx),
        pending_snapshot_id: null,
        updated_at: createdAt,
      };
      await tx
        .insert(syncHeads)
        .values({ vault_id: this.vaultId, device_id: deviceId, ...values })
        .onConflictDoUpdate({
          target: [syncHeads.vault_id, syncHeads.device_id],
          set: values,
        });
    });
    return encoded.snapshotId;
  }

  /**
   * Of `hashes`, those this device's head does not refer to and whose files
   * this device authored or downloaded (its media rows say so; a file it
   * cannot read now is still included, so an authored one pauses as
   * unreadable rather than being published as present). The head counts
   * only while it is listed where this device left it and was published
   * within `OWN_HEAD_TRUSTED_MS`: a head pruned meanwhile can still be
   * listed by a cache that missed the change.
   */
  private async newlyReferenced(
    hashes: readonly string[],
    own: DeviceHead | undefined,
    record: HeadRecord | undefined,
  ): Promise<string[]> {
    const trusted =
      own !== undefined &&
      record !== undefined &&
      own.snapshotId === record.snapshotId &&
      this.now() - record.updatedAt < OWN_HEAD_TRUSTED_MS;
    const before = trusted
      ? await recordedSnapshotMedia(this.vaultId, record.snapshotId)
      : null;
    const candidates = hashes.filter(
      (blobHash) => !before?.has(blobHash) && !this.uploadedThisPass.has(blobHash),
    );
    const held = new Set<string>();
    for (let offset = 0; offset < candidates.length; offset += 500) {
      const rows = await runExclusiveDbTransaction((tx) =>
        tx
          .select({ blobHash: mediaAssets.blob_hash })
          .from(mediaAssets)
          .where(
            and(
              inArray(mediaAssets.blob_hash, candidates.slice(offset, offset + 500)),
              inArray(mediaAssets.download_state, ['n/a', 'verified']),
            ),
          ),
      );
      for (const row of rows) if (row.blobHash) held.add(row.blobHash);
    }
    return candidates.filter((blobHash) => held.has(blobHash));
  }

  /**
   * Head pruning (#148; #185 P11), best effort. Deletes:
   * - **Heads of devices that left the active roster** (`activeDevices`:
   *   nothing written or published within 180 days of the newest time in
   *   this device's state, or retired). Only a head this device took in
   *   exactly (its `sync_heads` record names that snapshot), and only right
   *   after it published (`published`), so all that head held is in this
   *   device's own head on the provider. Its snapshot then falls to
   *   retention, usually in the same cleanup (it is older than 30 days). A
   *   device that comes back finds its head gone and publishes a new one;
   *   what its state can bring back is the "back after 180 days" case
   *   (`compact.ts`).
   * - **Leftover files under this device's own ID**, after a race between
   *   copied installs: files at a lower sequence than its own head, which
   *   is listed where it left it. No device reads them (only the newest per
   *   device counts), and an install that wrote one pauses at its next pass
   *   (its ID has a newer head it did not publish) and moves every write it
   *   holds to a new ID.
   *
   * Never this device's own head. The heads are listed again right before
   * each delete, so a device that publishes into the same file meanwhile
   * (Drive updates it in place) keeps its head, but for a short window (one
   * request, plus however long Drive's change listing lags); if it loses it
   * there, its fresh snapshot stays (retention keeps every snapshot of the
   * current day) and it publishes again at its next pass.
   * Returns the snapshots of the deleted heads.
   */
  private async pruneHeads(
    deviceId: string,
    published: boolean,
    duplicates: boolean,
  ): Promise<string[]> {
    const { provider } = this.options;
    const [[device], [profile]] = await runExclusiveDbTransaction((tx) =>
      Promise.all([
        tx
          .select({ roster: syncDevice.roster_json })
          .from(syncDevice)
          .where(eq(syncDevice.id, 'self')),
        tx
          .select({ ext: syncRecords.ext_json })
          .from(syncRecords)
          .where(
            and(
              eq(syncRecords.entity_type, 'profile'),
              eq(syncRecords.entity_id, 'profile'),
            ),
          ),
      ]),
    );
    if (!device) return [];
    const roster = JSON.parse(device.roster) as Record<string, number>;
    const ext = profile ? (JSON.parse(profile.ext) as Ext) : {};
    const active = new Set(activeDevices({ roster, profile: { ext } }));
    const expired = new Set(
      Object.keys(roster).filter((id) => id !== deviceId && !active.has(id)),
    );
    if ((!published || expired.size === 0) && !duplicates) return [];
    const records = await this.loadHeadRecords();
    const mine = records.get(deviceId);
    const heads = (await provider.listHeads(this.vaultId, true)).flatMap(
      ({ physicalId, head: raw }) => {
        const head = raw ? headShape(raw as unknown as Record<string, unknown>) : null;
        return head && head.vaultId === this.vaultId ? [{ ...head, physicalId }] : [];
      },
    );
    // Its own head, where this device left it: the ID is this install's.
    const owned =
      mine !== undefined &&
      mine.pendingSnapshotId === null &&
      heads.some(
        (head) =>
          head.deviceId === deviceId &&
          head.snapshotId === mine.snapshotId &&
          head.deviceSequence === mine.deviceSequence,
      );
    const pruned: string[] = [];
    const candidates = heads.filter((head) => {
      const taken = records.get(head.deviceId);
      // Only the head taken in. An older file under that ID can hold a
      // cloned install's other writes, so it stays: a device that never
      // knew this ID takes it in (it is then the newest) and prunes it.
      // shortcut: devices that took this head in keep their record and
      // skip the older file as a stale listing, so it and its snapshot stay
      // until such a device joins; needs a clone race plus 180-day expiry.
      // Revisit by dropping the record with the pruned head.
      const gone =
        published && expired.has(head.deviceId) && taken?.snapshotId === head.snapshotId;
      const leftover =
        owned &&
        head.deviceId === deviceId &&
        head.deviceSequence < mine.deviceSequence &&
        head.snapshotId !== mine.snapshotId;
      return gone || leftover;
    });
    for (const head of candidates.slice(0, MAX_DELETES_PER_PASS)) {
      // Listed again right before the delete: still the same head.
      const current = (await provider.listHeads(this.vaultId, true)).find(
        (listed) => listed.physicalId === head.physicalId,
      );
      if (!current?.head || current.head.snapshotId !== head.snapshotId) continue;
      await this.hooks.at?.('during-snapshot-cleanup');
      await provider.deleteDeviceHead(this.vaultId, head.physicalId);
      pruned.push(head.snapshotId);
    }
    return pruned;
  }

  /**
   * Retention, best effort (`retention.ts`): snapshots no head points to go
   * once 30 days old, by the provider's clock, keeping one a day for the
   * backup history; a few at a time. Heads only ever move to new snapshots,
   * so an unreferenced one is needed again only to restore it. Runs after a
   * publication or once a day, after head pruning (`pruneHeads`), whose
   * snapshots it then treats as any other; the heads are listed again
   * right before deleting, so a head missing from an earlier listing never
   * loses its snapshot. While any head file cannot be read, nothing is
   * deleted: its snapshots cannot be told apart from unreferenced ones.
   *
   * Then media garbage collection (`collectMedia`), when this pass skipped
   * no head (`collect`): at most once a day, or an hour later while it has
   * snapshots left to read.
   */
  private async cleanup(
    deviceId: string,
    retained: readonly string[],
    published: boolean,
    duplicates: boolean,
    collect: boolean,
  ) {
    try {
      // Scheduled by the provider's clock as well: this device's may jump,
      // and one set back would hold cleanup off for as long.
      const providerNow = this.options.provider.providerTime();
      // Without the provider's clock, retention only prunes heads, and the
      // schedule is left alone: a time from this device's clock would
      // throw it off once the provider's is known.
      if (providerNow === null)
        console.warn('Cloud sync cleanup has no provider time; history is kept');
      if (
        published ||
        (providerNow !== null && providerNow - this.lastCleanupAt >= CLEANUP_INTERVAL_MS)
      ) {
        if (providerNow !== null) this.lastCleanupAt = providerNow;
        await this.retainSnapshots(deviceId, retained, published, duplicates);
      }
      if (collect && providerNow !== null && providerNow >= this.nextMediaGcAt) {
        // Provider trouble below waits a day too.
        this.nextMediaGcAt = providerNow + CLEANUP_INTERVAL_MS;
        const outcome = await collectMedia({
          vaultId: this.vaultId,
          provider: this.options.provider,
          // The provider's clock, as retention's: the 30-day counts must not
          // move with this device's clock (#185 "clock skew in retention").
          now: providerNow,
          hooks: this.hooks,
          codecWork: this.codecWork,
        });
        // Snapshots left to read, or something new appeared: soon, not every pass.
        if (outcome.status === 'incomplete')
          this.nextMediaGcAt = providerNow + MEDIA_GC_RETRY_MS;
      }
    } catch (error) {
      if (!(error instanceof SnapshotProviderError)) throw error;
      // Provider trouble only keeps more history.
    }
  }

  private async retainSnapshots(
    deviceId: string,
    retained: readonly string[],
    published: boolean,
    duplicates: boolean,
  ) {
    const { provider } = this.options;
    const pruned = await this.pruneHeads(deviceId, published, duplicates);
    const kept = retained.filter((snapshotId) => !pruned.includes(snapshotId));
    const now = provider.providerTime();
    if (now === null) return;
    const snapshots = await provider.listSnapshots(this.vaultId);
    const blobs = await loadSnapshotMedia(this.vaultId);
    const plan = (referenced: ReadonlySet<string>) =>
      snapshotsToDelete({ snapshots, referenced, blobs, now });
    if (plan(new Set(kept)).length === 0) return;
    const listed = await provider.listHeads(this.vaultId, true);
    if (listed.some(({ head }) => head === null)) return;
    const referenced = new Set([
      ...kept,
      ...listed.map(({ head }) => String(head!.snapshotId)),
    ]);
    for (const snapshotId of plan(referenced).slice(0, MAX_DELETES_PER_PASS)) {
      await this.hooks.at?.('during-snapshot-cleanup');
      await provider.deleteSnapshot(this.vaultId, snapshotId);
    }
  }

  /** The running build: an update-required pause is retried after an update. */
  private buildContext(): string {
    return `build:${this.options.codeVersion ?? ''}`;
  }

  /**
   * What a failed join depends on: the heads (listed fresh), this journal
   * and the build.
   */
  private async joinInput(): Promise<string> {
    const { provider, stateStore, stateKey } = this.options;
    const listed = await provider.listHeads(this.vaultId, true);
    return canonicalize({
      codeVersion: this.options.codeVersion ?? '',
      journalGeneration: stateStore.loadState(this.vaultId, stateKey).journalGeneration,
      heads: listed
        .map(({ physicalId, head }) =>
          head
            ? `${String(head.deviceId)}\0${String(head.snapshotId)}`
            : `unreadable\0${physicalId}`,
        )
        .sort(),
    });
  }

  /**
   * Pauses that clear by themselves: a failed join runs again once its
   * input changes (another device publishes, a local edit, an update); an
   * update-required pause once the app is updated (the head is read again);
   * "no head can be read" and "another install uses this ID" once the listed
   * heads change (the pass checks them again before writing anything).
   * Other pauses wait for the user.
   */
  private async mayRetry(durable: {
    pauseReason: string | null;
    pauseContext: string | null;
    lastErrorClass: string | null;
  }) {
    if (durable.pauseReason === 'unsupported-format')
      return durable.pauseContext !== this.buildContext();
    // Nothing could be read: try again once the heads change (a broken
    // device published again), without waiting for "Replace". The same for
    // two files at one sequence under this ID: once the other install
    // leaves (its file deleted, `removeOwnHeads`), this one's head is its
    // own again. The other identity pauses wait for the user: no head
    // change makes them safe by itself.
    if (
      durable.pauseReason !== 'merge-failed' &&
      durable.lastErrorClass !== SAME_SEQUENCE &&
      durable.lastErrorClass !== NO_READABLE_HEAD
    )
      return false;
    if (durable.pauseContext === null) return true;
    try {
      return durable.pauseContext !== (await this.joinInput());
    } catch (error) {
      if (
        error instanceof SnapshotProviderError &&
        (error.code === 'transient' || error.code === 'rate-limited')
      )
        return false;
      throw error;
    }
  }

  private async fail(error: unknown): Promise<SnapshotSyncResult> {
    const { stateStore, stateKey } = this.options;
    const pause = (
      reason: Parameters<SQLiteSyncStateStore['setPause']>[2],
      errorClass: string,
      context: string | null = null,
    ) => {
      stateStore.setPause(this.vaultId, stateKey, reason, errorClass, context);
      return { status: 'attention' as const, reason, actionableChanges: 0 };
    };
    if (error instanceof SyncCancelledError) throw error;
    if (error instanceof AttentionError) {
      let context = error.context;
      if (error.reason === 'unsupported-format') context = this.buildContext();
      else if (
        error.errorClass === NO_READABLE_HEAD ||
        error.errorClass === SAME_SEQUENCE
      )
        try {
          context = await this.joinInput();
        } catch {
          // Without a record the next pass checks the heads again.
        }
      return pause(error.reason, error.errorClass, context);
    }
    if (error instanceof SyncJoinError) {
      let context: string | null = null;
      try {
        context = await this.joinInput();
      } catch {
        // Without a record the next pass joins again and records it then.
      }
      return pause('merge-failed', `join-${error.code}`, context);
    }
    if (error instanceof SnapshotValidationError)
      return pause('normalized-model-not-ready', `local-candidate-${error.code}`);
    if (
      error instanceof LocalStorageError &&
      error.errorClass === 'normalized-media-needs-hash'
    ) {
      // A file picked moments ago (a new profile photo) that the runtime's
      // hash pass has not reached yet: the next pass hashes it first.
      stateStore.setRetryError(this.vaultId, stateKey, error.errorClass);
      return { status: 'retry', reason: 'transient', actionableChanges: 0 };
    }
    if (error instanceof LocalStorageError) return pause(error.reason, error.errorClass);
    if (error instanceof SnapshotProviderError) {
      const attention = attentionReasonForProviderError(error.code);
      if (attention) return pause(attention, `provider-${error.code}`);
      stateStore.setRetryError(this.vaultId, stateKey, `provider-${error.code}`);
      return {
        status: 'retry',
        reason:
          error.code === 'rate-limited'
            ? 'rate-limited'
            : error.code === 'wifi-only-media'
              ? 'wifi-only-media'
              : 'transient',
        actionableChanges: 0,
      };
    }
    if (error instanceof RetryableSyncError) {
      stateStore.setRetryError(this.vaultId, stateKey, error.errorClass);
      return { status: 'retry', reason: 'transient', actionableChanges: 0 };
    }
    throw error;
  }
}

/** Checks a head's downloaded snapshot; throws an `AttentionError` if it is unusable. */
async function checkSnapshot(
  vaultId: string,
  head: DeviceHead,
  bytes: Uint8Array | null,
  work: CodecWork,
): Promise<SyncState> {
  if (!bytes) throw new AttentionError('head-snapshot-missing', 'head-target-not-found');
  let decoded: Awaited<ReturnType<typeof decodeEnvelopeAsync>>;
  try {
    decoded = await decodeEnvelopeAsync(bytes, head.snapshotId, work);
  } catch (error) {
    // Not a fault of the snapshot: the pass fails and is tried again.
    if (error instanceof SnapshotHashUnavailableError) throw error;
    if (error instanceof SnapshotUpdateRequiredError)
      throw new AttentionError('unsupported-format', `remote-${error.code}`);
    const code = error instanceof SnapshotValidationError ? error.code : 'unknown';
    throw new AttentionError('invalid-remote-snapshot', `snapshot-validation-${code}`);
  }
  if (decoded.header.vaultId !== vaultId)
    throw new AttentionError('wrong-vault', 'snapshot-vault-mismatch');
  if (
    decoded.header.authorDeviceId !== head.deviceId ||
    decoded.header.deviceSequence !== head.deviceSequence
  )
    throw new AttentionError('invalid-remote-snapshot', 'head-envelope-mismatch');
  return decoded.state;
}

/**
 * "Replace this backup with this device's journal" (#185, P8), after the
 * user confirms: deletes the head files of other devices that the last pass
 * could not read, if each is still the one it skipped (a device that has
 * since published a new head keeps it). Their snapshots stay until
 * retention removes them. The next pass publishes this device's journal,
 * joined with every readable head as usual. Returns how many were deleted.
 */
export async function removeUnreadableHeads(
  provider: Pick<SnapshotProvider, 'listHeads' | 'deleteDeviceHead' | 'downloadSnapshot'>,
  vaultId: string,
  skipped: readonly SkippedHead[],
  work: CodecWork = jsCodecWork,
): Promise<number> {
  let removed = 0;
  for (const target of skipped.filter((head) => head.reason === 'unreadable')) {
    // Listed again right before each delete, so the window in which that
    // device could publish over this file is one request.
    const current = (await provider.listHeads(vaultId, true)).find(
      (head) => head.physicalId === target.physicalId,
    );
    if (!current) continue;
    const head = current.head as Partial<DeviceHead> | null;
    const snapshotId = head && isString(head.snapshotId) ? head.snapshotId : null;
    if (snapshotId !== target.snapshotId) continue;
    // A head that reads well now (its snapshot was only late, or a download
    // failed) is kept.
    if (head && headShape(head as Record<string, unknown>)) {
      try {
        await checkSnapshot(
          vaultId,
          head as DeviceHead,
          await provider.downloadSnapshot(vaultId, head.snapshotId!),
          work,
        );
        continue;
      } catch (error) {
        const unreadable =
          (error instanceof AttentionError && error.reason !== 'unsupported-format') ||
          (error instanceof SnapshotProviderError && error.code === 'invalid-data');
        if (!unreadable) throw error;
      }
    }
    await provider.deleteDeviceHead(vaultId, target.physicalId);
    removed += 1;
  }
  return removed;
}
