import type { ConflictField, EntityType } from '../snapshot/types';

/** One persisted conflict record, with the parts the conflicts card needs. */
export interface CloudConflictRecord {
  conflictId: string;
  entityType: EntityType;
  field: ConflictField;
  /** The losing value kept by the merge; `undefined` when none was kept. */
  alternateValue: string | null | undefined;
  recoveredEntityIds: string[];
  createdAt: number;
}

/**
 * An actionable row on the conflicts card. Each row lists every conflict
 * record it resolves, so one action acknowledges them all.
 */
export type CloudConflictItem =
  | {
      kind: 'name';
      conflictIds: string[];
      current: string | null;
      other: string | null;
    }
  | {
      kind: 'photo';
      conflictIds: string[];
      otherAssetId: string;
      otherUri: string;
    }
  | {
      kind: 'entries';
      conflictIds: string[];
      recoveredEntryIds: string[];
    };

export interface ConflictSummaryContext {
  /** When this device joined the backup. Older records are hidden. */
  joinedAt: number;
  currentName: string | null;
  currentPhotoAssetId: string | null;
  /** Profile photos whose files exist on this device, keyed by asset ID. */
  localPhotoUris: ReadonlyMap<string, string>;
  /** Recovered entries that still exist in the journal. */
  existingEntryIds: ReadonlySet<string>;
}

/** Reads the fields the card uses from a stored, already validated conflict. */
export function parseConflictRecord(
  conflictId: string,
  conflictJson: string,
  createdAt: number,
): CloudConflictRecord {
  const conflict = JSON.parse(conflictJson) as {
    entityType: EntityType;
    field: ConflictField;
    alternates?: { value: string | null }[];
    recoveredEntityIds?: string[];
  };
  return {
    conflictId,
    entityType: conflict.entityType,
    field: conflict.field,
    alternateValue: conflict.alternates?.[0]?.value,
    recoveredEntityIds: conflict.recoveredEntityIds ?? [],
    createdAt,
  };
}

/**
 * Turns unacknowledged conflict records into card rows. Records with nothing
 * to act on stay in storage but are not listed: media metadata
 * (`assetReference`), delete/edit races, photos whose file is not on this
 * device, values that already match, and fields without an action.
 */
export function deriveConflictItems(
  records: readonly CloudConflictRecord[],
  context: ConflictSummaryContext,
): CloudConflictItem[] {
  const names = new Map<string | null, string[]>();
  const photos = new Map<string, string[]>();
  const entryConflictIds: string[] = [];
  const recoveredEntryIds = new Set<string>();

  for (const record of records) {
    // shortcut: dismissal and this join filter are local to the device;
    // syncing dismissals needs a snapshot format change, so do that then.
    if (record.createdAt <= context.joinedAt) continue;

    if (record.entityType === 'profile' && record.field === 'displayName') {
      if (record.alternateValue === undefined) continue;
      if (record.alternateValue === context.currentName) continue;
      const ids = names.get(record.alternateValue) ?? [];
      ids.push(record.conflictId);
      names.set(record.alternateValue, ids);
      continue;
    }

    if (record.entityType === 'profile' && record.field === 'photoAssetId') {
      const assetId = record.alternateValue;
      if (!assetId || assetId === context.currentPhotoAssetId) continue;
      if (!context.localPhotoUris.has(assetId)) continue;
      const ids = photos.get(assetId) ?? [];
      ids.push(record.conflictId);
      photos.set(assetId, ids);
      continue;
    }

    if (record.entityType === 'entry') {
      const existing = record.recoveredEntityIds.filter((id) =>
        context.existingEntryIds.has(id),
      );
      if (existing.length === 0) continue;
      entryConflictIds.push(record.conflictId);
      for (const id of existing) recoveredEntryIds.add(id);
    }
  }

  const items: CloudConflictItem[] = [];
  for (const [other, conflictIds] of names) {
    items.push({ kind: 'name', conflictIds, current: context.currentName, other });
  }
  for (const [otherAssetId, conflictIds] of photos) {
    items.push({
      kind: 'photo',
      conflictIds,
      otherAssetId,
      otherUri: context.localPhotoUris.get(otherAssetId)!,
    });
  }
  if (entryConflictIds.length > 0) {
    items.push({
      kind: 'entries',
      conflictIds: entryConflictIds,
      recoveredEntryIds: [...recoveredEntryIds].sort(),
    });
  }
  return items;
}
