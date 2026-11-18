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
 *    head, or holds other devices' writes it last acknowledged more than a
 *    day ago (acknowledgements let compaction run; publishing one on every
 *    pull would double the uploads).
 *
 * Another device's head that cannot be read (a corrupt head file, a missing
 * or invalid snapshot, two snapshots under one sequence) or whose clock is
 * more than 7 days ahead is skipped while at least one readable head exists,
 * and listed for the user (`SkippedHead`). Nothing is deleted: removing
 * unreadable heads is a confirmed user action (`removeUnreadableHeads`).
 * With no readable head at all, the pass pauses instead.
 *
 * The join has no base, so there is no ancestor walk, virtual base or base
 * shadow, and a publication needs no staged candidate: everything it uploads
 * is already applied locally, so a pass stopped half way publishes on the
 * next one.
 */
import { and, eq } from 'drizzle-orm';

import { mediaAssets, runExclusiveDbTransaction, syncDevice, syncHeads } from '~/db';

import { attentionReasonForProviderError } from '../../failureClassification';
import type { CloudSyncTransaction } from '../../storage/repositories';
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
  decodeEnvelope,
  encodeEnvelope,
} from '../../v2/codec';
import { absorb, compact } from '../../v2/compact';
import { SyncJoinError } from '../../v2/join';
import { markSeen, rewriteDates } from '../../v2/ops';
import { isLive } from '../../v2/view';
import type { SyncState, VersionVector } from '../../v2/types';
import { SnapshotValidationError } from '../caps';
import { canonicalize } from '../canonical';
import { AttentionError, RetryableSyncError, SyncCancelledError } from './errors';
import {
  entriesHidden,
  isMassDeletion,
  massDeletionToken,
  type MassDeletionChoice,
} from './massDeletion';
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
/** Retention: an unreferenced snapshot older than this may be deleted. */
const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DELETES_PER_PASS = 10;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** A snapshot that could not be read is downloaded again after this long. */
const UNREADABLE_RETRY_MS = 24 * 60 * 60 * 1000;
/**
 * The error class of the pause for "no head can be read": the only pause
 * "Replace this backup" is offered for, and one that retries by itself once
 * the listed heads change.
 */
export const NO_READABLE_HEAD = 'no-readable-device-head';

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
  /** Retention runs after a publication, or at most this often. */
  private lastCleanupAt = Number.NEGATIVE_INFINITY;
  private readonly hooks: SnapshotSyncHooks;
  private readonly now: () => number;

  constructor(private readonly options: V2EngineOptions) {
    this.hooks = { ...options.hooks, progress: isolateProgress(options.hooks?.progress) };
    this.now = options.now ?? (() => Date.now());
  }

  async sync(): Promise<SnapshotSyncResult> {
    if (this.running) throw new Error('A snapshot sync pass is already running');
    this.running = true;
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
    if (ambiguous.has(deviceId))
      throw new AttentionError(
        'ambiguous-device-head',
        'same-sequence-different-snapshot',
      );
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
    let readable =
      own !== undefined ||
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
    const unpublished = await runExclusiveDbTransaction((tx) =>
      unpublishedAttachmentsInTransaction(tx as CloudSyncTransaction),
    );
    const plan = this.publication(ctx, deviceId, own, ownRecord);
    const mediaReady =
      unpublished.length > 0 && (await provider.mediaTransfersAllowed?.()) !== false;
    if (changed.length === 0 && !plan.needed && !mediaReady) {
      await this.cleanup(kept, false);
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
    for (const { head } of failed)
      skipped.push({
        physicalId: head.physicalId,
        deviceId: head.deviceId,
        snapshotId: head.snapshotId,
        reason: 'unreadable',
        retryAt: this.now() + UNREADABLE_RETRY_MS,
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
      let state = joinAll(captured.state);
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
          state = joinAll(rewriteDates(captured.state, writer, hidden));
      }
      publish = this.publication(state.ctx, deviceId, own, ownRecord).needed;
      if (publish) state = markSeen(state, writer);
      state = compact(state);
      this.hooks.activity?.('applying-remote-snapshot');
      takenIn = remotes
        .map((remote) => remote.head)
        .filter((head) => !refused.some((entry) => entry.head === head));
      const applied = await applySyncState(captured, state, this.options.files, (tx) =>
        this.recordTakenIn(tx, takenIn),
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
      await this.cleanup(kept, false);
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
    await this.cleanup([...kept, snapshotId], true);
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
    if (!own || !record || own.snapshotId !== record.snapshotId || !record.ctx)
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
    for (const { blobHash, source } of uploads) {
      try {
        await provider.uploadMedia(this.vaultId, blobHash, source);
      } catch (error) {
        // The policy refused: the rest wait for Wi-Fi too.
        if (error instanceof SnapshotProviderError && error.code === 'wifi-only-media')
          break;
        throw error;
      }
      present.add(blobHash);
      this.hooks.progress?.({ type: 'item', phase: 'uploading-media' });
      await this.hooks.at?.('during-media-transfer');
    }
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
        failed.push({ head, error: unreadable });
      }
    }
    return { remotes, failed };
  }

  private async downloadOne(
    provider: SnapshotProvider,
    head: ReadHead,
  ): Promise<SyncState> {
    this.hooks.activity?.('reading-remote-snapshot');
    const bytes = await provider.downloadSnapshot(this.vaultId, head.snapshotId);
    this.hooks.progress?.({ type: 'item', phase: 'downloading' });
    await this.hooks.at?.('during-remote-snapshot-download');
    return checkSnapshot(this.vaultId, head, bytes);
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
    const present = await provider.hasMediaBatch(this.vaultId, hashes);
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
    const encoded = encodeEnvelope(state, {
      authorDeviceId: deviceId,
      deviceSequence,
      createdAt,
    });
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
   * Retention, best effort: snapshots no head points to, older than 30 days
   * by their upload time on the provider, a few at a time. Heads only ever
   * move to new snapshots, so an unreferenced old one is never needed again.
   * Runs after a publication, or once a day; the heads are listed again
   * right before deleting, so a head missing from an earlier listing never
   * loses its snapshot. While any head file cannot be read, nothing is
   * deleted: its snapshots cannot be told apart from unreferenced ones.
   */
  private async cleanup(kept: readonly string[], published: boolean) {
    const { provider } = this.options;
    if (!published && this.now() - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = this.now();
    try {
      const candidates = (await provider.listSnapshots(this.vaultId)).filter(
        (snapshot) =>
          !kept.includes(snapshot.snapshotId) &&
          snapshot.createdAt > 0 &&
          this.now() - snapshot.createdAt >= SNAPSHOT_RETENTION_MS,
      );
      if (candidates.length === 0) return;
      const listed = await provider.listHeads(this.vaultId, true);
      if (listed.some(({ head }) => head === null)) return;
      const referenced = new Set([
        ...kept,
        ...listed.map(({ head }) => String(head!.snapshotId)),
      ]);
      for (const snapshot of candidates
        .filter((candidate) => !referenced.has(candidate.snapshotId))
        .slice(0, MAX_DELETES_PER_PASS)) {
        await this.hooks.at?.('during-snapshot-cleanup');
        await provider.deleteSnapshot(this.vaultId, snapshot.snapshotId);
      }
    } catch (error) {
      if (!(error instanceof SnapshotProviderError)) throw error;
      // Provider trouble only keeps more history.
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
   * update-required pause once the app is updated (the head is read again).
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
    // device published again), without waiting for "Replace".
    if (
      durable.pauseReason !== 'merge-failed' &&
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
      else if (error.errorClass === NO_READABLE_HEAD)
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
function checkSnapshot(
  vaultId: string,
  head: DeviceHead,
  bytes: Uint8Array | null,
): SyncState {
  if (!bytes) throw new AttentionError('head-snapshot-missing', 'head-target-not-found');
  let decoded: ReturnType<typeof decodeEnvelope>;
  try {
    decoded = decodeEnvelope(bytes, head.snapshotId);
  } catch (error) {
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
        checkSnapshot(
          vaultId,
          head as DeviceHead,
          await provider.downloadSnapshot(vaultId, head.snapshotId!),
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
