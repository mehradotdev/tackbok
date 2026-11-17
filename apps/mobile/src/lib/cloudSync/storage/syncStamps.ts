/**
 * Cloud sync v2 (#185, steps P4-P5): stamps every local write with this
 * device's hybrid logical clock, in the caller's transaction, even with sync
 * off. The v2 capture (`v2State.ts`) reads the stamps.
 *
 * Per record (`sync_records`): the version vector gains the write's stamp and
 * each field the write changed gets it in `stamps_json`. A write that changes
 * nothing stamps nothing. Tag memberships carry their add's stamp on
 * `entry_tags`. Attachments are stamped when first published (P6), so here
 * an attach or detach only stamps the entry's vector.
 *
 * Items beside the shown value (`sync_field_values`) follow the model's
 * writes: an edit replaces the shown version and equal copies of it, other
 * open versions stay (`dropEqualVersionsInTransaction`); removing a member
 * removes every stamp of it (`dropMemberStampsInTransaction`); the order
 * register keeps the exact value written under its stamp
 * (`writeOrderInTransaction`).
 *
 * A delete keeps the record's values in `sync_deleted_records` and records a
 * tombstone (`del_json`) that saw the whole vector, as the v2 model does.
 * Removing a deleted tag from its entries is a side effect, not an edit of
 * them, so those entries get no stamp.
 *
 * v1 sync's remote applies never kept this metadata, so the first v2 sync
 * with a vault rebuilds it from the journal under a new device ID
 * (`rebuildSyncMetadataInTransaction`).
 */
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import {
  entryTags,
  syncDeletedRecords,
  syncDevice,
  syncFieldValues,
  syncRecords,
} from '~/db';
import { nextHlc, withStamp } from '../v2/clock';
import { normalKnown } from '../v2/join';
import type { Known, Stamp, VersionVector } from '../v2/types';
import type { CloudSyncTransaction, SyncEntityType } from './repositories';
import { retainedValuesInTransaction } from './v2State';

const SELF = 'self';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** This install's v2 device ID; created here if the 0008 row is somehow missing. */
async function deviceRow(tx: CloudSyncTransaction, now: number) {
  const [row] = await tx
    .select()
    .from(syncDevice)
    .where(eq(syncDevice.id, SELF))
    .limit(1);
  if (row) return row;
  const created = {
    id: SELF,
    device_id: randomUUID(),
    ctx_json: '{}',
    roster_json: '{}',
    acks_json: '{}',
    floor_json: null,
    created_at: now,
    updated_at: now,
  };
  await tx.insert(syncDevice).values(created);
  return created;
}

/** A fresh stamp: the HLC moves past everything this device has seen, then is recorded. */
export async function tickInTransaction(
  tx: CloudSyncTransaction,
  now: number,
): Promise<Stamp> {
  const row = await deviceRow(tx, now);
  const ctx = JSON.parse(row.ctx_json) as Record<string, number>;
  const roster = JSON.parse(row.roster_json) as Record<string, number>;
  // The real clock, never later: imports pass an archive's timestamps as
  // `now`, and a future one would drag this device's clock ahead for good.
  const hlc = nextHlc(ctx, Math.min(now, Date.now()));
  ctx[row.device_id] = hlc;
  roster[row.device_id] = hlc;
  await tx
    .update(syncDevice)
    .set({
      ctx_json: JSON.stringify(ctx),
      roster_json: JSON.stringify(roster),
      updated_at: now,
    })
    .where(eq(syncDevice.id, SELF));
  return [hlc, row.device_id];
}

/**
 * What a record holds values for after a write `s`, as `stamped` in the
 * model: null stays null; otherwise the write joins `known`, claiming the
 * writer's older writes only if it already held all of them (an entry
 * brought back after compaction may lack some).
 */
function knownAfter(
  knownJson: string | null | undefined,
  before: VersionVector,
  s: Stamp,
  vv: VersionVector,
): string | null {
  if (!knownJson) return null;
  const known = JSON.parse(knownJson) as Known;
  const writer = s[1];
  const complete = (known.vv[writer] ?? -1) >= (before[writer] ?? -1);
  const next = normalKnown(
    complete
      ? { vv: withStamp(known.vv, s), extra: known.extra }
      : { vv: known.vv, extra: [...known.extra, s] },
    vv,
  );
  return next === null ? null : JSON.stringify(next);
}

async function recordRow(tx: CloudSyncTransaction, type: SyncEntityType, id: string) {
  const [row] = await tx
    .select()
    .from(syncRecords)
    .where(and(eq(syncRecords.entity_type, type), eq(syncRecords.entity_id, id)))
    .limit(1);
  return row;
}

/**
 * Records a local write to `fields` of a record. No fields: nothing changed,
 * no stamp. Returns the stamp, or null.
 */
export async function stampWriteInTransaction(
  tx: CloudSyncTransaction,
  type: SyncEntityType,
  id: string,
  fields: readonly string[],
  now: number,
): Promise<Stamp | null> {
  if (fields.length === 0) return null;
  const s = await tickInTransaction(tx, now);
  const row = await recordRow(tx, type, id);
  const stamps = row ? (JSON.parse(row.stamps_json) as Record<string, Stamp>) : {};
  for (const field of fields) stamps[field] = s;
  const before = row ? (JSON.parse(row.vv_json) as VersionVector) : {};
  const vv = withStamp(before, s);
  // A local write to a deleted record (an import restoring its ID) brings it
  // back. The user did it, so no "came back" notice: acknowledge the delete.
  const del = row?.del_json ? (JSON.parse(row.del_json) as { seen: Json }) : null;
  const values = {
    vv_json: JSON.stringify(vv),
    known_json: knownAfter(row?.known_json, before, s, vv),
    stamps_json: JSON.stringify(stamps),
    ...(del ? { del_json: JSON.stringify({ ...del, ackSeen: del.seen }) } : {}),
    updated_at: now,
  };
  await tx
    .insert(syncRecords)
    .values({ entity_type: type, entity_id: id, ...values })
    .onConflictDoUpdate({
      target: [syncRecords.entity_type, syncRecords.entity_id],
      set: values,
    });
  // Shown again: the write supplies its values, so the retained copy goes.
  if (del)
    await tx
      .delete(syncDeletedRecords)
      .where(
        and(
          eq(syncDeletedRecords.entity_type, type),
          eq(syncDeletedRecords.entity_id, id),
        ),
      );
  return s;
}

/**
 * Records a local delete: a tombstone that saw the whole vector, and the
 * record's values in their deleted form (`sync_deleted_records`, with every
 * open version and member stamp), read before the caller removes its rows.
 */
export async function stampDeleteInTransaction(
  tx: CloudSyncTransaction,
  type: Exclude<SyncEntityType, 'profile'>,
  id: string,
  now: number,
): Promise<Stamp> {
  const retained = await retainedValuesInTransaction(tx, type, id);
  const s = await tickInTransaction(tx, now);
  const row = await recordRow(tx, type, id);
  const before = row ? (JSON.parse(row.vv_json) as VersionVector) : {};
  const vv = withStamp(before, s);
  const prior = row?.del_json
    ? (JSON.parse(row.del_json) as {
        seen: VersionVector;
        ackSeen: VersionVector | null;
        ext: Json;
      })
    : null;
  const del = { at: s, seen: vv, ackSeen: prior?.ackSeen ?? null, ext: prior?.ext ?? {} };
  const values = {
    vv_json: JSON.stringify(vv),
    known_json: knownAfter(row?.known_json, before, s, vv),
    // The shown values' stamps now live with the kept values.
    stamps_json: '{}',
    del_json: JSON.stringify(del),
    updated_at: now,
  };
  await tx
    .insert(syncRecords)
    .values({ entity_type: type, entity_id: id, ...values })
    .onConflictDoUpdate({
      target: [syncRecords.entity_type, syncRecords.entity_id],
      set: values,
    });
  // The other versions and member stamps are now part of the kept values.
  await tx
    .delete(syncFieldValues)
    .where(and(eq(syncFieldValues.entity_type, type), eq(syncFieldValues.entity_id, id)));
  if (retained) {
    const record = JSON.stringify(retained);
    await tx
      .insert(syncDeletedRecords)
      .values({ entity_type: type, entity_id: id, record_json: record, deleted_at: now })
      .onConflictDoUpdate({
        target: [syncDeletedRecords.entity_type, syncDeletedRecords.entity_id],
        set: { record_json: record, deleted_at: now },
      });
  }
  return s;
}

/** An edit replaced the shown `value` of `field`: equal copies beside it go too. */
export async function dropEqualVersionsInTransaction(
  tx: CloudSyncTransaction,
  type: SyncEntityType,
  id: string,
  field: 'title' | 'text' | 'name' | 'photo',
  value: Json,
): Promise<void> {
  await tx
    .delete(syncFieldValues)
    .where(
      and(
        eq(syncFieldValues.entity_type, type),
        eq(syncFieldValues.entity_id, id),
        eq(syncFieldValues.field, field),
        eq(syncFieldValues.value_json, JSON.stringify(value)),
      ),
    );
}

/** A tag or attachment left the entry: its other stamps go with its row. */
export async function dropMemberStampsInTransaction(
  tx: CloudSyncTransaction,
  noteId: string,
  field: 'tags' | 'attachments',
  memberIds: readonly string[],
): Promise<void> {
  for (const memberId of memberIds)
    await tx
      .delete(syncFieldValues)
      .where(
        and(
          eq(syncFieldValues.entity_type, 'entry'),
          eq(syncFieldValues.entity_id, noteId),
          eq(syncFieldValues.field, field),
          eq(syncFieldValues.value_json, JSON.stringify(memberId)),
        ),
      );
}

/** The order register's value at a write: what the capture publishes under `s`. */
export async function writeOrderInTransaction(
  tx: CloudSyncTransaction,
  noteId: string,
  order: readonly string[],
  s: Stamp,
): Promise<void> {
  await tx
    .delete(syncFieldValues)
    .where(
      and(
        eq(syncFieldValues.entity_type, 'entry'),
        eq(syncFieldValues.entity_id, noteId),
        eq(syncFieldValues.field, 'order'),
      ),
    );
  await tx.insert(syncFieldValues).values({
    entity_type: 'entry',
    entity_id: noteId,
    field: 'order',
    stamp_hlc: s[0],
    stamp_device: s[1],
    value_json: JSON.stringify(order),
  });
}

/** Stamps the given tag memberships of an entry (new adds). */
export async function stampMembershipsInTransaction(
  tx: CloudSyncTransaction,
  noteId: string,
  tagIds: readonly string[],
  s: Stamp,
): Promise<void> {
  for (const tagId of tagIds)
    await tx
      .update(entryTags)
      .set({ stamp_hlc: s[0], stamp_device: s[1] })
      .where(and(eq(entryTags.note_id, noteId), eq(entryTags.tag_id, tagId)));
}

/**
 * After local state is lost ("Delete all", "Delete journal everywhere", the
 * local wipe): forget every record's metadata and take a new device ID with
 * an empty context. An ID is never reused once its state is gone, or another
 * device could read its new writes as ones it had already seen.
 */
export async function resetSyncIdentityInTransaction(
  tx: CloudSyncTransaction,
  now: number,
): Promise<void> {
  await tx.delete(syncRecords);
  await tx.delete(syncDeletedRecords);
  await tx.delete(syncFieldValues);
  await tx.delete(syncDevice);
  await tx.insert(syncDevice).values({
    id: SELF,
    device_id: randomUUID(),
    ctx_json: '{}',
    roster_json: '{}',
    acks_json: '{}',
    floor_json: null,
    created_at: now,
    updated_at: now,
  });
}
