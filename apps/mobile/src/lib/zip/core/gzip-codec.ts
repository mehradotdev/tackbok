import { readUint, writeUint } from './byte-io';
import { computeCrc32 } from './crc32';
import { deflateRaw, inflateRawBounded } from './deflate-codec';

const GZIP_ID1 = 0x1f;
const GZIP_ID2 = 0x8b;
const DEFLATE_METHOD = 8;
const FIXED_HEADER_BYTES = 10;
const TRAILER_BYTES = 8;

const FLAG_HEADER_CRC = 0x02;
const FLAG_EXTRA = 0x04;
const FLAG_NAME = 0x08;
const FLAG_COMMENT = 0x10;
const RESERVED_FLAGS = 0xe0;

export type GzipCodecErrorCode =
  | 'compressed-size-cap'
  | 'uncompressed-size-cap'
  | 'invalid-gzip'
  | 'invalid-gzip-trailer'
  | 'multiple-gzip-members'
  | 'trailing-gzip-data';

export class GzipCodecError extends Error {
  constructor(
    readonly code: GzipCodecErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GzipCodecError';
  }
}

export interface GzipDecodeLimits {
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
}

export interface GzipEncodeOptions {
  level?: number;
}

function fail(code: GzipCodecErrorCode, message: string): never {
  throw new GzipCodecError(code, message);
}

function assertLimit(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function requireBytes(bytes: Uint8Array, offset: number, length: number): void {
  if (offset > bytes.length - length) {
    fail('invalid-gzip', 'Invalid gzip stream: truncated header or trailer');
  }
}

function skipZeroTerminatedField(bytes: Uint8Array, offset: number): number {
  while (offset < bytes.length && bytes[offset] !== 0) offset += 1;
  if (offset >= bytes.length) {
    fail('invalid-gzip', 'Invalid gzip stream: unterminated header field');
  }
  return offset + 1;
}

function parseHeader(bytes: Uint8Array): number {
  requireBytes(bytes, 0, FIXED_HEADER_BYTES + TRAILER_BYTES);
  if (bytes[0] !== GZIP_ID1 || bytes[1] !== GZIP_ID2 || bytes[2] !== DEFLATE_METHOD) {
    fail('invalid-gzip', 'Snapshot is not a gzip DEFLATE stream');
  }

  const flags = bytes[3];
  if ((flags & RESERVED_FLAGS) !== 0) {
    fail('invalid-gzip', 'Invalid gzip stream: reserved header flags are set');
  }

  let offset = FIXED_HEADER_BYTES;
  if ((flags & FLAG_EXTRA) !== 0) {
    requireBytes(bytes, offset, 2);
    const extraLength = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
    requireBytes(bytes, offset, extraLength);
    offset += extraLength;
  }
  if ((flags & FLAG_NAME) !== 0) offset = skipZeroTerminatedField(bytes, offset);
  if ((flags & FLAG_COMMENT) !== 0) offset = skipZeroTerminatedField(bytes, offset);
  if ((flags & FLAG_HEADER_CRC) !== 0) {
    requireBytes(bytes, offset, 2);
    const expected = bytes[offset] | (bytes[offset + 1] << 8);
    const actual = computeCrc32(bytes, 0, offset) & 0xffff;
    if (actual !== expected) {
      fail('invalid-gzip', 'Invalid gzip stream: header CRC does not match');
    }
    offset += 2;
  }

  requireBytes(bytes, offset, TRAILER_BYTES);
  return offset;
}

/**
 * Writes one deterministic RFC 1952 member around the existing raw DEFLATE
 * codec. Snapshot identity remains the caller's uncompressed canonical bytes.
 */
export function encodeGzip(
  bytes: Uint8Array,
  options: GzipEncodeOptions = {},
): Uint8Array {
  const level = options.level ?? 6;
  if (!Number.isInteger(level) || level < 0 || level > 9) {
    throw new Error('gzip compression level must be an integer from 0 through 9');
  }

  const deflated = deflateRaw(bytes, { level });
  const result = new Uint8Array(FIXED_HEADER_BYTES + deflated.length + TRAILER_BYTES);
  result.set([
    GZIP_ID1,
    GZIP_ID2,
    DEFLATE_METHOD,
    0, // FLG: no optional metadata.
    0, 0, 0, 0, // MTIME=0.
    0, // XFL: default strategy.
    255, // OS: unknown, so bytes do not vary by host.
  ]);
  result.set(deflated, FIXED_HEADER_BYTES);
  const trailerOffset = FIXED_HEADER_BYTES + deflated.length;
  writeUint(result, trailerOffset, computeCrc32(bytes, 0, bytes.length));
  writeUint(result, trailerOffset + 4, bytes.length >>> 0);
  return result;
}

/**
 * Decodes exactly one RFC 1952 member. The raw inflater grows only up to the
 * configured output ceiling and reports its consumed input so appended bytes
 * cannot hide behind a valid first DEFLATE stream.
 */
export function decodeGzipBounded(
  compressed: Uint8Array,
  limits: GzipDecodeLimits,
): Uint8Array {
  assertLimit(limits.maxCompressedBytes, 'gzip compressed-byte limit');
  assertLimit(limits.maxUncompressedBytes, 'gzip uncompressed-byte limit');
  if (compressed.length > limits.maxCompressedBytes) {
    fail('compressed-size-cap', 'Compressed gzip data exceeds the configured limit');
  }

  const deflateOffset = parseHeader(compressed);
  let inflated: Uint8Array;
  let consumedBytes: number;
  try {
    ({ bytes: inflated, consumedBytes } = inflateRawBounded(
      compressed.subarray(deflateOffset),
      limits.maxUncompressedBytes,
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid DEFLATE stream';
    if (message.includes('output exceeds')) {
      fail('uncompressed-size-cap', 'Uncompressed gzip data exceeds the configured limit');
    }
    fail('invalid-gzip', message);
  }

  const trailerOffset = deflateOffset + consumedBytes;
  requireBytes(compressed, trailerOffset, TRAILER_BYTES);
  const expectedCrc = readUint(compressed, trailerOffset);
  const expectedSize = readUint(compressed, trailerOffset + 4);
  if (
    expectedCrc !== computeCrc32(inflated, 0, inflated.length) ||
    expectedSize !== (inflated.length >>> 0)
  ) {
    fail('invalid-gzip-trailer', 'Gzip CRC or uncompressed length is invalid');
  }

  const memberEnd = trailerOffset + TRAILER_BYTES;
  if (memberEnd !== compressed.length) {
    if (
      compressed.length - memberEnd >= 2 &&
      compressed[memberEnd] === GZIP_ID1 &&
      compressed[memberEnd + 1] === GZIP_ID2
    ) {
      fail('multiple-gzip-members', 'Concatenated gzip members are forbidden');
    }
    fail('trailing-gzip-data', 'Trailing data after the gzip member is forbidden');
  }

  return inflated;
}
