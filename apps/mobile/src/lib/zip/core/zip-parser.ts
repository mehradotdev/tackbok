/**
 * ZIP binary structure parsers.
 *
 * Parses end-of-central-directory records (classic and ZIP64), central
 * directory entries, ZIP64 extra fields, and local file headers.  All parser
 * functions validate their input via assertZipRange before reading.
 */
import { readUint64, readUint, readUshort, toSafeNumber } from './byte-io';
import { readIBM, readUTF8 } from './filename-codec';
import {
  ZIP_LOCAL_FILE_HEADER_SIGNATURE,
  ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE,
  ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
  ZIP64_EXTRA_FIELD_ID,
  ZIP_UTF8_FLAG,
  ZIP_EOCD_MIN_SIZE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_SIZE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE,
  ZIP64_EOCD_RECORD_DATA_SIZE,
  ZIP64_VERSION,
  UINT16_MAX,
  UINT32_MAX,
} from './zip-constants';
import type {
  ParsedLocalFileHeader,
  ParsedZipDirectory,
  ParsedZipEntryMeta,
} from './types';

interface ParsedZipDirectoryEntry {
  entry: ParsedZipEntryMeta;
  nextOffset: number;
}

/**
 * Guards every binary slice before the ZIP parser reads from it.
 */
export function assertZipRange(
  data: Uint8Array,
  offset: number,
  length: number,
  context: string,
): void {
  if (offset < 0 || length < 0 || offset + length > data.length) {
    throw new Error(`Invalid ZIP archive: ${context} exceeds the archive bounds`);
  }
}

/**
 * Decodes a ZIP entry path using the archive's UTF-8 flag when available.
 */
export function decodeZipPath(
  data: Uint8Array,
  offset: number,
  length: number,
  generalPurposeFlag: number,
): string {
  const decoded =
    (generalPurposeFlag & ZIP_UTF8_FLAG) === 0
      ? readIBM(data, offset, length)
      : readUTF8(data, offset, length);

  return decoded ?? readUTF8(data, offset, length);
}

function findEndOfCentralDirectoryOffset(data: Uint8Array): number {
  const start = Math.max(0, data.length - (ZIP_EOCD_MIN_SIZE + Number(UINT16_MAX)));
  for (let offset = data.length - ZIP_EOCD_MIN_SIZE; offset >= start; offset -= 1) {
    if (readUint(data, offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }

    const commentLength = readUshort(data, offset + 20);
    if (offset + ZIP_EOCD_MIN_SIZE + commentLength === data.length) {
      return offset;
    }
  }

  throw new Error('Invalid ZIP archive: end of central directory not found');
}

function requireSingleDiskArchive(
  diskNumber: number,
  centralDirectoryDiskNumber: number,
): void {
  if (diskNumber !== 0 || centralDirectoryDiskNumber !== 0) {
    throw new Error('Unsupported ZIP feature: multi-disk archives are not supported');
  }
}

function validateClassicZip64Consistency(
  classicValue: number,
  zip64Value: bigint,
  fieldName: string,
  saturatedValue: number,
): void {
  if (classicValue !== saturatedValue && BigInt(classicValue) !== zip64Value) {
    throw new Error(
      `Invalid ZIP archive: inconsistent ${fieldName} between classic and ZIP64 records`,
    );
  }
}

function parseEndOfCentralDirectory(data: Uint8Array): ParsedZipDirectory {
  const eocdOffset = findEndOfCentralDirectoryOffset(data);
  assertZipRange(data, eocdOffset, ZIP_EOCD_MIN_SIZE, 'end of central directory');

  let offset = eocdOffset + 4;
  const diskNumber = readUshort(data, offset);
  offset += 2;
  const centralDirectoryDiskNumber = readUshort(data, offset);
  offset += 2;
  const entryCountOnDisk = readUshort(data, offset);
  offset += 2;
  const entryCount = readUshort(data, offset);
  offset += 2;
  const centralDirectorySize = readUint(data, offset);
  offset += 4;
  const centralDirectoryOffset = readUint(data, offset);
  offset += 4;
  const commentLength = readUshort(data, offset);

  if (eocdOffset + ZIP_EOCD_MIN_SIZE + commentLength !== data.length) {
    throw new Error('Invalid ZIP archive: end of central directory comment is truncated');
  }

  requireSingleDiskArchive(diskNumber, centralDirectoryDiskNumber);

  let resolvedEntryCount = BigInt(entryCount);
  let resolvedCentralDirectorySize = BigInt(centralDirectorySize);
  let resolvedCentralDirectoryOffset = BigInt(centralDirectoryOffset);

  const needsZip64 =
    entryCountOnDisk === Number(UINT16_MAX) ||
    entryCount === Number(UINT16_MAX) ||
    centralDirectorySize === Number(UINT32_MAX) ||
    centralDirectoryOffset === Number(UINT32_MAX);

  if (needsZip64) {
    const locatorOffset = eocdOffset - ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE;
    if (locatorOffset < 0) {
      throw new Error('Invalid ZIP archive: ZIP64 locator not found');
    }

    assertZipRange(
      data,
      locatorOffset,
      ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE,
      'ZIP64 locator',
    );
    if (
      readUint(data, locatorOffset) !== ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE
    ) {
      throw new Error('Invalid ZIP archive: ZIP64 locator not found');
    }

    const zip64DiskNumber = readUint(data, locatorOffset + 4);
    const zip64EndOfCentralDirectoryOffset = readUint64(data, locatorOffset + 8);
    const totalDisks = readUint(data, locatorOffset + 16);

    if (zip64DiskNumber !== 0 || totalDisks !== 1) {
      throw new Error(
        'Unsupported ZIP feature: multi-disk ZIP64 archives are not supported',
      );
    }

    const zip64RecordOffset = toSafeNumber(
      zip64EndOfCentralDirectoryOffset,
      'ZIP64 end of central directory offset',
    );
    assertZipRange(
      data,
      zip64RecordOffset,
      ZIP64_END_OF_CENTRAL_DIRECTORY_SIZE,
      'ZIP64 end of central directory record',
    );

    if (readUint(data, zip64RecordOffset) !== ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(
        'Invalid ZIP archive: ZIP64 end of central directory record not found',
      );
    }

    const recordSize = readUint64(data, zip64RecordOffset + 4);
    if (recordSize < ZIP64_EOCD_RECORD_DATA_SIZE) {
      throw new Error(
        'Invalid ZIP archive: ZIP64 end of central directory record is malformed',
      );
    }

    const zip64RecordLength = toSafeNumber(
      12n + recordSize,
      'ZIP64 end of central directory record length',
    );
    assertZipRange(
      data,
      zip64RecordOffset,
      zip64RecordLength,
      'ZIP64 end of central directory record',
    );

    let zip64Offset = zip64RecordOffset + 12;
    const zip64VersionMadeBy = readUshort(data, zip64Offset);
    zip64Offset += 2;
    const zip64VersionNeeded = readUshort(data, zip64Offset);
    zip64Offset += 2;
    const zip64Disk = readUint(data, zip64Offset);
    zip64Offset += 4;
    const zip64CentralDirectoryDisk = readUint(data, zip64Offset);
    zip64Offset += 4;
    const zip64EntryCountOnDisk = readUint64(data, zip64Offset);
    zip64Offset += 8;
    const zip64EntryCount = readUint64(data, zip64Offset);
    zip64Offset += 8;
    const zip64CentralDirectorySize = readUint64(data, zip64Offset);
    zip64Offset += 8;
    const zip64CentralDirectoryOffset = readUint64(data, zip64Offset);

    requireSingleDiskArchive(zip64Disk, zip64CentralDirectoryDisk);

    if (zip64VersionMadeBy < ZIP64_VERSION || zip64VersionNeeded < ZIP64_VERSION) {
      throw new Error(
        'Invalid ZIP archive: ZIP64 end of central directory has an invalid version',
      );
    }

    if (zip64EntryCountOnDisk !== zip64EntryCount) {
      throw new Error(
        `Invalid ZIP archive: ZIP64 end of central directory entry count mismatch (${zip64EntryCountOnDisk} on-disk vs ${zip64EntryCount} total)`,
      );
    }

    validateClassicZip64Consistency(
      entryCount,
      zip64EntryCount,
      'entry count',
      Number(UINT16_MAX),
    );
    validateClassicZip64Consistency(
      centralDirectorySize,
      zip64CentralDirectorySize,
      'central directory size',
      Number(UINT32_MAX),
    );
    validateClassicZip64Consistency(
      centralDirectoryOffset,
      zip64CentralDirectoryOffset,
      'central directory offset',
      Number(UINT32_MAX),
    );

    resolvedEntryCount = zip64EntryCount;
    resolvedCentralDirectorySize = zip64CentralDirectorySize;
    resolvedCentralDirectoryOffset = zip64CentralDirectoryOffset;
  } else if (entryCountOnDisk !== entryCount) {
    throw new Error('Unsupported ZIP feature: multi-disk archives are not supported');
  }

  return {
    entries: [],
    centralDirectoryOffset: resolvedCentralDirectoryOffset,
    centralDirectorySize: resolvedCentralDirectorySize,
    entryCount: resolvedEntryCount,
  };
}

function parseZip64ExtraField(
  data: Uint8Array,
  offset: number,
  size: number,
  entry: ParsedZipEntryMeta,
): void {
  const end = offset + size;
  let zip64Offset = offset;

  const readField = (): bigint => {
    if (zip64Offset + 8 > end) {
      throw new Error('Malformed ZIP64 extra field for central directory entry');
    }

    const value = readUint64(data, zip64Offset);
    zip64Offset += 8;
    return value;
  };

  if (entry.uncompressedSize === UINT32_MAX) {
    entry.uncompressedSize = readField();
  }

  if (entry.compressedSize === UINT32_MAX) {
    entry.compressedSize = readField();
  }

  if (entry.localHeaderOffset === UINT32_MAX) {
    entry.localHeaderOffset = readField();
  }
}

function parseCentralDirectoryEntry(
  data: Uint8Array,
  offset: number,
): ParsedZipDirectoryEntry {
  assertZipRange(data, offset, 46, 'central directory entry');

  if (readUint(data, offset) !== ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
    throw new Error('Invalid ZIP archive: central directory header signature is missing');
  }

  const generalPurposeFlag = readUshort(data, offset + 8);
  const compressionMethod = readUshort(data, offset + 10);
  const compressedSize32 = readUint(data, offset + 20);
  const uncompressedSize32 = readUint(data, offset + 24);
  const nameLength = readUshort(data, offset + 28);
  const extraLength = readUshort(data, offset + 30);
  const commentLength = readUshort(data, offset + 32);
  const diskNumberStart = readUshort(data, offset + 34);
  const localHeaderOffset32 = readUint(data, offset + 42);
  const variableOffset = offset + 46;

  assertZipRange(
    data,
    variableOffset,
    nameLength + extraLength + commentLength,
    'central directory entry payload',
  );

  const path = decodeZipPath(data, variableOffset, nameLength, generalPurposeFlag);
  const extraOffset = variableOffset + nameLength;
  const entry: ParsedZipEntryMeta = {
    path,
    compressionMethod,
    generalPurposeFlag,
    compressedSize: BigInt(compressedSize32),
    uncompressedSize: BigInt(uncompressedSize32),
    localHeaderOffset: BigInt(localHeaderOffset32),
  };

  if (diskNumberStart !== 0 && diskNumberStart !== Number(UINT16_MAX)) {
    throw new Error('Unsupported ZIP feature: multi-disk archives are not supported');
  }

  let localExtraOffset = 0;
  while (localExtraOffset < extraLength) {
    const headerOffset = extraOffset + localExtraOffset;
    assertZipRange(data, headerOffset, 4, 'central directory extra field header');

    const id = readUshort(data, headerOffset);
    const size = readUshort(data, headerOffset + 2);
    localExtraOffset += 4;

    if (localExtraOffset + size > extraLength) {
      throw new Error('Invalid ZIP archive: central directory extra field is truncated');
    }

    if (id === ZIP64_EXTRA_FIELD_ID) {
      parseZip64ExtraField(data, extraOffset + localExtraOffset, size, entry);
    }

    localExtraOffset += size;
  }

  if (diskNumberStart === Number(UINT16_MAX)) {
    throw new Error('Unsupported ZIP feature: multi-disk archives are not supported');
  }

  if (compressedSize32 === Number(UINT32_MAX) && entry.compressedSize === UINT32_MAX) {
    throw new Error('Malformed ZIP64 extra field for central directory entry');
  }

  if (
    uncompressedSize32 === Number(UINT32_MAX) &&
    entry.uncompressedSize === UINT32_MAX
  ) {
    throw new Error('Malformed ZIP64 extra field for central directory entry');
  }

  if (
    localHeaderOffset32 === Number(UINT32_MAX) &&
    entry.localHeaderOffset === UINT32_MAX
  ) {
    throw new Error('Malformed ZIP64 extra field for central directory entry');
  }

  return {
    entry,
    nextOffset: variableOffset + nameLength + extraLength + commentLength,
  };
}

/**
 * Parses central directory entries from a standalone central directory byte slice.
 */
export function parseZipCentralDirectoryEntries(
  data: Uint8Array,
  entryCountValue: bigint,
): ParsedZipEntryMeta[] {
  const entryCount = toSafeNumber(entryCountValue, 'ZIP entry count');

  let offset = 0;
  const entries: ParsedZipEntryMeta[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    const parsedEntry = parseCentralDirectoryEntry(data, offset);
    entries.push(parsedEntry.entry);
    offset = parsedEntry.nextOffset;
  }

  if (offset > data.length) {
    throw new Error(
      'Invalid ZIP archive: central directory extends past the declared size',
    );
  }

  return entries;
}

/**
 * Parses the EOCD records and central directory without materializing file payloads.
 * This becomes the shared metadata layer for both in-memory and streaming readers.
 */
export function parseZipCentralDirectory(data: Uint8Array): ParsedZipDirectory {
  const directory = parseEndOfCentralDirectory(data);
  const centralDirectoryOffset = toSafeNumber(
    directory.centralDirectoryOffset,
    'Central directory offset',
  );
  const centralDirectorySize = toSafeNumber(
    directory.centralDirectorySize,
    'Central directory size',
  );

  assertZipRange(data, centralDirectoryOffset, centralDirectorySize, 'central directory');
  const entries = parseZipCentralDirectoryEntries(
    data.subarray(centralDirectoryOffset, centralDirectoryOffset + centralDirectorySize),
    directory.entryCount,
  );

  return {
    ...directory,
    entries,
  };
}

/**
 * Parses only the local file header for one entry and returns where the payload starts.
 */
export function parseLocalFileHeader(
  data: Uint8Array,
  offsetValue: number | bigint,
): ParsedLocalFileHeader {
  let offset =
    typeof offsetValue === 'bigint'
      ? toSafeNumber(offsetValue, 'Local file header offset')
      : offsetValue;

  assertZipRange(data, offset, 30, 'local file header');
  if (readUint(data, offset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('Invalid ZIP archive: local file header signature is missing');
  }

  offset += 4;
  offset += 2;
  const generalPurposeFlag = readUshort(data, offset);
  offset += 2;
  const compressionMethod = readUshort(data, offset);
  offset += 2;
  offset += 4;
  offset += 4;
  offset += 8;

  const nameLength = readUshort(data, offset);
  offset += 2;
  const extraLength = readUshort(data, offset);
  offset += 2;

  assertZipRange(data, offset, nameLength + extraLength, 'local file header payload');
  const path = decodeZipPath(data, offset, nameLength, generalPurposeFlag);
  const dataOffset = offset + nameLength + extraLength;

  return {
    path,
    generalPurposeFlag,
    compressionMethod,
    dataOffset,
  };
}
