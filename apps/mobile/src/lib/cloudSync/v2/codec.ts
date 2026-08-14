import {
  decodeGzipBounded,
  encodeGzip,
  GzipCodecError,
} from '~/lib/zip/core/gzip-codec';

import { canonicalBytesV2 } from './canonical';
import { SNAPSHOT_V2_CAPS, invalid } from './caps';
import { sha256BytesV2 } from './sha256';
import { decodeUtf8Strict, parseJsonStrictV2 } from './strictJson';
import type { EncodedSnapshotV2, JournalSnapshotPayloadV2, StoredJournalSnapshotV2 } from './types';
import {
  normalizeSnapshotV2,
  validateSnapshotV2Collections,
  validateSnapshotV2Shape,
} from './validation';

const HASH = /^[0-9a-f]{64}$/;
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function decompressBounded(compressed: Uint8Array): Uint8Array {
  try {
    return decodeGzipBounded(compressed, {
      maxCompressedBytes: SNAPSHOT_V2_CAPS.compressedBytes,
      maxUncompressedBytes: SNAPSHOT_V2_CAPS.uncompressedBytes,
    });
  } catch (error) {
    if (error instanceof GzipCodecError) {
      if (error.code === 'compressed-size-cap') {
        invalid(error.code, 'Compressed snapshot exceeds 16 MiB');
      }
      if (error.code === 'uncompressed-size-cap') {
        invalid(error.code, 'Uncompressed snapshot exceeds 64 MiB');
      }
      invalid(error.code, error.message);
    }
    invalid('invalid-gzip', error instanceof Error ? error.message : 'Invalid gzip stream');
  }
}

function compressDeterministic(canonicalBytes: Uint8Array): Uint8Array {
  const compressed = encodeGzip(canonicalBytes, { level: 6 });
  if (compressed.length > SNAPSHOT_V2_CAPS.compressedBytes) {
    invalid('compressed-size-cap', 'Compressed snapshot exceeds 16 MiB');
  }
  return compressed;
}

export function encodeSnapshotV2(payload: JournalSnapshotPayloadV2): EncodedSnapshotV2 {
  validateSnapshotV2Shape(payload);
  const normalized = normalizeSnapshotV2(payload);
  const canonicalBytes = canonicalBytesV2(normalized);
  if (canonicalBytes.length > SNAPSHOT_V2_CAPS.uncompressedBytes) {
    invalid('uncompressed-size-cap', 'Uncompressed snapshot exceeds 64 MiB');
  }
  const snapshotId = sha256BytesV2(canonicalBytes);
  validateSnapshotV2Collections(normalized, snapshotId);
  return {
    snapshotId,
    payload: normalized,
    canonicalBytes,
    compressedBytes: compressDeterministic(canonicalBytes),
  };
}

/**
 * Completes every validation stage before returning a value eligible for a
 * domain transaction. This function itself has no mutation capability.
 */
export function decodeSnapshotV2(
  compressedBytes: Uint8Array,
  expectedSnapshotId: string,
): StoredJournalSnapshotV2 {
  if (!HASH.test(expectedSnapshotId)) invalid('invalid-hash', 'Expected snapshot ID is malformed');
  // 1-2: compressed cap, then decompression bounded inside the raw inflater.
  const uncompressed = decompressBounded(compressedBytes);
  // 3: strict UTF-8, duplicate-aware JSON parse, closed shape and scalar caps.
  const source = decodeUtf8Strict(uncompressed);
  const parsed = parseJsonStrictV2(source);
  const payload = validateSnapshotV2Shape(parsed);
  // 4: canonical bytes must be exactly what was downloaded.
  const canonicalBytes = canonicalBytesV2(payload);
  if (!bytesEqual(uncompressed, canonicalBytes)) {
    invalid('non-canonical-bytes', 'Snapshot payload is valid JSON but not canonical JSON');
  }
  // 5: identity is over the canonical, uncompressed payload.
  const snapshotId = sha256BytesV2(canonicalBytes);
  if (snapshotId !== expectedSnapshotId) invalid('hash-mismatch', 'Snapshot ID does not match payload');
  // 6: sort, uniqueness, aggregate and referential invariants.
  validateSnapshotV2Collections(payload, snapshotId);
  return { snapshotId, payload };
}

export const snapshotV2CodecInternals = {
  decompressBounded,
  compressDeterministic,
};
