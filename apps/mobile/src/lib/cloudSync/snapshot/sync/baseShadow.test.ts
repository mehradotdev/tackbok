import { encodeGzip } from '~/lib/zip/core/gzip-codec';

import golden from '../fixtures/merge-golden.json';
import { encodeCanonicalBytes } from '../canonical';
import { encodeSnapshot } from '../codec';
import { sha256Bytes } from '../sha256';
import type { JournalSnapshotPayload, SnapshotDomain } from '../types';
import { decodeBaseShadow, encodeBaseShadow } from './baseShadow';
import type { BaseShadow } from './types';

const domains = (
  golden.cases as unknown as { id: string; expected: SnapshotDomain }[]
).map(({ id, expected }) => ({ id, expected }));

function shadowOf(domain: SnapshotDomain): BaseShadow {
  const encoded = encodeSnapshot({
    format: 'tackbok-snapshot',
    vaultId: 'vault-golden',
    parentSnapshotIds: ['b'.repeat(64), 'a'.repeat(64)],
    observedDeviceHeads: [
      { deviceId: 'device-b', deviceSequence: 3, snapshotId: 'c'.repeat(64) },
      { deviceId: 'device-a', deviceSequence: 7, snapshotId: 'd'.repeat(64) },
    ],
    authorDeviceId: 'device-a',
    deviceSequence: 8,
    createdAt: 1_800_000_000_000,
    ...domain,
  } as JournalSnapshotPayload);
  return {
    format: 'tackbok-base-shadow',
    vaultId: 'vault-golden',
    snapshotId: encoded.snapshotId,
    acceptedDeviceHeads: [
      { deviceId: 'device-a', deviceSequence: 8, snapshotId: encoded.snapshotId },
      { deviceId: 'device-b', deviceSequence: 3, snapshotId: 'c'.repeat(64) },
    ],
    payload: encoded.payload,
  };
}

// Frozen before #150's serialisation reuse: base-shadow files and their
// checkpoint hashes must stay byte-for-byte identical.
const FROZEN: Record<string, { canonicalSha256: string; compressedSha256: string }> = {
  'concurrent-entry-title-and-body-preserve-recovery': {
    canonicalSha256: '20d34d1f7734bbe2d566f831e96451f32f00cf56c6e28a2fde3653f8ac53a826',
    compressedSha256: '21b0f7a1e79960c4df7722842cb45aa956c25015665671899a2349ea163396b0',
  },
  'delete-versus-entry-edit': {
    canonicalSha256: '586532afb52af1f1ef65c7d0f4e900b9f4878ed64e6c1ca57de553a964533f0e',
    compressedSha256: 'f6c55c9233990fb7b37e24297c83381485f4cda637af440e3f91bf96386d13e5',
  },
  'entry-asset-remove-versus-concurrent-reference': {
    canonicalSha256: 'b50c081708f70241419cb2eeab2c8761a221cd8645c6a608c7b083c1d850d241',
    compressedSha256: '95c2750c031e8efcd7905de82ea0ee092d44482f27224d2e61d335c32d7c3e4f',
  },
  'entry-disjoint-fields-and-set-membership': {
    canonicalSha256: '22b31bd810ad6dbc6507b5a17e7c50f52e92b1f42552c382ffdcd50560e0c196',
    compressedSha256: 'badba0ebb33bc436de080af3c61c3f443e123caae4c71bb0516fe245295c8c2c',
  },
  'profile-independent-fields-and-photo-conflict': {
    canonicalSha256: '0ee3676e0d4a106eccfaf32b49490c947aaa7c1750fa628de28ffe7e6eb34ed9',
    compressedSha256: '80c5498f1993fbc590707cd8e9194a73657f93466a211d1b91cfd35180164116',
  },
  'prompt-concurrent-rename': {
    canonicalSha256: 'f8ea08eea5ebbdd70ac2b934b74eae14234498c35923ceaa4610785db23cf719',
    compressedSha256: 'd6e63a98aba1faf90fd0f95183cef7683837a15fda743f953d48ba656300f535',
  },
  'tag-rename-and-concurrent-new-reference-defeats-delete': {
    canonicalSha256: '79b3312eae83c44b6b92f2bc61a6f2a729f3f9d00a97cd7cd60504df4b3ea986',
    compressedSha256: '97c988a1b7bfc3c32ed7e3ce24004631876abc033a932e18eefeeec9061aac16',
  },
  'unreadable-base-is-conservative': {
    canonicalSha256: '9a8a3ec64056fcbc7a81c1b627c7c1064a73c7fc049e9567c137791924549c12',
    compressedSha256: '32c0abe2350e7b90fbbb247bec957c1550a6d8117d499d45678f8691ec837a67',
  },
};

describe('base shadow encoding', () => {
  it.each(domains)('keeps frozen bytes and hashes for $id', ({ id, expected }) => {
    const shadow = shadowOf(expected);
    const encoded = encodeBaseShadow(shadow);
    expect(encoded.canonicalBytes).toEqual(encodeCanonicalBytes(shadow));
    expect(encoded.canonicalSha256).toBe(sha256Bytes(encodeCanonicalBytes(shadow)));
    const actual = {
      canonicalSha256: encoded.canonicalSha256,
      compressedSha256: sha256Bytes(encoded.compressedBytes),
    };
    expect(actual).toEqual(FROZEN[id]);

    const decoded = decodeBaseShadow(encoded.compressedBytes);
    expect(decoded.canonicalSha256).toBe(encoded.canonicalSha256);
    expect(decoded.shadow).toEqual(shadow);
  });

  it('rejects a payload that is not already normalized', () => {
    const shadow = shadowOf(
      domains.find(({ expected }) => expected.entries.length > 1)!.expected,
    );
    const unsorted = {
      ...shadow,
      payload: { ...shadow.payload, entries: [...shadow.payload.entries].reverse() },
    };
    expect(() => encodeBaseShadow(unsorted)).toThrow(/not normalized/);
  });

  it('rejects non-canonical shadow bytes', () => {
    const shadow = shadowOf(domains[0].expected);
    const pretty = new TextEncoder().encode(JSON.stringify(shadow, null, 1));
    expect(() => decodeBaseShadow(encodeGzip(pretty, { level: 6 }))).toThrow(
      /not canonical JSON/,
    );
  });
});
