import {
  readUint,
  readUint64,
  readUshort,
  writeUint,
  writeUint64,
  writeUshort,
} from './core';

export const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
export const ZIP_CENTRAL_DIRECTORY_DIGITAL_SIGNATURE = 0x05054b50;
export const ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06064b50;
export const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = 0x07064b50;

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function findEndOfCentralDirectoryOffset(data: Uint8Array): number {
  for (let offset = data.length - 22; offset >= 0; offset -= 1) {
    if (readUint(data, offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }

    const commentLength = readUshort(data, offset + 20);
    if (offset + 22 + commentLength === data.length) {
      return offset;
    }
  }

  throw new Error('EOCD not found in test fixture');
}

function insertBytes(data: Uint8Array, offset: number, inserted: Uint8Array): Uint8Array {
  const next = new Uint8Array(data.length + inserted.length);
  next.set(data.subarray(0, offset), 0);
  next.set(inserted, offset);
  next.set(data.subarray(offset), offset + inserted.length);
  return next;
}

export function addCentralDirectoryZip64Extra(
  bytes: Uint8Array,
  values: {
    compressedSize: bigint;
    uncompressedSize: bigint;
    localHeaderOffset: bigint;
  },
): Uint8Array {
  const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
  const centralDirectoryOffset = readUint(bytes, eocdOffset + 16);
  const nameLength = readUshort(bytes, centralDirectoryOffset + 28);
  const insertOffset = centralDirectoryOffset + 46 + nameLength;
  const extra = new Uint8Array(28);

  writeUshort(extra, 0, 1);
  writeUshort(extra, 2, 24);
  writeUint64(extra, 4, values.uncompressedSize);
  writeUint64(extra, 12, values.compressedSize);
  writeUint64(extra, 20, values.localHeaderOffset);

  const next = insertBytes(bytes, insertOffset, extra);
  const shiftedEocdOffset = eocdOffset + extra.length;

  writeUint(next, centralDirectoryOffset + 20, 0xffffffff);
  writeUint(next, centralDirectoryOffset + 24, 0xffffffff);
  writeUint(next, centralDirectoryOffset + 42, 0xffffffff);
  writeUshort(next, centralDirectoryOffset + 30, extra.length);
  writeUint(
    next,
    shiftedEocdOffset + 12,
    readUint(bytes, eocdOffset + 12) + extra.length,
  );

  return next;
}

export function addZip64EndOfCentralDirectory(bytes: Uint8Array): Uint8Array {
  const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
  const entryCount = readUshort(bytes, eocdOffset + 10);
  const centralDirectorySize = readUint(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUint(bytes, eocdOffset + 16);
  const extra = new Uint8Array(76);

  writeUint(extra, 0, ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  writeUint64(extra, 4, 44n);
  writeUshort(extra, 12, 45);
  writeUshort(extra, 14, 45);
  writeUint(extra, 16, 0);
  writeUint(extra, 20, 0);
  writeUint64(extra, 24, BigInt(entryCount));
  writeUint64(extra, 32, BigInt(entryCount));
  writeUint64(extra, 40, BigInt(centralDirectorySize));
  writeUint64(extra, 48, BigInt(centralDirectoryOffset));
  writeUint(extra, 56, ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE);
  writeUint(extra, 60, 0);
  writeUint64(extra, 64, BigInt(eocdOffset));
  writeUint(extra, 72, 1);

  const next = insertBytes(bytes, eocdOffset, extra);
  const shiftedEocdOffset = eocdOffset + extra.length;

  writeUshort(next, shiftedEocdOffset + 8, 0xffff);
  writeUshort(next, shiftedEocdOffset + 10, 0xffff);
  writeUint(next, shiftedEocdOffset + 12, 0xffffffff);
  writeUint(next, shiftedEocdOffset + 16, 0xffffffff);

  return next;
}

export function addCentralDirectoryDigitalSignature(
  bytes: Uint8Array,
  signatureData: Uint8Array,
): Uint8Array {
  const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
  const trailer = new Uint8Array(6 + signatureData.length);

  writeUint(trailer, 0, ZIP_CENTRAL_DIRECTORY_DIGITAL_SIGNATURE);
  writeUshort(trailer, 4, signatureData.length);
  trailer.set(signatureData, 6);

  const next = insertBytes(bytes, eocdOffset, trailer);
  writeUint(next, eocdOffset + trailer.length + 12, readUint(bytes, eocdOffset + 12) + trailer.length);

  return next;
}

export function findZip64EndOfCentralDirectoryOffset(bytes: Uint8Array): number {
  const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
  const locatorOffset = eocdOffset - 20;
  return Number(readUint64(bytes, locatorOffset + 8));
}
