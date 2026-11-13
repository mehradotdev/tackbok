import { completeAttachmentOrder } from '../attachmentOrder';
import type { SnapshotDomain, SnapshotEntry, SnapshotMedia } from '../types';

/**
 * With "Sync media on Wi-Fi only" on cellular, new entry attachments wait for
 * Wi-Fi while the rest of the journal publishes. A snapshot never references a
 * blob Drive lacks, so the published snapshot leaves those attachments out.
 *
 * Leaving them out never reads as a deletion: an attachment is only deleted by
 * a merge when a base snapshot held it, and a deferred attachment was never in
 * any snapshot. The local journal keeps them, and the base shadow stays the
 * published snapshot, so the next pass sees them as local additions.
 */

/** Entry attachments the local journal holds and the base snapshot does not. */
export function unpublishedEntryMedia(
  local: SnapshotDomain,
  base: SnapshotDomain | null,
): SnapshotMedia[] {
  const published = new Set((base?.media ?? []).map((asset) => asset.assetId));
  return local.media.filter(
    (asset) => asset.ownerType === 'entry' && !published.has(asset.assetId),
  );
}

/** The domain without the attachments whose blobs wait for Wi-Fi. */
export function withoutDeferredMedia(
  domain: SnapshotDomain,
  deferredHashes: ReadonlySet<string>,
): SnapshotDomain {
  const deferredIds = new Set(
    domain.media
      .filter((asset) => deferredHashes.has(asset.blobHash))
      .map((asset) => asset.assetId),
  );
  if (deferredIds.size === 0) return domain;
  return {
    ...domain,
    media: domain.media.filter((asset) => !deferredIds.has(asset.assetId)),
    entries: domain.entries.map((entry) => {
      if (!entry.attachmentOrder?.some((id) => deferredIds.has(id))) return entry;
      const order = entry.attachmentOrder.filter((id) => !deferredIds.has(id));
      if (order.length > 0) return { ...entry, attachmentOrder: order };
      // The merge drops an empty order too; validation never sees one.
      const { attachmentOrder: _order, ...withoutOrder } = entry;
      return withoutOrder;
    }),
  };
}

/**
 * The journal to apply locally after publishing `published`: it adds back the
 * entry attachments that publication left out. Those are local attachments
 * that neither the published snapshot nor the base it was merged against
 * holds, on entries that are still live. A merge never drops such an addition
 * otherwise, so this restores exactly the deferred ones, even after the
 * process restarts between publishing and applying.
 */
export function restoreDeferredMedia(
  published: SnapshotDomain,
  local: SnapshotDomain,
  base: SnapshotDomain | null,
): SnapshotDomain {
  const publishedIds = new Set(published.media.map((asset) => asset.assetId));
  const liveEntries = new Set(published.entries.map((entry) => entry.entryId));
  const restored = unpublishedEntryMedia(local, base).filter(
    (asset) => !publishedIds.has(asset.assetId) && liveEntries.has(asset.ownerId),
  );
  if (restored.length === 0) return published;
  const restoredIds = new Set(restored.map((asset) => asset.assetId));
  const localEntries = new Map(local.entries.map((entry) => [entry.entryId, entry]));
  const media = [...published.media, ...restored].sort((left, right) =>
    left.assetId.localeCompare(right.assetId),
  );
  const owners = new Set(restored.map((asset) => asset.ownerId));
  return {
    ...published,
    media,
    entries: published.entries.map((entry): SnapshotEntry => {
      if (!owners.has(entry.entryId)) return entry;
      const localOrder = localEntries.get(entry.entryId)?.attachmentOrder;
      // Preserve the byte shape of legacy entries until an order is known.
      if (localOrder === undefined && entry.attachmentOrder === undefined) return entry;
      const liveIds = media
        .filter((asset) => asset.ownerType === 'entry' && asset.ownerId === entry.entryId)
        .map((asset) => asset.assetId);
      // Keep the published order, which may hold another device's reorder,
      // and put each restored attachment after the one it follows locally.
      const order = [...(entry.attachmentOrder ?? [])];
      const localIds = localOrder ?? [];
      localIds.forEach((id, index) => {
        if (!restoredIds.has(id)) return;
        let at = 0;
        for (let previous = index - 1; previous >= 0; previous -= 1) {
          const position = order.indexOf(localIds[previous]);
          if (position >= 0) {
            at = position + 1;
            break;
          }
        }
        order.splice(at, 0, id);
      });
      const attachmentOrder = completeAttachmentOrder(order, liveIds);
      return { ...entry, attachmentOrder };
    }),
  };
}
