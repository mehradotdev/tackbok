import {
  inflateRaw,
  readUint,
  readUint64,
  readUshort,
  toSafeNumber,
  parseLocalFileHeader,
  parseZipCentralDirectoryEntries,
  UINT16_MAX,
  UINT32_MAX,
  ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  ZIP_EOCD_MIN_SIZE,
  ZIP_LOCAL_FILE_HEADER_SIGNATURE,
  ZIP_COMPRESSION_METHOD_DEFLATE,
  ZIP_COMPRESSION_METHOD_STORE,
  ZIP64_VERSION,
  ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  ZIP64_EOCD_RECORD_DATA_SIZE,
} from '../core';
import { ensureTextDecoder } from '../shared/text-codec';
import type { ParsedZipEntryMeta } from '../core';

const ZIP_TAIL_READ_SIZE =
  ZIP_EOCD_MIN_SIZE + Number(UINT16_MAX) + ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE;

/**
 * Random-access byte source used by the ZIP reader.
 */
export interface ZipReaderSource {
  size(): Promise<bigint>;
  /**
   * Must resolve with a buffer the caller may keep and mutate — never a view
   * into state the source will reuse for later reads. The reader hands these
   * bytes to app code without defensive copying.
   */
  read(offset: bigint, length: number): Promise<Uint8Array>;
  close?(): Promise<void> | void;
}

/**
 * Lightweight metadata surfaced for each ZIP entry without eagerly reading payload bytes.
 */
export interface ZipEntryInfo {
  readonly path: string;
  readonly compressedSize: bigint;
  readonly uncompressedSize: bigint;
  readonly compressionMethod: number;
  readonly isEncrypted: boolean;
}

/**
 * Random-access ZIP reader view that keeps the central directory in memory and
 * defers file payload reads.
 */
export interface ZipReader {
  listEntries(): readonly ZipEntryInfo[];
  hasEntry(path: string): boolean;
  getEntryInfo(path: string): ZipEntryInfo | null;
  readEntryBytes(path: string): Promise<Uint8Array>;
  readEntryText(path: string): Promise<string>;
  readEntryJson<T>(path: string): Promise<T>;
  close(): Promise<void>;
}

interface ZipDirectoryRecord {
  entryCount: bigint;
  centralDirectorySize: bigint;
  centralDirectoryOffset: bigint;
}

function shouldUseZip64(record: ZipDirectoryRecord): boolean {
  return (
    record.entryCount === UINT16_MAX ||
    record.centralDirectorySize === UINT32_MAX ||
    record.centralDirectoryOffset === UINT32_MAX
  );
}

function findEndOfCentralDirectoryOffset(
  data: Uint8Array,
  archiveSize: bigint,
  baseOffset: bigint,
): number {
  for (let offset = data.length - ZIP_EOCD_MIN_SIZE; offset >= 0; offset -= 1) {
    if (readUint(data, offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }

    const commentLength = readUshort(data, offset + 20);
    if (baseOffset + BigInt(offset + ZIP_EOCD_MIN_SIZE + commentLength) === archiveSize) {
      return offset;
    }
  }

  throw new Error('Invalid ZIP archive: end of central directory not found');
}

async function readExact(
  reader: ZipReaderSource,
  offset: bigint,
  length: number,
  context: string,
): Promise<Uint8Array> {
  const bytes = await reader.read(offset, length);
  if (bytes.length !== length) {
    throw new Error(`Invalid ZIP archive: ${context} is truncated`);
  }

  return bytes;
}

async function readZip64DirectoryRecord(
  reader: ZipReaderSource,
  locatorBytes: Uint8Array,
): Promise<ZipDirectoryRecord> {
  if (readUint(locatorBytes, 0) !== ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE) {
    throw new Error('Invalid ZIP archive: ZIP64 locator signature is missing');
  }

  if (readUint(locatorBytes, 4) !== 0 || readUint(locatorBytes, 16) !== 1) {
    throw new Error('Unsupported ZIP feature: multi-disk archives are not supported');
  }

  const zip64RecordOffset = readUint64(locatorBytes, 8);
  const headerBytes = await readExact(
    reader,
    zip64RecordOffset,
    56,
    'ZIP64 end of central directory record',
  );

  if (readUint(headerBytes, 0) !== ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
    throw new Error('Invalid ZIP archive: ZIP64 EOCD signature is missing');
  }

  const recordSize = readUint64(headerBytes, 4);
  if (recordSize < ZIP64_EOCD_RECORD_DATA_SIZE) {
    throw new Error(
      'Invalid ZIP archive: ZIP64 end of central directory record is malformed',
    );
  }
  const totalRecordLength = toSafeNumber(
    recordSize + 12n,
    'ZIP64 end of central directory size',
  );
  const zip64Bytes =
    totalRecordLength === headerBytes.length
      ? headerBytes
      : await readExact(
          reader,
          zip64RecordOffset,
          totalRecordLength,
          'ZIP64 end of central directory record',
        );

  if (readUint(zip64Bytes, 16) !== 0 || readUint(zip64Bytes, 20) !== 0) {
    throw new Error('Unsupported ZIP feature: multi-disk archives are not supported');
  }

  const versionNeeded = readUshort(zip64Bytes, 14);
  if (versionNeeded < ZIP64_VERSION) {
    throw new Error('Invalid ZIP archive: ZIP64 EOCD record has an invalid version');
  }

  return {
    entryCount: readUint64(zip64Bytes, 32),
    centralDirectorySize: readUint64(zip64Bytes, 40),
    centralDirectoryOffset: readUint64(zip64Bytes, 48),
  };
}

async function readDirectoryRecord(
  reader: ZipReaderSource,
): Promise<ZipDirectoryRecord> {
  const archiveSize = await reader.size();
  const tailLength = Number(
    archiveSize < BigInt(ZIP_TAIL_READ_SIZE) ? archiveSize : BigInt(ZIP_TAIL_READ_SIZE),
  );
  const tailOffset = archiveSize - BigInt(tailLength);
  const tailBytes = await readExact(
    reader,
    tailOffset,
    tailLength,
    'ZIP end of central directory',
  );
  const eocdOffset = findEndOfCentralDirectoryOffset(tailBytes, archiveSize, tailOffset);

  const diskNumber = readUshort(tailBytes, eocdOffset + 4);
  const centralDirectoryDiskNumber = readUshort(tailBytes, eocdOffset + 6);
  if (diskNumber !== 0 || centralDirectoryDiskNumber !== 0) {
    throw new Error('Unsupported ZIP feature: multi-disk archives are not supported');
  }

  const entryCountOnDisk = readUshort(tailBytes, eocdOffset + 8);
  const entryCount = readUshort(tailBytes, eocdOffset + 10);
  if (entryCountOnDisk !== entryCount) {
    throw new Error(
      `Invalid ZIP archive: central directory entry counts disagree (${entryCountOnDisk} on-disk vs ${entryCount} total)`,
    );
  }

  const classicRecord: ZipDirectoryRecord = {
    entryCount: BigInt(entryCount),
    centralDirectorySize: BigInt(readUint(tailBytes, eocdOffset + 12)),
    centralDirectoryOffset: BigInt(readUint(tailBytes, eocdOffset + 16)),
  };

  if (!shouldUseZip64(classicRecord)) {
    return classicRecord;
  }

  const locatorOffset = eocdOffset - ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE;
  if (locatorOffset < 0) {
    throw new Error('Invalid ZIP archive: ZIP64 locator is missing');
  }

  const locatorBytes = tailBytes.subarray(
    locatorOffset,
    locatorOffset + ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE,
  );
  return readZip64DirectoryRecord(reader, locatorBytes);
}

function createEntryInfo(entry: ParsedZipEntryMeta): ZipEntryInfo {
  return {
    path: entry.path,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    compressionMethod: entry.compressionMethod,
    isEncrypted: (entry.generalPurposeFlag & 1) !== 0,
  };
}

/**
 * Local file headers are usually 30 bytes plus a short filename, so one read
 * of this size almost always covers the whole header and avoids a second
 * round-trip to the byte source per entry.
 */
const LOCAL_HEADER_PREFETCH_SIZE = 256;

class ZipReaderImpl implements ZipReader {
  private closed = false;
  private readonly entries: readonly ZipEntryInfo[];
  private readonly entriesByPath: Map<string, ParsedZipEntryMeta>;

  constructor(
    private readonly reader: ZipReaderSource,
    parsedEntries: ParsedZipEntryMeta[],
    private readonly archiveSize: bigint,
  ) {
    this.entries = parsedEntries.map(createEntryInfo);
    this.entriesByPath = new Map(parsedEntries.map((entry) => [entry.path, entry]));
  }

  listEntries(): readonly ZipEntryInfo[] {
    return this.entries;
  }

  hasEntry(path: string): boolean {
    return this.entriesByPath.has(path);
  }

  getEntryInfo(path: string): ZipEntryInfo | null {
    const entry = this.entriesByPath.get(path);
    return entry ? createEntryInfo(entry) : null;
  }

  async readEntryBytes(path: string): Promise<Uint8Array> {
    this.assertOpen();

    const entry = this.entriesByPath.get(path);
    if (!entry) {
      throw new Error(`Backup is missing required file: ${path}`);
    }

    if ((entry.generalPurposeFlag & 1) !== 0) {
      throw new Error('Unsupported ZIP feature: encrypted entries are not supported');
    }

    const availableBytes = this.archiveSize - entry.localHeaderOffset;
    if (availableBytes < 30n) {
      throw new Error('Invalid ZIP archive: local file header is truncated');
    }

    const prefetchLength =
      availableBytes < BigInt(LOCAL_HEADER_PREFETCH_SIZE)
        ? Number(availableBytes)
        : LOCAL_HEADER_PREFETCH_SIZE;
    const localHeaderPrefix = await readExact(
      this.reader,
      entry.localHeaderOffset,
      prefetchLength,
      'local file header',
    );

    if (readUint(localHeaderPrefix, 0) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error('Invalid ZIP archive: local file header signature is missing');
    }

    const nameLength = readUshort(localHeaderPrefix, 26);
    const extraLength = readUshort(localHeaderPrefix, 28);
    const localHeaderLength = 30 + nameLength + extraLength;
    const localHeaderBytes =
      localHeaderLength <= localHeaderPrefix.length
        ? localHeaderPrefix
        : await readExact(
            this.reader,
            entry.localHeaderOffset,
            localHeaderLength,
            'local file header',
          );
    const localHeader = parseLocalFileHeader(localHeaderBytes, 0);

    const compressedSize = toSafeNumber(
      entry.compressedSize,
      `Compressed size for ${path}`,
    );
    const uncompressedSize = toSafeNumber(
      entry.uncompressedSize,
      `Uncompressed size for ${path}`,
    );
    const dataOffset = entry.localHeaderOffset + BigInt(localHeader.dataOffset);
    const compressedBytes = await readExact(
      this.reader,
      dataOffset,
      compressedSize,
      `ZIP entry data for ${path}`,
    );

    // TODO: Verify extracted entry payloads against the stored CRC32 value from
    // the ZIP metadata; structural parsing catches many archive issues already,
    // but read-time CRC validation would detect silent payload corruption too.
    if (localHeader.compressionMethod === ZIP_COMPRESSION_METHOD_STORE) {
      if (compressedSize !== uncompressedSize) {
        throw new Error(
          'Invalid ZIP archive: stored entry has mismatched compressed and uncompressed sizes',
        );
      }

      // The ZipReaderSource contract guarantees read() results are caller-owned,
      // so returning them directly avoids a second full-entry allocation.
      return compressedBytes;
    }

    if (localHeader.compressionMethod === ZIP_COMPRESSION_METHOD_DEFLATE) {
      const output = new Uint8Array(uncompressedSize);
      inflateRaw(compressedBytes, output);
      return output;
    }

    throw new Error(
      `Unsupported ZIP feature: compression method ${localHeader.compressionMethod} is not supported`,
    );
  }

  async readEntryText(path: string): Promise<string> {
    return ensureTextDecoder().decode(await this.readEntryBytes(path));
  }

  async readEntryJson<T>(path: string): Promise<T> {
    const text = await this.readEntryText(path);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Backup file is invalid JSON: ${path}`);
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.reader.close?.();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('ZIP archive has already been closed');
    }
  }
}

/**
 * Opens a ZIP archive from a random-access byte reader without loading every file entry.
 *
 * On failure the source is closed before the error propagates, so callers do
 * not leak file handles when handed an invalid archive.
 */
export async function openZipReader(reader: ZipReaderSource): Promise<ZipReader> {
  try {
    const archiveSize = await reader.size();
    const directory = await readDirectoryRecord(reader);
    const centralDirectorySize = toSafeNumber(
      directory.centralDirectorySize,
      'Central directory size',
    );
    const centralDirectoryBytes = await readExact(
      reader,
      directory.centralDirectoryOffset,
      centralDirectorySize,
      'central directory',
    );
    const entries = parseZipCentralDirectoryEntries(
      centralDirectoryBytes,
      directory.entryCount,
    );

    return new ZipReaderImpl(reader, entries, archiveSize);
  } catch (error) {
    try {
      await reader.close?.();
    } catch {
      // Preserve the original open/parse failure.
    }
    throw error;
  }
}

/**
 * Creates an in-memory ZIP reader source for tests and adapters.
 */
export function createMemoryZipReaderSource(
  bytes: Uint8Array,
): ZipReaderSource {
  return {
    async size(): Promise<bigint> {
      return BigInt(bytes.length);
    },
    async read(offset: bigint, length: number): Promise<Uint8Array> {
      const start = toSafeNumber(offset, 'ZIP read offset');
      return bytes.subarray(start, start + length).slice();
    },
  };
}
