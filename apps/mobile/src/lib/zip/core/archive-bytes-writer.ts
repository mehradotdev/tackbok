import {
  toSafeNumber,
  toUint16Checked,
  toUint32Checked,
  writeUint,
  writeUint64,
  writeUshort,
} from './byte-io';
import { sizeUTF8, writeUTF8 } from './filename-codec';
import { computeCrc32 } from './crc32';
import { deflateRaw } from './deflate-codec';
import {
  ZIP_COMPRESSION_METHOD_DEFLATE,
  ZIP_COMPRESSION_METHOD_STORE,
  UINT16_MAX,
  UINT32_MAX,
  ZIP64_EOCD_RECORD_DATA_SIZE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  ZIP64_EXTRA_FIELD_ID,
  ZIP64_VERSION,
  ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE,
  ZIP_CLASSIC_VERSION,
  ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  ZIP_LOCAL_FILE_HEADER_SIGNATURE,
  ZIP_UTF8_FLAG,
} from './zip-constants';
import { shouldStoreWithoutCompression } from '../compression-policy';
import type { ZipEntries } from './types';

const MAX_IN_MEMORY_ARCHIVE_SIZE = 0x7fffffffn;

interface PreparedZipWriteEntry {
  path: string;
  nameSize: number;
  compressionMethod: number;
  crc: number;
  file: Uint8Array;
  compressedSize: bigint;
  uncompressedSize: bigint;
  recordOffset: bigint;
  localExtraSize: number;
  centralExtraSize: number;
  usesZip64Sizes: boolean;
  usesZip64Offset: boolean;
  versionNeeded: number;
  timestamp: number;
}

function getLocalHeaderSize(entry: PreparedZipWriteEntry): bigint {
  return (
    30n + BigInt(entry.nameSize) + BigInt(entry.localExtraSize) + entry.compressedSize
  );
}

function getCentralDirectoryHeaderSize(entry: PreparedZipWriteEntry): bigint {
  return 46n + BigInt(entry.nameSize) + BigInt(entry.centralExtraSize);
}

function prepareEntries(
  entries: ZipEntries,
  noCompress: boolean,
): PreparedZipWriteEntry[] {
  const preparedEntries: PreparedZipWriteEntry[] = [];
  let recordOffset = 0n;
  const timestamp = Date.now();

  for (const path in entries) {
    // Ignore inherited enumerable properties and only serialize actual ZIP entries.
    if (!Object.hasOwn(entries, path)) {
      continue;
    }

    const bytes = entries[path];
    const shouldCompress = !shouldStoreWithoutCompression(path) && !noCompress;
    const file = shouldCompress ? deflateRaw(bytes) : bytes;
    const compressedSize = BigInt(file.length);
    const uncompressedSize = BigInt(bytes.length);
    const nameSize = sizeUTF8(path);
    const usesZip64Sizes = compressedSize >= UINT32_MAX || uncompressedSize >= UINT32_MAX;
    const usesZip64Offset = recordOffset >= UINT32_MAX;
    const localExtraSize = usesZip64Sizes ? 20 : 0;
    const centralExtraSize =
      usesZip64Sizes || usesZip64Offset
        ? 4 + (usesZip64Sizes ? 16 : 0) + (usesZip64Offset ? 8 : 0)
        : 0;

    const preparedEntry: PreparedZipWriteEntry = {
      path,
      nameSize,
      compressionMethod: shouldCompress
        ? ZIP_COMPRESSION_METHOD_DEFLATE
        : ZIP_COMPRESSION_METHOD_STORE,
      crc: computeCrc32(bytes, 0, bytes.length),
      file,
      compressedSize,
      uncompressedSize,
      recordOffset,
      localExtraSize,
      centralExtraSize,
      usesZip64Sizes,
      usesZip64Offset,
      versionNeeded:
        usesZip64Sizes || usesZip64Offset ? ZIP64_VERSION : ZIP_CLASSIC_VERSION,
      timestamp,
    };

    preparedEntries.push(preparedEntry);
    recordOffset += getLocalHeaderSize(preparedEntry);
  }

  return preparedEntries;
}

function writeZip64ExtraField(
  data: Uint8Array,
  offset: number,
  entry: PreparedZipWriteEntry,
  section: 'local' | 'central',
): number {
  if (section === 'local' && !entry.usesZip64Sizes) {
    return offset;
  }

  if (section === 'central' && !entry.usesZip64Sizes && !entry.usesZip64Offset) {
    return offset;
  }

  const dataSize =
    (section === 'local' ? 0 : entry.usesZip64Offset ? 8 : 0) +
    (entry.usesZip64Sizes ? 16 : 0);

  writeUshort(data, offset, ZIP64_EXTRA_FIELD_ID);
  offset += 2;
  writeUshort(data, offset, dataSize);
  offset += 2;

  if (entry.usesZip64Sizes) {
    writeUint64(data, offset, entry.uncompressedSize);
    offset += 8;
    writeUint64(data, offset, entry.compressedSize);
    offset += 8;
  }

  if (section === 'central' && entry.usesZip64Offset) {
    writeUint64(data, offset, entry.recordOffset);
    offset += 8;
  }

  return offset;
}

function writeEndOfCentralDirectory(
  data: Uint8Array,
  offset: number,
  entryCount: bigint,
  centralDirectorySize: bigint,
  centralDirectoryOffset: bigint,
): number {
  const needsZip64Directory =
    entryCount >= UINT16_MAX ||
    centralDirectorySize >= UINT32_MAX ||
    centralDirectoryOffset >= UINT32_MAX;

  if (needsZip64Directory) {
    const zip64EndOfCentralDirectoryOffset = BigInt(offset);
    writeUint(data, offset, ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE);
    offset += 4;
    writeUint64(data, offset, ZIP64_EOCD_RECORD_DATA_SIZE);
    offset += 8;
    writeUshort(data, offset, ZIP64_VERSION);
    offset += 2;
    writeUshort(data, offset, ZIP64_VERSION);
    offset += 2;
    writeUint(data, offset, 0);
    offset += 4;
    writeUint(data, offset, 0);
    offset += 4;
    writeUint64(data, offset, entryCount);
    offset += 8;
    writeUint64(data, offset, entryCount);
    offset += 8;
    writeUint64(data, offset, centralDirectorySize);
    offset += 8;
    writeUint64(data, offset, centralDirectoryOffset);
    offset += 8;

    writeUint(data, offset, ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE);
    offset += 4;
    writeUint(data, offset, 0);
    offset += 4;
    writeUint64(data, offset, zip64EndOfCentralDirectoryOffset);
    offset += 8;
    writeUint(data, offset, 1);
    offset += 4;
  }

  writeUint(data, offset, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  offset += 4;
  writeUshort(data, offset, 0);
  offset += 2;
  writeUshort(data, offset, 0);
  offset += 2;
  writeUshort(
    data,
    offset,
    needsZip64Directory
      ? Number(UINT16_MAX)
      : toUint16Checked(entryCount, 'ZIP entry count'),
  );
  offset += 2;
  writeUshort(
    data,
    offset,
    needsZip64Directory
      ? Number(UINT16_MAX)
      : toUint16Checked(entryCount, 'ZIP entry count'),
  );
  offset += 2;
  writeUint(
    data,
    offset,
    needsZip64Directory
      ? Number(UINT32_MAX)
      : toUint32Checked(centralDirectorySize, 'Central directory size'),
  );
  offset += 4;
  writeUint(
    data,
    offset,
    needsZip64Directory
      ? Number(UINT32_MAX)
      : toUint32Checked(centralDirectoryOffset, 'Central directory offset'),
  );
  offset += 4;
  writeUshort(data, offset, 0);
  offset += 2;

  return offset;
}

function writeDosTime(buffer: Uint8Array, offset: number, timestamp: number): void {
  const date = new Date(timestamp);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >>> 1);

  writeUshort(buffer, offset, dosTime);
  writeUshort(buffer, offset + 2, dosDate);
}

/**
 * Writes either one local file header or one central directory header.
 */
function writeZipEntryHeader(
  data: Uint8Array,
  offset: number,
  entry: PreparedZipWriteEntry,
  section: 'local' | 'central',
): number {
  writeUint(
    data,
    offset,
    section === 'local'
      ? ZIP_LOCAL_FILE_HEADER_SIGNATURE
      : ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE,
  );
  offset += 4;

  if (section === 'central') {
    writeUshort(data, offset, entry.versionNeeded);
    offset += 2;
  }

  writeUshort(data, offset, entry.versionNeeded);
  offset += 2;
  writeUshort(data, offset, ZIP_UTF8_FLAG);
  offset += 2;
  writeUshort(data, offset, entry.compressionMethod);
  offset += 2;

  writeDosTime(data, offset, entry.timestamp);
  offset += 4;
  writeUint(data, offset, entry.crc);
  offset += 4;
  writeUint(
    data,
    offset,
    entry.usesZip64Sizes
      ? Number(UINT32_MAX)
      : toUint32Checked(entry.compressedSize, 'Compressed ZIP entry size'),
  );
  offset += 4;
  writeUint(
    data,
    offset,
    entry.usesZip64Sizes
      ? Number(UINT32_MAX)
      : toUint32Checked(entry.uncompressedSize, 'Uncompressed ZIP entry size'),
  );
  offset += 4;

  writeUshort(data, offset, entry.nameSize);
  offset += 2;
  writeUshort(
    data,
    offset,
    section === 'local' ? entry.localExtraSize : entry.centralExtraSize,
  );
  offset += 2;

  if (section === 'central') {
    writeUshort(data, offset, 0);
    offset += 2;
    writeUshort(data, offset, 0);
    offset += 2;
    writeUshort(data, offset, 0);
    offset += 2;
    writeUint(data, offset, 0);
    offset += 4;
    writeUint(
      data,
      offset,
      entry.usesZip64Offset
        ? Number(UINT32_MAX)
        : toUint32Checked(entry.recordOffset, 'Local header offset'),
    );
    offset += 4;
  }

  offset += writeUTF8(data, offset, entry.path);
  offset = writeZip64ExtraField(data, offset, entry, section);

  if (section === 'local') {
    data.set(entry.file, offset);
    offset += entry.file.length;
  }

  return offset;
}

/**
 * Serializes an in-memory map of entry bytes into one ZIP archive ArrayBuffer.
 *
 * This is the eager in-memory writer path used by tests and smaller archives.
 * Callers that want file-backed sequential output should use createZipWriter.
 */
export function encodeZipArchiveBytes(
  entries: ZipEntries,
  noCompress = false,
): ArrayBuffer {
  const preparedEntries = prepareEntries(entries, noCompress);
  const centralDirectoryOffset = preparedEntries.reduce(
    (sum, entry) => sum + getLocalHeaderSize(entry),
    0n,
  );
  const centralDirectorySize = preparedEntries.reduce(
    (sum, entry) => sum + getCentralDirectoryHeaderSize(entry),
    0n,
  );
  const needsZip64Directory =
    BigInt(preparedEntries.length) >= UINT16_MAX ||
    centralDirectorySize >= UINT32_MAX ||
    centralDirectoryOffset >= UINT32_MAX;
  const totalSizeBig =
    centralDirectoryOffset +
    centralDirectorySize +
    22n +
    (needsZip64Directory ? 76n : 0n);

  if (totalSizeBig > MAX_IN_MEMORY_ARCHIVE_SIZE) {
    throw new Error(
      'ZIP archive is too large for the in-memory archive API; use createZipWriter instead',
    );
  }

  const data = new Uint8Array(toSafeNumber(totalSizeBig, 'ZIP archive size'));
  let offset = 0;

  for (const entry of preparedEntries) {
    offset = writeZipEntryHeader(data, offset, entry, 'local');
  }

  for (const entry of preparedEntries) {
    offset = writeZipEntryHeader(data, offset, entry, 'central');
  }

  offset = writeEndOfCentralDirectory(
    data,
    offset,
    BigInt(preparedEntries.length),
    centralDirectorySize,
    centralDirectoryOffset,
  );

  return data.buffer;
}
