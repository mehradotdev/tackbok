/**
 * Cloud sync v2 (#185, step P4): stamps every local write with this device's
 * hybrid logical clock, in the caller's transaction, even with sync off.
 * Nothing reads the stamps yet; the v2 capture (P5) will.
 *
 * Per record (`sync_records`): the version vector gains the write's stamp and
 * each field the write changed gets it in `stamps_json`. A write that changes
 * nothing stamps nothing. Tag memberships carry their add's stamp on
 * `entry_tags`. Attachments are stamped when first published (P6), so here
 * an attach or detach only stamps the entry's vector.
 *
 * A delete keeps the record's values in `sync_deleted_records` and records a
 * tombstone (`del_json`) that saw the whole vector, as the v2 model does.
 * Removing a deleted tag from its entries is a side effect, not an edit of
 * them, so those entries get no stamp.
 *
 * shortcut: v1 sync's remote applies (`productionJournal.ts`) write without
 * stamps; v1 is removed before the v2 engine ships (P6), and the v2 capture
 * must treat a domain row without metadata as an unstamped local row.
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
import { nextHlc } from '../v2/clock';
import type { Stamp, VersionVector } from '../v2/types';
import type { CloudSyncTransaction, SyncEntityType } from './repositories';

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
  const hlc = nextHlc(ctx, now);
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

function withStamp(vv: VersionVector, [hlc, device]: Stamp): VersionVector {
  return (vv[device] ?? -1) >= hlc ? vv : { ...vv, [device]: hlc };
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
  const vv = withStamp(row ? (JSON.parse(row.vv_json) as VersionVector) : {}, s);
  const known = row?.known_json
    ? JSON.stringify(withStamp(JSON.parse(row.known_json) as VersionVector, s))
    : null;
  const values = {
    vv_json: JSON.stringify(vv),
    known_json: known,
    stamps_json: JSON.stringify(stamps),
    updated_at: now,
  };
  await tx
    .insert(syncRecords)
    .values({ entity_type: type, entity_id: id, ...values })
    .onConflictDoUpdate({
      target: [syncRecords.entity_type, syncRecords.entity_id],
      set: values,
    });
  // A record written again after a delete (not reachable for entries, whose
  // IDs are never reused) is shown: its retained copy is stale.
  if (row?.del_json)
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
 * record's last values (`retained`) kept behind it.
 */
export async function stampDeleteInTransaction(
  tx: CloudSyncTransaction,
  type: SyncEntityType,
  id: string,
  retained: Json,
  now: number,
): Promise<Stamp> {
  const s = await tickInTransaction(tx, now);
  const row = await recordRow(tx, type, id);
  const vv = withStamp(row ? (JSON.parse(row.vv_json) as VersionVector) : {}, s);
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
    known_json: row?.known_json
      ? JSON.stringify(withStamp(JSON.parse(row.known_json) as VersionVector, s))
      : null,
    del_json: JSON.stringify(del),
    updated_at: now,
  };
  await tx
    .insert(syncRecords)
    .values({ entity_type: type, entity_id: id, stamps_json: '{}', ...values })
    .onConflictDoUpdate({
      target: [syncRecords.entity_type, syncRecords.entity_id],
      set: values,
    });
  const record = JSON.stringify({
    stamps: row ? (JSON.parse(row.stamps_json) as Json) : {},
    values: retained,
  });
  await tx
    .insert(syncDeletedRecords)
    .values({ entity_type: type, entity_id: id, record_json: record, deleted_at: now })
    .onConflictDoUpdate({
      target: [syncDeletedRecords.entity_type, syncDeletedRecords.entity_id],
      set: { record_json: record, deleted_at: now },
    });
  return s;
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
