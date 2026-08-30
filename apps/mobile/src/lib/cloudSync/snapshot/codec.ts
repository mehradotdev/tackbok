import {
  decodeGzipBounded,
  encodeGzip,
  GzipCodecError,
} from '~/lib/zip/core/gzip-codec';

import { encodeCanonicalBytes } from './canonical';
import { SNAPSHOT_CAPS, invalid } from './caps';
import { sha256Bytes } from './sha256';
import { decodeUtf8Strict, parseJsonStrict } from './strictJson';
import type { EncodedSnapshot, JournalSnapshotPayload, StoredJournalSnapshot } from './types';
import {
  normalizeSnapshot,
  validateSnapshotCollections,
  validateSnapshotShape,
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
      maxCompressedBytes: SNAPSHOT_CAPS.compressedBytes,
      maxUncompressedBytes: SNAPSHOT_CAPS.uncompressedBytes,
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
  if (compressed.length > SNAPSHOT_CAPS.compressedBytes) {
    invalid('compressed-size-cap', 'Compressed snapshot exceeds 16 MiB');
  }
  return compressed;
}

export function encodeSnapshot(payload: JournalSnapshotPayload): EncodedSnapshot {
  validateSnapshotShape(payload);
  const normalized = normalizeSnapshot(payload);
  const canonicalBytes = encodeCanonicalBytes(normalized);
  if (canonicalBytes.length > SNAPSHOT_CAPS.uncompressedBytes) {
    invalid('uncompressed-size-cap', 'Uncompressed snapshot exceeds 64 MiB');
  }
  const snapshotId = sha256Bytes(canonicalBytes);
  validateSnapshotCollections(normalized, snapshotId);
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
export function decodeSnapshot(
  compressedBytes: Uint8Array,
  expectedSnapshotId: string,
): StoredJournalSnapshot {
  if (!HASH.test(expectedSnapshotId)) invalid('invalid-hash', 'Expected snapshot ID is malformed');
  // 1-2: compressed cap, then decompression bounded inside the raw inflater.
  const uncompressed = decompressBounded(compressedBytes);
  // 3: strict UTF-8, duplicate-aware JSON parse, closed shape and scalar caps.
  const source = decodeUtf8Strict(uncompressed);
  const parsed = parseJsonStrict(source);
  const payload = validateSnapshotShape(parsed);
  // 4: canonical bytes must be exactly what was downloaded.
  const canonicalBytes = encodeCanonicalBytes(payload);
  if (!bytesEqual(uncompressed, canonicalBytes)) {
    invalid('non-canonical-bytes', 'Snapshot payload is valid JSON but not canonical JSON');
  }
  // 5: identity is over the canonical, uncompressed payload.
  const snapshotId = sha256Bytes(canonicalBytes);
  if (snapshotId !== expectedSnapshotId) invalid('hash-mismatch', 'Snapshot ID does not match payload');
  // 6: sort, uniqueness, aggregate and referential invariants.
  validateSnapshotCollections(payload, snapshotId);
  return { snapshotId, payload };
}

export const snapshotCodecInternals = {
  decompressBounded,
  compressDeterministic,
};
