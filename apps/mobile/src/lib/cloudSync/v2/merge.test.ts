import golden from '../../../../docs/cloud-sync/v7-phase0/fixtures/merge-golden-v2.json';
import { canonicalHashV2, canonicalizeV2 } from './canonical';
import { encodeSnapshotV2 } from './codec';
import { mergeSnapshotDomainsV2 } from './merge';
import type { SnapshotDomainV2, SnapshotEntryV2 } from './types';
import { calculateMediaReferencesV2 } from './validation';

const cases = golden.cases as unknown as {
  id: string;
  base: SnapshotDomainV2 | null;
  local: SnapshotDomainV2;
  remote: SnapshotDomainV2;
  expected: SnapshotDomainV2;
}[];

function conflictSymmetricView(domain: SnapshotDomainV2): unknown {
  return {
    ...domain,
    conflicts: domain.conflicts.map((conflict) => ({
      ...conflict,
      localValueHash: [conflict.localValueHash, conflict.remoteValueHash].sort()[0],
      remoteValueHash: [conflict.localValueHash, conflict.remoteValueHash].sort()[1],
    })),
  };
}

function emptyDomain(entry: SnapshotEntryV2): SnapshotDomainV2 {
  return {
    entries: [entry], tags: [], entryTags: [], prompts: [],
    profile: { profileId: 'profile', displayName: null, photoAssetId: null, updatedAt: 1 },
    media: [], tombstones: [], conflicts: [],
  };
}

function blankDomain(): SnapshotDomainV2 {
  return {
    entries: [], tags: [], entryTags: [], prompts: [],
    profile: { profileId: 'profile', displayName: null, photoAssetId: null, updatedAt: 1 },
    media: [], tombstones: [], conflicts: [],
  };
}

describe('snapshot v2 merge engine', () => {
  it.each(cases)('matches frozen golden case $id byte-identically', ({ base, local, remote, expected }) => {
    const actual = mergeSnapshotDomainsV2(base, local, remote);
    expect(canonicalizeV2(actual)).toBe(canonicalizeV2(expected));
  });

  it.each(cases)('is idempotent for golden case $id', ({ base, local, remote }) => {
    const once = mergeSnapshotDomainsV2(base, local, remote);
    const twice = mergeSnapshotDomainsV2(base, once, once);
    expect(canonicalizeV2(twice)).toBe(canonicalizeV2(once));
  });

  it.each(cases)('is commutative for user state and conflict candidates in $id', ({ base, local, remote }) => {
    const left = mergeSnapshotDomainsV2(base, local, remote);
    const right = mergeSnapshotDomainsV2(base, remote, local);
    expect(canonicalizeV2(conflictSymmetricView(left))).toBe(canonicalizeV2(conflictSymmetricView(right)));
  });

  it('keeps authored text and derives stable recovery IDs across generated conflicts', () => {
    let seed = 0x51a7e;
    const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
    for (let index = 0; index < 128; index++) {
      const baseEntry: SnapshotEntryV2 = {
        entryId: `entry-property-${index}`, title: 'Synthetic base', content: 'Synthetic base body',
        mood: null, createdAt: 1, updatedAt: 1, conflictOriginId: null,
      };
      const localText = `Synthetic local ${next()}`;
      const remoteText = `Synthetic remote ${next()}`;
      const local = emptyDomain({ ...baseEntry, content: localText, updatedAt: 2 });
      const remote = emptyDomain({ ...baseEntry, content: remoteText, updatedAt: 3 });
      const base = emptyDomain(baseEntry);
      const first = mergeSnapshotDomainsV2(base, local, remote);
      const second = mergeSnapshotDomainsV2(base, local, remote);
      const bodies = new Set(first.entries.map((entry) => entry.content));
      expect(bodies).toEqual(new Set([localText, remoteText]));
      expect(first.entries.map((entry) => entry.entryId)).toEqual(second.entries.map((entry) => entry.entryId));
    }
  });

  it('carries a non-conflicting text-field edit into both conflict branches', () => {
    const baseEntry: SnapshotEntryV2 = {
      entryId: 'entry-mixed-text', title: 'Base title', content: 'Base body', mood: null,
      createdAt: 1, updatedAt: 1, conflictOriginId: null,
    };
    const base = emptyDomain(baseEntry);
    const local = emptyDomain({ ...baseEntry, title: 'Local title', content: 'Local-only body', updatedAt: 2 });
    const remote = emptyDomain({ ...baseEntry, title: 'Remote title', updatedAt: 3 });
    const merged = mergeSnapshotDomainsV2(base, local, remote);
    expect(merged.entries).toHaveLength(2);
    expect(merged.entries.every((entry) => entry.content === 'Local-only body')).toBe(true);
    expect(new Set(merged.entries.map((entry) => entry.title)))
      .toEqual(new Set(['Local title', 'Remote title']));
  });

  it('calculates primary, alternate and entry-owned media references', () => {
    const profileCase = cases.find((item) => item.id === 'profile-independent-fields-and-photo-conflict')!;
    const merged = mergeSnapshotDomainsV2(profileCase.base, profileCase.local, profileCase.remote);
    expect(calculateMediaReferencesV2(merged)).toEqual(new Set(['asset-b', 'asset-c']));
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
    const merged = mergeSnapshotDomainsV2(base, local, base);
    expect(merged.tags).toEqual([]);
    expect(merged.entryTags).toEqual([]);
    expect(merged.tombstones).toEqual(local.tombstones);
    expect(merged.conflicts).toEqual([]);
  });

  it('never lets a base-less tombstone erase a live authored entry', () => {
    const liveEntry: SnapshotEntryV2 = {
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
    const merged = mergeSnapshotDomainsV2(null, local, remote);
    expect(merged.entries).toEqual([liveEntry]);
    expect(merged.tombstones).toEqual([]);
    expect(merged.conflicts.map((value) => value.field)).toEqual(['deleteEdit']);
  });

  it('rejects immutable media mutation and derived recovery ID collisions', () => {
    const mediaCase = cases.find((item) => item.id === 'entry-asset-remove-versus-concurrent-reference')!;
    const invalidRemote = structuredClone(mediaCase.remote);
    invalidRemote.media[0].blobHash = 'e'.repeat(64);
    expect(() => mergeSnapshotDomainsV2(mediaCase.base, mediaCase.local, invalidRemote))
      .toThrow(/media.blobHash/);

    const textCase = cases.find((item) => item.id === 'concurrent-entry-title-and-body-preserve-recovery')!;
    const collisionLocal = structuredClone(textCase.local);
    collisionLocal.entries.push({
      entryId: 'recovered-b4810beb3416030e8e560b8a897a8aae', title: null,
      content: 'Different synthetic record', mood: null, createdAt: 1, updatedAt: 1,
      conflictOriginId: null,
    });
    expect(() => mergeSnapshotDomainsV2(textCase.base, collisionLocal, textCase.remote))
      .toThrow(/Derived entity ID/);
  });

  it('never retains media whose unchanged owner lost to a valid deletion', () => {
    const entry: SnapshotEntryV2 = {
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
      baseStateHash: canonicalHashV2(entry), deletedStateHash: canonicalHashV2(entry),
      deletedByDeviceId: 'device-a', deletionSequence: 2,
    }];
    const remote = structuredClone(base);
    remote.media[0] = { ...remote.media[0], width: 20, updatedAt: 2 };

    const merged = mergeSnapshotDomainsV2(base, local, remote);
    expect(merged.entries).toEqual([]);
    expect(merged.media).toEqual([]);
    expect(merged.conflicts).toEqual([]);
    expect(() => encodeSnapshotV2({
      format: 'tackbok-snapshot', formatVersion: 2, vaultId: 'vault-w1',
      parentSnapshotIds: [], observedDeviceHeads: [], authorDeviceId: 'device-a',
      deviceSequence: 3, createdAt: 3, ...merged,
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
    expect(canonicalizeV2(mergeSnapshotDomainsV2(null, first, second)))
      .toBe(canonicalizeV2(mergeSnapshotDomainsV2(null, second, first)));
  });
});
