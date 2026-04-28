import { inflateRaw } from './deflate-codec';
import { toSafeNumber } from './byte-io';
import { assertZipRange, parseLocalFileHeader, parseZipCentralDirectory } from './zip-parser';
import {
  ZIP_COMPRESSION_METHOD_DEFLATE,
  ZIP_COMPRESSION_METHOD_STORE,
} from './zip-constants';
import type { ParsedZipEntryMeta, ZipEntries } from './types';

const MAX_IN_MEMORY_ENTRY_SIZE = 0x7fffffffn;

function toInMemoryEntrySize(value: bigint, fieldName: string): number {
  if (value > MAX_IN_MEMORY_ENTRY_SIZE) {
    throw new Error(
      'ZIP entry is too large for the in-memory archive API; use openZipReader instead',
    );
  }

  return toSafeNumber(value, fieldName);
}

/**
 * Materializes one entry payload from the archive once metadata has already been parsed.
 */
function readLocalFile(
  data: Uint8Array,
  entry: ParsedZipEntryMeta,
  entries: ZipEntries,
): void {
  const compressedSize = toInMemoryEntrySize(
    entry.compressedSize,
    'Compressed ZIP entry size',
  );
  const uncompressedSize = toInMemoryEntrySize(
    entry.uncompressedSize,
    'Uncompressed ZIP entry size',
  );

  const localFileHeader = parseLocalFileHeader(data, entry.localHeaderOffset);
  if (localFileHeader.path !== entry.path) {
    throw new Error(
      'Invalid ZIP archive: central directory entry path does not match the local file header',
    );
  }

  if ((localFileHeader.generalPurposeFlag & 1) !== 0) {
    throw new Error('Unsupported ZIP feature: encrypted entries are not supported');
  }

  if (localFileHeader.generalPurposeFlag !== entry.generalPurposeFlag) {
    throw new Error(
      'Invalid ZIP archive: central directory entry flags do not match the local file header',
    );
  }

  if (localFileHeader.compressionMethod !== entry.compressionMethod) {
    throw new Error(
      'Invalid ZIP archive: central directory entry compression method does not match the local file header',
    );
  }

  assertZipRange(
    data,
    localFileHeader.dataOffset,
    compressedSize,
    'compressed ZIP entry data',
  );
  const file = data.subarray(
    localFileHeader.dataOffset,
    localFileHeader.dataOffset + compressedSize,
  );

  if (localFileHeader.compressionMethod === ZIP_COMPRESSION_METHOD_STORE) {
    if (compressedSize !== uncompressedSize) {
      throw new Error(
        'Invalid ZIP archive: stored entry has mismatched compressed and uncompressed sizes',
      );
    }

    entries[entry.path] = file.slice();
    return;
  }

  if (localFileHeader.compressionMethod === ZIP_COMPRESSION_METHOD_DEFLATE) {
    const output = new Uint8Array(uncompressedSize);
    inflateRaw(file, output);
    entries[entry.path] = output;
    return;
  }

  throw new Error(
    `Unsupported ZIP feature: compression method ${localFileHeader.compressionMethod} is not supported`,
  );
}

/**
 * Parses one in-memory ZIP byte slice by reading the central directory first
 * and then materializing each entry payload.
 */
export function parseZipEntries(data: Uint8Array): ZipEntries {
  const directory = parseZipCentralDirectory(data);
  const entries: ZipEntries = Object.create(null) as ZipEntries;

  for (const entry of directory.entries) {
    readLocalFile(data, entry, entries);
  }

  return entries;
}

/**
 * Public facade for parsing ZIP archive bytes from an ArrayBuffer.
 *
 * The reader implementation stays Uint8Array-native internally, while this
 * wrapper preserves the higher-level core API contract used by callers.
 */
export function parseZipArchiveBytes(buffer: ArrayBuffer): ZipEntries {
  return parseZipEntries(new Uint8Array(buffer));
}
