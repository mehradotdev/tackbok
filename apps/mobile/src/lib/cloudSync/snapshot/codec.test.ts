import { encodeGzip } from '~/lib/zip/core/gzip-codec';

import canonicalFixtures from './fixtures/canonical.json';
import { encodeCanonicalBytes } from './canonical';
import { decodeSnapshot, encodeSnapshot } from './codec';
import { sha256Bytes } from './sha256';
import type { JournalSnapshotPayload } from './types';

const minimal = canonicalFixtures.vectors.find((vector) => vector.id === 'minimal-snapshot-shape')!
  .value as JournalSnapshotPayload;

function gzip(bytes: Uint8Array): Uint8Array {
  return encodeGzip(bytes, { level: 6 });
}

describe('snapshot codec', () => {
  it('round-trips a payload with deterministic gzip bytes', () => {
    const first = encodeSnapshot(minimal);
    const second = encodeSnapshot(structuredClone(minimal));
    expect(first.snapshotId).toBe(canonicalFixtures.vectors.at(-1)!.sha256);
    expect(first.compressedBytes).toEqual(second.compressedBytes);
    expect(first.compressedBytes[4]).toBe(0);
    expect(first.compressedBytes[9]).toBe(255);
    expect(decodeSnapshot(first.compressedBytes, first.snapshotId).payload).toEqual(minimal);
  });

  it('rejects duplicate object keys before JSON materialization', () => {
    const duplicate = '{"format":"tackbok-snapshot","\\u0066ormat":"tackbok-snapshot"}';
    const bytes = new TextEncoder().encode(duplicate);
    expect(() => decodeSnapshot(gzip(bytes), sha256Bytes(bytes))).toThrow(/Duplicate JSON key/);
  });

  it('rejects malformed UTF-8, non-canonical bytes, a wrong hash and unknown fields', () => {
    const malformed = gzip(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc0, 0xaf, 0x7d]));
    expect(() => decodeSnapshot(malformed, 'a'.repeat(64))).toThrow(/UTF-8/);

    const pretty = new TextEncoder().encode(JSON.stringify(minimal, null, 2));
    expect(() => decodeSnapshot(gzip(pretty), sha256Bytes(pretty))).toThrow(/not canonical/);

    const encoded = encodeSnapshot(minimal);
    expect(() => decodeSnapshot(encoded.compressedBytes, 'b'.repeat(64))).toThrow(/does not match/);

    const unknown = { ...minimal, unexpected: true };
    const unknownBytes = encodeCanonicalBytes(unknown);
    expect(() => decodeSnapshot(gzip(unknownBytes), sha256Bytes(unknownBytes))).toThrow(/missing or unknown/);
  });

  it('rejects concatenated members and a bounded decompression bomb before mutation', () => {
    const valid = encodeSnapshot(minimal);
    const concatenated = new Uint8Array(valid.compressedBytes.length * 2);
    concatenated.set(valid.compressedBytes);
    concatenated.set(valid.compressedBytes, valid.compressedBytes.length);
    expect(() => decodeSnapshot(concatenated, valid.snapshotId)).toThrow(/members/);

    const corruptTrailer = valid.compressedBytes.slice();
    corruptTrailer[corruptTrailer.length - 8] ^= 1;
    expect(() => decodeSnapshot(corruptTrailer, valid.snapshotId)).toThrow(/CRC/);

    const oversized = new Uint8Array(64 * 1024 * 1024 + 1);
    oversized.fill(0x20);
    const bomb = gzip(oversized);
    let domainMutationCount = 0;
    try {
      decodeSnapshot(bomb, 'a'.repeat(64));
      domainMutationCount++;
    } catch {
      // Expected at the bounded output sink, before a domain value exists.
    }
    expect(domainMutationCount).toBe(0);
  }, 30_000);

  it('rejects dangling references and non-normalized collection order', () => {
    const dangling: JournalSnapshotPayload = {
      ...structuredClone(minimal),
      entryTags: [{ entryId: 'missing', tagId: 'missing', createdAt: 1 }],
    };
    const danglingBytes = encodeCanonicalBytes(dangling);
    expect(() => decodeSnapshot(gzip(danglingBytes), sha256Bytes(danglingBytes))).toThrow(/missing entity/);

    const unordered: JournalSnapshotPayload = {
      ...structuredClone(minimal),
      parentSnapshotIds: ['b'.repeat(64), 'a'.repeat(64)],
    };
    const unorderedBytes = encodeCanonicalBytes(unordered);
    expect(() => decodeSnapshot(gzip(unorderedBytes), sha256Bytes(unorderedBytes))).toThrow(/strictly sorted/);
  });

  it('rejects an empty media MIME type', () => {
    const invalid = structuredClone(minimal);
    invalid.entries = [{
      entryId: 'entry-mime', title: null, content: null, mood: null,
      createdAt: 1, updatedAt: 1, conflictOriginId: null,
    }];
    invalid.media = [{
      assetId: 'asset-mime', ownerType: 'entry', ownerId: 'entry-mime', kind: 'photo',
      blobHash: 'a'.repeat(64), mimeType: '', byteSize: 1, width: null, height: null,
      durationMs: null, createdAt: 1, updatedAt: 1,
    }];
    expect(() => encodeSnapshot(invalid)).toThrow(/MIME type|mimeType/);
  });

  it('rejects the compressed-size cap before decompression', () => {
    expect(() => decodeSnapshot(new Uint8Array(16 * 1024 * 1024 + 1), 'a'.repeat(64)))
      .toThrow(/Compressed snapshot exceeds/);
  });
});
