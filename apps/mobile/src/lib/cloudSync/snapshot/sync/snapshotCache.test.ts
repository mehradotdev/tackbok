import type { JournalSnapshotPayload } from '../types';
import { VerifiedSnapshotCache } from './snapshotCache';

function payload(vaultId: string, deviceSequence = 1): JournalSnapshotPayload {
  return {
    format: 'tackbok-snapshot',
    vaultId,
    parentSnapshotIds: [],
    observedDeviceHeads: [],
    authorDeviceId: 'device',
    deviceSequence,
    createdAt: 1,
    entries: [],
    tags: [],
    entryTags: [],
    prompts: [],
    profile: {
      profileId: 'profile',
      displayName: null,
      photoAssetId: null,
      updatedAt: 1,
    },
    media: [],
    tombstones: [],
    conflicts: [],
  };
}

describe('verified snapshot cache', () => {
  test('evicts the least recently used snapshot past the entry limit', () => {
    const cache = new VerifiedSnapshotCache({ entries: 2, decodedBytes: 1_000 });
    cache.set('vault', 'a', payload('vault', 1), 10);
    cache.set('vault', 'b', payload('vault', 2), 10);
    // Reading `a` makes `b` the least recently used.
    expect(cache.get('vault', 'a')?.deviceSequence).toBe(1);
    cache.set('vault', 'c', payload('vault', 3), 10);
    expect(cache.get('vault', 'b')).toBeUndefined();
    expect(cache.get('vault', 'a')).toBeDefined();
    expect(cache.get('vault', 'c')).toBeDefined();
    expect(cache.size).toBe(2);
    expect(cache.retainedBytes).toBe(20);
  });

  test('evicts until the retained decoded bytes fit', () => {
    const cache = new VerifiedSnapshotCache({ entries: 10, decodedBytes: 100 });
    cache.set('vault', 'a', payload('vault', 1), 40);
    cache.set('vault', 'b', payload('vault', 2), 40);
    cache.set('vault', 'c', payload('vault', 3), 50);
    expect(cache.get('vault', 'a')).toBeUndefined();
    expect(cache.get('vault', 'b')).toBeDefined();
    expect(cache.retainedBytes).toBe(90);
    // A snapshot larger than the whole allowance is never kept.
    cache.set('vault', 'huge', payload('vault', 4), 101);
    expect(cache.get('vault', 'huge')).toBeUndefined();
    expect(cache.retainedBytes).toBe(90);
    // Storing the same snapshot again does not count its bytes twice.
    cache.set('vault', 'b', payload('vault', 2), 40);
    expect(cache.retainedBytes).toBe(90);
  });

  test('keeps each vault apart', () => {
    const cache = new VerifiedSnapshotCache();
    cache.set('vault-a', 'same-id', payload('vault-a'), 10);
    expect(cache.get('vault-b', 'same-id')).toBeUndefined();
    // A payload is only stored under the vault it names.
    cache.set('vault-b', 'other-id', payload('vault-a'), 10);
    expect(cache.get('vault-b', 'other-id')).toBeUndefined();
    expect(cache.get('vault-a', 'same-id')?.vaultId).toBe('vault-a');
  });

  test('clear drops every snapshot and its bytes', () => {
    const cache = new VerifiedSnapshotCache();
    cache.set('vault', 'a', payload('vault'), 10);
    cache.clear();
    expect(cache.get('vault', 'a')).toBeUndefined();
    expect(cache.size).toBe(0);
    expect(cache.retainedBytes).toBe(0);
  });

  test('cached payloads cannot be changed in place', () => {
    const cache = new VerifiedSnapshotCache();
    cache.set('vault', 'a', payload('vault'), 10);
    const cached = cache.get('vault', 'a')!;
    expect(Object.isFrozen(cached)).toBe(true);
    expect(Object.isFrozen(cached.entries)).toBe(true);
    expect(Object.isFrozen(cached.profile)).toBe(true);
  });
});
