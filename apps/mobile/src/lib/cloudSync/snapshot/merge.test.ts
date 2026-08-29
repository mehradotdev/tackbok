import golden from './fixtures/merge-golden.json';
import { canonicalHash, canonicalize } from './canonical';
import { encodeSnapshot } from './codec';
import { mergeSnapshotDomains } from './merge';
import type { SnapshotDomain, SnapshotEntry } from './types';
import { calculateMediaReferences } from './validation';

const cases = golden.cases as unknown as {
  id: string;
  base: SnapshotDomain | null;
  local: SnapshotDomain;
  remote: SnapshotDomain;
  expected: SnapshotDomain;
}[];

function conflictSymmetricView(domain: SnapshotDomain): unknown {
  return {
    ...domain,
    conflicts: domain.conflicts.map((conflict) => ({
      ...conflict,
      localValueHash: [conflict.localValueHash, conflict.remoteValueHash].sort()[0],
      remoteValueHash: [conflict.localValueHash, conflict.remoteValueHash].sort()[1],
    })),
  };
}

function emptyDomain(entry: SnapshotEntry): SnapshotDomain {
  return {
    entries: [entry], tags: [], entryTags: [], prompts: [],
    profile: { profileId: 'profile', displayName: null, photoAssetId: null, updatedAt: 1 },
    media: [], tombstones: [], conflicts: [],
  };
}

function blankDomain(): SnapshotDomain {
  return {
    entries: [], tags: [], entryTags: [], prompts: [],
    profile: { profileId: 'profile', displayName: null, photoAssetId: null, updatedAt: 1 },
    media: [], tombstones: [], conflicts: [],
  };
}

describe('snapshot merge engine', () => {
  it.each(cases)('matches frozen golden case $id byte-identically', ({ base, local, remote, expected }) => {
    const actual = mergeSnapshotDomains(base, local, remote);
    expect(canonicalize(actual)).toBe(canonicalize(expected));
  });

  it.each(cases)('is idempotent for golden case $id', ({ base, local, remote }) => {
    const once = mergeSnapshotDomains(base, local, remote);
    const twice = mergeSnapshotDomains(base, once, once);
    expect(canonicalize(twice)).toBe(canonicalize(once));
  });

  it.each(cases)('is commutative for user state and conflict candidates in $id', ({ base, local, remote }) => {
    const left = mergeSnapshotDomains(base, local, remote);
    const right = mergeSnapshotDomains(base, remote, local);
    expect(canonicalize(conflictSymmetricView(left))).toBe(canonicalize(conflictSymmetricView(right)));
  });

  it('keeps authored text and derives stable recovery IDs across generated conflicts', () => {
    let seed = 0x51a7e;
    const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
    for (let index = 0; index < 128; index++) {
      const baseEntry: SnapshotEntry = {
        entryId: `entry-property-${index}`, title: 'Synthetic base', content: 'Synthetic base body',
        mood: null, createdAt: 1, updatedAt: 1, conflictOriginId: null,
      };
      const localText = `Synthetic local ${next()}`;
      const remoteText = `Synthetic remote ${next()}`;
      const local = emptyDomain({ ...baseEntry, content: localText, updatedAt: 2 });
      const remote = emptyDomain({ ...baseEntry, content: remoteText, updatedAt: 3 });
      const base = emptyDomain(baseEntry);
      const first = mergeSnapshotDomains(base, local, remote);
      const second = mergeSnapshotDomains(base, local, remote);
      const bodies = new Set(first.entries.map((entry) => entry.content));
      expect(bodies).toEqual(new Set([localText, remoteText]));
      expect(first.entries.map((entry) => entry.entryId)).toEqual(second.entries.map((entry) => entry.entryId));
    }
  });

  it('carries a non-conflicting text-field edit into both conflict branches', () => {
    const baseEntry: SnapshotEntry = {
      entryId: 'entry-mixed-text', title: 'Base title', content: 'Base body', mood: null,
      createdAt: 1, updatedAt: 1, conflictOriginId: null,
    };
    const base = emptyDomain(baseEntry);
    const local = emptyDomain({ ...baseEntry, title: 'Local title', content: 'Local-only body', updatedAt: 2 });
    const remote = emptyDomain({ ...baseEntry, title: 'Remote title', updatedAt: 3 });
    const merged = mergeSnapshotDomains(base, local, remote);
    expect(merged.entries).toHaveLength(2);
    expect(merged.entries.every((entry) => entry.content === 'Local-only body')).toBe(true);
    expect(new Set(merged.entries.map((entry) => entry.title)))
      .toEqual(new Set(['Local title', 'Remote title']));
  });

  it('calculates primary, alternate and entry-owned media references', () => {
    const profileCase = cases.find((item) => item.id === 'profile-independent-fields-and-photo-conflict')!;
    const merged = mergeSnapshotDomains(profileCase.base, profileCase.local, profileCase.remote);
    expect(calculateMediaReferences(merged)).toEqual(new Set(['asset-b', 'asset-c']));
  });

  it('lets deletion beat an unchanged branch and removes its relations', () => {
    const base = cases.find((item) => item.id === 'tag-rename-and-concurrent-new-reference-defeats-delete')!.base!;
    const local = structuredClone(base);
    local.tags = [];
    local.entryTags = [];
    local.tombstones = [{
      entityType: 'tag', entityId: 'tag-c', baseStateHash: 'a'.repeat(64),
      deletedStateHash: 'a'.repeat(64), deletedByDeviceId: 'device-a', deletionSequence: 2,
    }];
    const merged = mergeSnapshotDomains(base, local, base);
    expect(merged.tags).toEqual([]);
    expect(merged.entryTags).toEqual([]);
    expect(merged.tombstones).toEqual(local.tombstones);
    expect(merged.conflicts).toEqual([]);
  });

  it('never lets a base-less tombstone erase a live authored entry', () => {
    const liveEntry: SnapshotEntry = {
      entryId: 'entry-base-less', title: null, content: 'Synthetic authored value', mood: null,
      createdAt: 1, updatedAt: 2, conflictOriginId: null,
    };
    const local = blankDomain();
    local.tombstones = [{
      entityType: 'entry', entityId: liveEntry.entryId, baseStateHash: null,
      deletedStateHash: null, deletedByDeviceId: 'device-a', deletionSequence: 1,
    }];
    const remote = blankDomain();
    remote.entries = [liveEntry];
    const merged = mergeSnapshotDomains(null, local, remote);
    expect(merged.entries).toEqual([liveEntry]);
    expect(merged.tombstones).toEqual([]);
    expect(merged.conflicts.map((value) => value.field)).toEqual(['deleteEdit']);
  });

  it('rejects immutable media mutation and derived recovery ID collisions', () => {
    const mediaCase = cases.find((item) => item.id === 'entry-asset-remove-versus-concurrent-reference')!;
    const invalidRemote = structuredClone(mediaCase.remote);
    invalidRemote.media[0].blobHash = 'e'.repeat(64);
    expect(() => mergeSnapshotDomains(mediaCase.base, mediaCase.local, invalidRemote))
      .toThrow(/media.blobHash/);

    const textCase = cases.find((item) => item.id === 'concurrent-entry-title-and-body-preserve-recovery')!;
    const collisionLocal = structuredClone(textCase.local);
    collisionLocal.entries.push({
      entryId: 'recovered-b4810beb3416030e8e560b8a897a8aae', title: null,
      content: 'Different synthetic record', mood: null, createdAt: 1, updatedAt: 1,
      conflictOriginId: null,
    });
    expect(() => mergeSnapshotDomains(textCase.base, collisionLocal, textCase.remote))
      .toThrow(/Derived entity ID/);
  });

  it('never retains media whose unchanged owner lost to a valid deletion', () => {
    const entry: SnapshotEntry = {
      entryId: 'entry-media-owner', title: null, content: 'Synthetic base', mood: null,
      createdAt: 1, updatedAt: 1, conflictOriginId: null,
    };
    const media = {
      assetId: 'asset-observed', ownerType: 'entry' as const, ownerId: entry.entryId,
      kind: 'photo' as const, blobHash: 'a'.repeat(64), mimeType: 'image/jpeg',
      byteSize: 100, width: 10, height: 10, durationMs: null, createdAt: 1, updatedAt: 1,
    };
    const base = emptyDomain(entry);
    base.media = [media];
    const local = blankDomain();
    local.tombstones = [{
      entityType: 'entry', entityId: entry.entryId,
      baseStateHash: canonicalHash(entry), deletedStateHash: canonicalHash(entry),
      deletedByDeviceId: 'device-a', deletionSequence: 2,
    }];
    const remote = structuredClone(base);
    remote.media[0] = { ...remote.media[0], width: 20, updatedAt: 2 };

    const merged = mergeSnapshotDomains(base, local, remote);
    expect(merged.entries).toEqual([]);
    expect(merged.media).toEqual([]);
    expect(merged.conflicts).toEqual([]);
    expect(() => encodeSnapshot({
      format: 'tackbok-snapshot', vaultId: 'vault-w1',
      parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: 'device-a',
      deviceSequence: 3, createdAt: 3, ...merged,
    })).not.toThrow();
  });

  it('prunes deleted recovery IDs without changing the durable conflict identity', () => {
    const entry: SnapshotEntry = {
      entryId: 'entry-recovery-delete', title: 'Base', content: 'Base body', mood: null,
      createdAt: 1, updatedAt: 1, conflictOriginId: null,
    };
    const base = emptyDomain(entry);
    const first = mergeSnapshotDomains(
      base,
      emptyDomain({ ...entry, content: 'Local body', updatedAt: 2 }),
      emptyDomain({ ...entry, content: 'Remote body', updatedAt: 3 }),
    );
    const recovered = first.entries.find((value) => value.conflictOriginId === entry.entryId)!;
    const local = structuredClone(first);
    local.entries = local.entries.filter((value) => value.entryId !== recovered.entryId);
    local.tombstones.push({
      entityType: 'entry',
      entityId: recovered.entryId,
      baseStateHash: canonicalHash(recovered),
      deletedStateHash: canonicalHash(recovered),
      deletedByDeviceId: 'device-a',
      deletionSequence: 4,
    });

    const merged = mergeSnapshotDomains(first, local, first);
    expect(merged.conflicts).not.toHaveLength(0);
    expect(merged.conflicts.every((value) => value.recoveredEntityIds.length === 0)).toBe(true);
    expect(merged.conflicts.map((value) => value.conflictId))
      .toEqual(first.conflicts.map((value) => value.conflictId));
    expect(() => encodeSnapshot({
      format: 'tackbok-snapshot', vaultId: 'vault-recovery-delete',
      parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: 'device-a',
      deviceSequence: 5, createdAt: 5, ...merged,
    })).not.toThrow();
  });

  it('chooses equal-sequence tombstone provenance independently of argument order', () => {
    const first = blankDomain();
    first.tombstones = [{
      entityType: 'entry', entityId: 'entry-deleted', baseStateHash: null,
      deletedStateHash: 'a'.repeat(64), deletedByDeviceId: 'device-z', deletionSequence: 5,
    }];
    const second = blankDomain();
    second.tombstones = [{
      ...first.tombstones[0], deletedByDeviceId: 'device-a',
    }];
    expect(canonicalize(mergeSnapshotDomains(null, first, second)))
      .toBe(canonicalize(mergeSnapshotDomains(null, second, first)));
  });
});
