import type { ConflictField, EntityType } from '../snapshot/types';

/** One persisted conflict record, with the parts the conflicts card needs. */
export interface CloudConflictRecord {
  conflictId: string;
  entityType: EntityType;
  entityId: string;
  field: ConflictField;
  /** Whether the merge had a common earlier version to compare against. */
  hasBase: boolean;
  /** The losing value kept by the merge; `undefined` when none was kept. */
  alternateValue: string | null | undefined;
  recoveredEntityIds: string[];
  createdAt: number;
  /** Moved off the card by the one-time upgrade archive; still actionable. */
  archived: boolean;
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
      /** Kept from before the upgrade; listed under older name versions. */
      archived: boolean;
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
    }
  | {
      /** An entry deleted on one device and edited on another: the edit was kept. */
      kind: 'returnedEntry';
      conflictIds: string[];
      entry: ReturnedEntrySummary;
      /**
       * Whether the kept side was provably edited. Without a common earlier
       * version the merge keeps the entry even when nothing was edited, e.g. a
       * device joining with entries another device had deleted.
       */
      edited: boolean;
    };

/** Enough of a returned entry for the user to recognize it. */
export interface ReturnedEntrySummary {
  entryId: string;
  createdAt: number;
  title: string | null;
  /** The start of the entry's text. */
  preview: string | null;
}

export interface ConflictSummaryContext {
  /** When this device joined the backup. Older records are hidden. */
  joinedAt: number;
  currentName: string | null;
  currentPhotoAssetId: string | null;
  /** The current photo's verified content hash, when known. */
  currentPhotoBlobHash: string | null;
  /** Profile photos whose files exist on this device, keyed by asset ID. */
  localPhotos: ReadonlyMap<string, { uri: string; blobHash: string | null }>;
  /** Recovered entries that still exist in the journal. */
  existingEntryIds: ReadonlySet<string>;
  /** Entries named by delete/edit records that are in the journal, by ID. */
  returnedEntries: ReadonlyMap<string, ReturnedEntrySummary>;
}

/** Reads the fields the card uses from a stored, already validated conflict. */
export function parseConflictRecord(
  conflictId: string,
  conflictJson: string,
  createdAt: number,
  archived = false,
): CloudConflictRecord {
  const conflict = JSON.parse(conflictJson) as {
    entityType: EntityType;
    entityId: string;
    field: ConflictField;
    baseValueHash?: string | null;
    alternates?: { value: string | null }[];
    recoveredEntityIds?: string[];
  };
  return {
    conflictId,
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    field: conflict.field,
    hasBase: conflict.baseValueHash != null,
    alternateValue: conflict.alternates?.[0]?.value,
    recoveredEntityIds: conflict.recoveredEntityIds ?? [],
    createdAt,
    archived,
  };
}

/**
 * Turns unacknowledged conflict records into card rows. Records with nothing
 * to act on stay in storage but are not listed: media metadata
 * (`assetReference`), delete/edit races that left the item deleted or that
 * were about a tag or prompt, photos whose file is not on this device, photos
 * with the same content as the current one, values that already match, and
 * fields without an action.
 */
export function deriveConflictItems(
  records: readonly CloudConflictRecord[],
  context: ConflictSummaryContext,
): CloudConflictItem[] {
  const names = new Map<string | null, { conflictIds: string[]; archived: boolean }>();
  // Keyed by content hash when known, so copies of one photo share a row.
  const photos = new Map<string, { assetId: string; conflictIds: string[] }>();
  const entryConflictIds: string[] = [];
  const recoveredEntryIds = new Set<string>();
  const returned = new Map<string, { conflictIds: string[]; edited: boolean }>();

  for (const record of records) {
    // shortcut: dismissal and this join filter are local to the device;
    // syncing dismissals needs a snapshot format change, so do that then.
    if (record.createdAt <= context.joinedAt) continue;

    if (record.entityType === 'profile' && record.field === 'displayName') {
      if (record.alternateValue === undefined) continue;
      if (record.alternateValue === context.currentName) continue;
      const row = names.get(record.alternateValue) ?? { conflictIds: [], archived: true };
      row.conflictIds.push(record.conflictId);
      row.archived &&= record.archived;
      names.set(record.alternateValue, row);
      continue;
    }

    if (record.entityType === 'profile' && record.field === 'photoAssetId') {
      const assetId = record.alternateValue;
      if (!assetId || assetId === context.currentPhotoAssetId) continue;
      const photo = context.localPhotos.get(assetId);
      if (!photo) continue;
      if (photo.blobHash && photo.blobHash === context.currentPhotoBlobHash) continue;
      const key = photo.blobHash ?? assetId;
      const row = photos.get(key) ?? { assetId, conflictIds: [] };
      row.conflictIds.push(record.conflictId);
      photos.set(key, row);
      continue;
    }

    if (record.entityType === 'entry' && record.field === 'deleteEdit') {
      // Both sides deleting leaves the entry deleted, so it is not in the journal.
      if (!context.returnedEntries.has(record.entityId)) continue;
      const row = returned.get(record.entityId) ?? { conflictIds: [], edited: false };
      row.conflictIds.push(record.conflictId);
      row.edited ||= record.hasBase;
      returned.set(record.entityId, row);
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
  for (const [other, { conflictIds, archived }] of names) {
    items.push({
      kind: 'name',
      conflictIds,
      current: context.currentName,
      other,
      archived,
    });
  }
  for (const { assetId, conflictIds } of photos.values()) {
    items.push({
      kind: 'photo',
      conflictIds,
      otherAssetId: assetId,
      otherUri: context.localPhotos.get(assetId)!.uri,
    });
  }
  if (entryConflictIds.length > 0) {
    items.push({
      kind: 'entries',
      conflictIds: entryConflictIds,
      recoveredEntryIds: [...recoveredEntryIds].sort(),
    });
  }
  const returnedItems = [...returned].map(([entryId, { conflictIds, edited }]) => ({
    kind: 'returnedEntry' as const,
    conflictIds,
    entry: context.returnedEntries.get(entryId)!,
    edited,
  }));
  returnedItems.sort(
    (a, b) =>
      b.entry.createdAt - a.entry.createdAt ||
      a.entry.entryId.localeCompare(b.entry.entryId),
  );
  items.push(...returnedItems);
  return items;
}
