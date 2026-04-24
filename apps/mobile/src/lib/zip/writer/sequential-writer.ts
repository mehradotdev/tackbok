import { computeCrc32, updateCrc32 } from '../core/crc32';
import { shouldStoreWithoutCompression } from '../compression-policy';
import {
  deflateRaw,
  ZIP_COMPRESSION_METHOD_DEFLATE,
  ZIP_COMPRESSION_METHOD_STORE,
  sizeUTF8,
  toSafeNumber,
  toUint16Checked,
  toUint32Checked,
  writeUint,
  writeUint64,
  writeUshort,
  writeUTF8,
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
} from '../core';
import { ensureTextEncoder } from '../shared/text-codec';

const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP_DATA_DESCRIPTOR_FLAG = 0x0008;

interface StreamingZipEntryMeta {
  path: string;
  nameSize: number;
  compressionMethod: number;
  generalPurposeFlag: number;
  crc: number;
  compressedSize: bigint;
  uncompressedSize: bigint;
  recordOffset: bigint;
  localExtraSize: number;
  centralExtraSize: number;
  usesZip64Sizes: boolean;
  usesZip64Offset: boolean;
  versionNeeded: number;
  timestamp: number;
  hasDataDescriptor: boolean;
}

/**
 * Sequential output sink for ZIP bytes.
 */
export interface ZipOutputSink {
  write(bytes: Uint8Array): Promise<void>;
  close?(): Promise<void> | void;
}

/**
 * Pull-based source for large entries that should be streamed instead of buffered.
 */
export interface ZipChunkSource {
  readonly size: bigint;
  chunks(): AsyncIterable<Uint8Array>;
}

/**
 * Streaming ZIP writer that appends entries directly to an output sink.
 */
export interface ZipWriter {
  addBytes(path: string, bytes: Uint8Array, noCompress?: boolean): Promise<void>;
  addText(path: string, text: string): Promise<void>;
  addStored(path: string, source: ZipChunkSource): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

function getCentralDirectoryHeaderSize(entry: StreamingZipEntryMeta): bigint {
  return 46n + BigInt(entry.nameSize) + BigInt(entry.centralExtraSize);
}

function getLocalHeaderSize(entry: StreamingZipEntryMeta): bigint {
  return 30n + BigInt(entry.nameSize) + BigInt(entry.localExtraSize);
}

function getDataDescriptorSize(entry: StreamingZipEntryMeta): bigint {
  return entry.usesZip64Sizes ? 24n : 16n;
}

function writeZip64ExtraField(
  data: Uint8Array,
  offset: number,
  entry: StreamingZipEntryMeta,
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

function writeDosTime(buffer: Uint8Array, offset: number, timestamp: number): void {
  const date = new Date(timestamp);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >>> 1);

  writeUshort(buffer, offset, dosTime);
  writeUshort(buffer, offset + 2, dosDate);
}

function createEntryMeta(
  path: string,
  recordOffset: bigint,
  compressedSize: bigint,
  uncompressedSize: bigint,
  compressionMethod: number,
  crc: number,
  timestamp: number,
  hasDataDescriptor: boolean,
): StreamingZipEntryMeta {
  const nameSize = sizeUTF8(path);
  const usesZip64Sizes = compressedSize > UINT32_MAX || uncompressedSize > UINT32_MAX;
  const usesZip64Offset = recordOffset > UINT32_MAX;

  return {
    path,
    nameSize,
    compressionMethod,
    generalPurposeFlag:
      ZIP_UTF8_FLAG | (hasDataDescriptor ? ZIP_DATA_DESCRIPTOR_FLAG : 0),
    crc,
    compressedSize,
    uncompressedSize,
    recordOffset,
    localExtraSize: usesZip64Sizes ? 20 : 0,
    centralExtraSize:
      usesZip64Sizes || usesZip64Offset
        ? 4 + (usesZip64Sizes ? 16 : 0) + (usesZip64Offset ? 8 : 0)
        : 0,
    usesZip64Sizes,
    usesZip64Offset,
    versionNeeded:
      usesZip64Sizes || usesZip64Offset ? ZIP64_VERSION : ZIP_CLASSIC_VERSION,
    timestamp,
    hasDataDescriptor,
  };
}

function buildLocalHeader(entry: StreamingZipEntryMeta): Uint8Array {
  const data = new Uint8Array(
    toSafeNumber(getLocalHeaderSize(entry), 'Local header size'),
  );
  let offset = 0;

  writeUint(data, offset, ZIP_LOCAL_FILE_HEADER_SIGNATURE);
  offset += 4;
  writeUshort(data, offset, entry.versionNeeded);
  offset += 2;
  writeUshort(data, offset, entry.generalPurposeFlag);
  offset += 2;
  writeUshort(data, offset, entry.compressionMethod);
  offset += 2;
  writeDosTime(data, offset, entry.timestamp);
  offset += 4;
  writeUint(data, offset, entry.hasDataDescriptor ? 0 : entry.crc);
  offset += 4;

  const compressedSize = entry.hasDataDescriptor
    ? entry.usesZip64Sizes
      ? Number(UINT32_MAX)
      : 0
    : entry.usesZip64Sizes
      ? Number(UINT32_MAX)
      : toUint32Checked(entry.compressedSize, 'Compressed ZIP entry size');
  writeUint(data, offset, compressedSize);
  offset += 4;

  const uncompressedSize = entry.hasDataDescriptor
    ? entry.usesZip64Sizes
      ? Number(UINT32_MAX)
      : 0
    : entry.usesZip64Sizes
      ? Number(UINT32_MAX)
      : toUint32Checked(entry.uncompressedSize, 'Uncompressed ZIP entry size');
  writeUint(data, offset, uncompressedSize);
  offset += 4;

  writeUshort(data, offset, entry.nameSize);
  offset += 2;
  writeUshort(data, offset, entry.localExtraSize);
  offset += 2;
  offset += writeUTF8(data, offset, entry.path);
  offset = writeZip64ExtraField(data, offset, entry, 'local');

  return data;
}

function buildCentralDirectoryHeader(entry: StreamingZipEntryMeta): Uint8Array {
  const data = new Uint8Array(
    toSafeNumber(getCentralDirectoryHeaderSize(entry), 'Central directory header size'),
  );
  let offset = 0;

  writeUint(data, offset, ZIP_CENTRAL_DIRECTORY_HEADER_SIGNATURE);
  offset += 4;
  writeUshort(data, offset, entry.versionNeeded);
  offset += 2;
  writeUshort(data, offset, entry.versionNeeded);
  offset += 2;
  writeUshort(data, offset, entry.generalPurposeFlag);
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
  writeUshort(data, offset, entry.centralExtraSize);
  offset += 2;
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
  offset += writeUTF8(data, offset, entry.path);
  offset = writeZip64ExtraField(data, offset, entry, 'central');

  return data;
}

function buildDataDescriptor(entry: StreamingZipEntryMeta): Uint8Array {
  const data = new Uint8Array(
    toSafeNumber(getDataDescriptorSize(entry), 'ZIP data descriptor size'),
  );
  let offset = 0;

  writeUint(data, offset, ZIP_DATA_DESCRIPTOR_SIGNATURE);
  offset += 4;
  writeUint(data, offset, entry.crc);
  offset += 4;

  if (entry.usesZip64Sizes) {
    writeUint64(data, offset, entry.compressedSize);
    offset += 8;
    writeUint64(data, offset, entry.uncompressedSize);
    offset += 8;
  } else {
    writeUint(
      data,
      offset,
      toUint32Checked(entry.compressedSize, 'Compressed ZIP entry size'),
    );
    offset += 4;
    writeUint(
      data,
      offset,
      toUint32Checked(entry.uncompressedSize, 'Uncompressed ZIP entry size'),
    );
    offset += 4;
  }

  return data;
}

function buildEndOfCentralDirectory(
  entryCount: bigint,
  centralDirectorySize: bigint,
  centralDirectoryOffset: bigint,
): Uint8Array {
  const needsZip64Directory =
    entryCount > UINT16_MAX ||
    centralDirectorySize > UINT32_MAX ||
    centralDirectoryOffset > UINT32_MAX;
  const data = new Uint8Array(needsZip64Directory ? 98 : 22);
  let offset = 0;

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
    writeUint64(
      data,
      offset,
      zip64EndOfCentralDirectoryOffset + centralDirectoryOffset + centralDirectorySize,
    );
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

  return data;
}

class SequentialZipWriterImpl implements ZipWriter {
  private closed = false;
  private aborted = false;
  private offset = 0n;
  private readonly entries: StreamingZipEntryMeta[] = [];

  constructor(private readonly sink: ZipOutputSink) {}

  async addBytes(path: string, bytes: Uint8Array, noCompress = false): Promise<void> {
    this.assertOpen();

    const shouldCompress = !shouldStoreWithoutCompression(path) && !noCompress;
    const file = shouldCompress ? deflateRaw(bytes) : bytes;
    const timestamp = Date.now();
    const entry = createEntryMeta(
      path,
      this.offset,
      BigInt(file.length),
      BigInt(bytes.length),
      shouldCompress
        ? ZIP_COMPRESSION_METHOD_DEFLATE
        : ZIP_COMPRESSION_METHOD_STORE,
      computeCrc32(bytes, 0, bytes.length),
      timestamp,
      false,
    );

    await this.sink.write(buildLocalHeader(entry));
    await this.sink.write(file);
    this.entries.push(entry);
    this.offset += getLocalHeaderSize(entry) + entry.compressedSize;
  }

  async addText(path: string, text: string): Promise<void> {
    await this.addBytes(path, ensureTextEncoder().encode(text));
  }

  async addStored(path: string, source: ZipChunkSource): Promise<void> {
    this.assertOpen();

    const timestamp = Date.now();
    const entry = createEntryMeta(
      path,
      this.offset,
      source.size,
      source.size,
      ZIP_COMPRESSION_METHOD_STORE,
      0,
      timestamp,
      true,
    );
    await this.sink.write(buildLocalHeader(entry));

    let checksum = 0xffffffff;
    let writtenSize = 0n;

    for await (const chunk of source.chunks()) {
      checksum = updateCrc32(checksum, chunk, 0, chunk.length);
      writtenSize += BigInt(chunk.length);
      await this.sink.write(chunk);
    }

    if (writtenSize !== source.size) {
      throw new Error(`ZIP entry size changed while streaming: ${path}`);
    }

    entry.crc = (checksum ^ 0xffffffff) >>> 0;
    entry.compressedSize = writtenSize;
    entry.uncompressedSize = writtenSize;

    const descriptor = buildDataDescriptor(entry);
    await this.sink.write(descriptor);
    this.entries.push(entry);
    this.offset += getLocalHeaderSize(entry) + writtenSize + BigInt(descriptor.length);
  }

  async close(): Promise<void> {
    if (this.closed || this.aborted) {
      return;
    }

    const centralDirectoryOffset = this.offset;
    let centralDirectorySize = 0n;

    for (const entry of this.entries) {
      const header = buildCentralDirectoryHeader(entry);
      await this.sink.write(header);
      centralDirectorySize += BigInt(header.length);
    }

    await this.sink.write(
      buildEndOfCentralDirectory(
        BigInt(this.entries.length),
        centralDirectorySize,
        centralDirectoryOffset,
      ),
    );
    this.closed = true;
    await this.sink.close?.();
  }

  async abort(): Promise<void> {
    if (this.closed || this.aborted) {
      return;
    }

    this.aborted = true;
    await this.sink.close?.();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('ZIP writer has already been closed');
    }

    if (this.aborted) {
      throw new Error('ZIP writer has already been aborted');
    }
  }
}

/**
 * Creates a ZIP writer that appends entries directly to a sequential byte sink.
 */
export function createZipWriter(sink: ZipOutputSink): ZipWriter {
  return new SequentialZipWriterImpl(sink);
}
