import {
  readIBM,
  readUint,
  readUshort,
  readUTF8,
  sizeUTF8,
  writeUint,
  writeUshort,
  writeUTF8,
} from './byte-utils';
import { computeCrc32 } from './crc32';
import { deflateRaw, inflateRaw } from './deflate-codec';
import type { EncodedZipEntry, ZipEntries } from './types';

/**
 * Parses a ZIP archive and returns cloned entry contents keyed by entry path.
 */
export function parse(buffer: ArrayBuffer): ZipEntries {
  const data = new Uint8Array(buffer);
  const entries: ZipEntries = Object.create(null) as ZipEntries;

  let endOfCentralDirectory = data.length - 4;
  while (
    endOfCentralDirectory >= 0 &&
    readUint(data, endOfCentralDirectory) !== 0x06054b50
  ) {
    endOfCentralDirectory -= 1;
  }

  if (endOfCentralDirectory < 0) {
    throw new Error('Invalid ZIP archive: end of central directory not found');
  }

  let offset = endOfCentralDirectory + 8;
  const entryCount = readUshort(data, offset);
  offset += 2;
  offset += 2;
  offset += 4;
  const centralDirectoryOffset = readUint(data, offset);

  offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    offset += 4;
    offset += 4;
    offset += 4;
    offset += 4;

    offset += 4;
    let compressedSize = readUint(data, offset);
    offset += 4;
    let uncompressedSize = readUint(data, offset);
    offset += 4;

    const nameLength = readUshort(data, offset);
    const extraLength = readUshort(data, offset + 2);
    const commentLength = readUshort(data, offset + 4);
    offset += 6;
    offset += 8;
    let recordOffset = readUint(data, offset);
    offset += 4;
    offset += nameLength;

    let extraOffset = 0;
    while (extraOffset < extraLength) {
      const id = readUshort(data, offset + extraOffset);
      extraOffset += 2;
      const size = readUshort(data, offset + extraOffset);
      extraOffset += 2;

      if (id === 1) {
        if (uncompressedSize === 0xffffffff) {
          uncompressedSize = readUint(data, offset + extraOffset);
          extraOffset += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = readUint(data, offset + extraOffset);
          extraOffset += 8;
        }
        if (recordOffset === 0xffffffff) {
          recordOffset = readUint(data, offset + extraOffset);
          extraOffset += 8;
        }
      } else {
        extraOffset += size;
      }
    }

    offset += extraLength + commentLength;
    readLocalFile(data, recordOffset, entries, compressedSize, uncompressedSize);
  }

  return entries;
}

/**
 * Encodes a set of in-memory files into a ZIP archive buffer.
 */
export function encode(entries: ZipEntries, noCompress = false): ArrayBuffer {
  const files: Record<string, EncodedZipEntry> = Object.create(null) as Record<
    string,
    EncodedZipEntry
  >;
  let totalSize = 22;

  for (const path in entries) {
    const bytes = entries[path];
    const shouldCompress = !shouldStoreWithoutCompression(path) && !noCompress;
    const file = shouldCompress ? deflateRaw(bytes) : bytes;

    files[path] = {
      cpr: shouldCompress,
      usize: bytes.length,
      crc: computeCrc32(bytes, 0, bytes.length),
      file,
    };

    totalSize += file.length + 30 + 46 + 2 * sizeUTF8(path);
  }

  const data = new Uint8Array(totalSize);
  const fileOffsets: number[] = [];
  let offset = 0;

  for (const path in files) {
    fileOffsets.push(offset);
    offset = writeHeader(data, offset, path, files[path], 0);
  }

  const centralDirectoryOffset = offset;
  let index = 0;
  for (const path in files) {
    offset = writeHeader(data, offset, path, files[path], 1, fileOffsets[index]);
    index += 1;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  writeUint(data, offset, 0x06054b50);
  offset += 4;
  offset += 4;
  writeUshort(data, offset, index);
  offset += 2;
  writeUshort(data, offset, index);
  offset += 2;
  writeUint(data, offset, centralDirectorySize);
  offset += 4;
  writeUint(data, offset, centralDirectoryOffset);
  offset += 4;
  offset += 2;

  return data.buffer;
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
 * Reads one local file record from the archive and materializes its contents.
 */
function readLocalFile(
  data: Uint8Array,
  offset: number,
  entries: ZipEntries,
  compressedSize: number,
  uncompressedSize: number,
): void {
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

  const decodedName =
    (generalPurposeFlag & 2048) === 0
      ? readIBM(data, offset, nameLength)
      : readUTF8(data, offset, nameLength);
  const name = decodedName ?? readUTF8(data, offset, nameLength);

  offset += nameLength + extraLength;

  if ((generalPurposeFlag & 1) !== 0) {
    throw new Error('ZIPs with a password are not supported');
  }

  const file = data.subarray(offset, offset + compressedSize);
  if (compressionMethod === 0) {
    entries[name] = file.slice();
    return;
  }

  if (compressionMethod === 8) {
    const output = new Uint8Array(uncompressedSize);
    inflateRaw(file, output);
    entries[name] = output;
    return;
  }

  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

function shouldStoreWithoutCompression(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return ['png', 'jpg', 'jpeg', 'zip'].includes(extension);
}

/**
 * Writes either a local file header or a central directory header.
 */
function writeHeader(
  data: Uint8Array,
  offset: number,
  path: string,
  entry: EncodedZipEntry,
  type: 0 | 1,
  recordOffset = 0,
): number {
  writeUint(data, offset, type === 0 ? 0x04034b50 : 0x02014b50);
  offset += 4;

  if (type === 1) {
    offset += 2;
  }

  writeUshort(data, offset, 20);
  offset += 2;
  writeUshort(data, offset, 2048);
  offset += 2;
  writeUshort(data, offset, entry.cpr ? 8 : 0);
  offset += 2;

  writeDosTime(data, offset, Date.now());
  offset += 4;
  writeUint(data, offset, entry.crc);
  offset += 4;
  writeUint(data, offset, entry.file.length);
  offset += 4;
  writeUint(data, offset, entry.usize);
  offset += 4;

  writeUshort(data, offset, sizeUTF8(path));
  offset += 2;
  writeUshort(data, offset, 0);
  offset += 2;

  if (type === 1) {
    offset += 2;
    offset += 2;
    offset += 6;
    writeUint(data, offset, recordOffset);
    offset += 4;
  }

  offset += writeUTF8(data, offset, path);
  if (type === 0) {
    data.set(entry.file, offset);
    offset += entry.file.length;
  }

  return offset;
}
