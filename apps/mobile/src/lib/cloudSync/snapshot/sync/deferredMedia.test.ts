import type { SnapshotDomain, SnapshotEntry, SnapshotMedia } from '../types';
import {
  restoreDeferredMedia,
  unpublishedEntryMedia,
  withoutDeferredMedia,
} from './deferredMedia';

function entry(entryId: string, attachmentOrder?: string[]): SnapshotEntry {
  return {
    entryId,
    ...(attachmentOrder ? { attachmentOrder } : {}),
    title: null,
    content: entryId,
    mood: null,
    createdAt: 1,
    updatedAt: 1,
    conflictOriginId: null,
  };
}

function photo(assetId: string, ownerId: string): SnapshotMedia {
  return {
    assetId,
    ownerType: 'entry',
    ownerId,
    kind: 'photo',
    blobHash: `hash-${assetId}`,
    mimeType: 'image/jpeg',
    byteSize: 1,
    width: 1,
    height: 1,
    durationMs: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function domain(entries: SnapshotEntry[], media: SnapshotMedia[]): SnapshotDomain {
  return {
    entries,
    tags: [],
    entryTags: [],
    prompts: [],
    profile: {
      profileId: 'profile',
      displayName: null,
      photoAssetId: null,
      updatedAt: 1,
    },
    media,
    tombstones: [],
    conflicts: [],
  };
}

describe('attachments waiting for Wi-Fi', () => {
  const base = domain([entry('e1', ['old'])], [photo('old', 'e1')]);
  const local = domain(
    [entry('e1', ['new', 'old']), entry('e2', ['only'])],
    [photo('new', 'e1'), photo('old', 'e1'), photo('only', 'e2')],
  );

  it('finds entry attachments the base does not hold', () => {
    expect(unpublishedEntryMedia(local, base).map((asset) => asset.assetId)).toEqual([
      'new',
      'only',
    ]);
    expect(unpublishedEntryMedia(local, null)).toHaveLength(3);
  });

  it('leaves deferred attachments out of descriptors and display order', () => {
    const published = withoutDeferredMedia(local, new Set(['hash-new', 'hash-only']));
    expect(published.media.map((asset) => asset.assetId)).toEqual(['old']);
    expect(published.entries).toEqual([entry('e1', ['old']), entry('e2')]);
    expect(withoutDeferredMedia(local, new Set())).toBe(local);
  });

  it('restores them in their local place, keeping changes from the publication', () => {
    const published = withoutDeferredMedia(local, new Set(['hash-new', 'hash-only']));
    expect(restoreDeferredMedia(published, local, base)).toEqual(local);

    // Another device added a photo to e1; it stays, after the local order.
    const merged = domain(
      [entry('e1', ['old', 'remote']), entry('e2')],
      [photo('old', 'e1'), photo('remote', 'e1')],
    );
    const restored = restoreDeferredMedia(merged, local, base);
    expect(restored.entries[0].attachmentOrder).toEqual(['new', 'old', 'remote']);
    expect(restored.media.map((asset) => asset.assetId)).toEqual([
      'new',
      'old',
      'only',
      'remote',
    ]);
  });

  it('keeps a reorder from another device when it puts a restored attachment back', () => {
    const reorderedBase = domain(
      [entry('e1', ['a', 'b'])],
      [photo('a', 'e1'), photo('b', 'e1')],
    );
    const withNew = domain(
      [entry('e1', ['a', 'new', 'b'])],
      [photo('a', 'e1'), photo('b', 'e1'), photo('new', 'e1')],
    );
    const published = domain(
      [entry('e1', ['b', 'a'])],
      [photo('a', 'e1'), photo('b', 'e1')],
    );
    expect(
      restoreDeferredMedia(published, withNew, reorderedBase).entries[0].attachmentOrder,
    ).toEqual(['b', 'a', 'new']);
  });

  it('never restores a published attachment the merge deleted, or one on a deleted entry', () => {
    // `old` was in the base and is gone from the publication: a real deletion.
    // e2 was deleted, so its attachment goes with it.
    const published = domain([entry('e1')], []);
    const restored = restoreDeferredMedia(published, local, base);
    expect(restored.media.map((asset) => asset.assetId)).toEqual(['new']);
    expect(restored.entries).toEqual([entry('e1', ['new'])]);
  });
});
