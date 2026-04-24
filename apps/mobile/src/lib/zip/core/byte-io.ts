/**
 * Low-level typed field read/write for ZIP binary structures.
 *
 * All functions operate on Uint8Array slices at explicit byte offsets using
 * little-endian byte order, which is required by the ZIP specification.
 * BigInt boundary validators live here because they guard the same binary
 * fields that readUint64/writeUint64 operate on.
 */

export function readUshort(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

export function writeUshort(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 255;
  buffer[offset + 1] = (value >> 8) & 255;
}

export function readUint(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] |
      (buffer[offset + 1] << 8) |
      (buffer[offset + 2] << 16) |
      (buffer[offset + 3] << 24)) >>>
    0
  );
}

export function writeUint(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 255;
  buffer[offset + 1] = (value >> 8) & 255;
  buffer[offset + 2] = (value >> 16) & 255;
  buffer[offset + 3] = (value >> 24) & 255;
}

const UINT16_MAX_BIGINT = 0xffffn;
const UINT32_MAX_BIGINT = 0xffffffffn;
const UINT64_MAX = 0xffffffffffffffffn;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export function readUint64(buffer: Uint8Array, offset: number): bigint {
  const low = BigInt(readUint(buffer, offset));
  const high = BigInt(readUint(buffer, offset + 4));
  return low | (high << 32n);
}

export function writeUint64(buffer: Uint8Array, offset: number, value: bigint): void {
  assertUint64Range(value, 'ZIP64 field');
  writeUint(buffer, offset, Number(value & UINT32_MAX_BIGINT));
  writeUint(buffer, offset + 4, Number((value >> 32n) & UINT32_MAX_BIGINT));
}

export function assertUint64Range(value: bigint, fieldName: string): void {
  if (value < 0n || value > UINT64_MAX) {
    throw new Error(`${fieldName} must be a valid unsigned 64-bit integer`);
  }
}

export function toSafeNumber(value: bigint, fieldName: string): number {
  assertUint64Range(value, fieldName);

  if (value > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error(`${fieldName} exceeds the JavaScript safe integer range`);
  }

  return Number(value);
}

export function toUint32Checked(value: bigint, fieldName: string): number {
  assertUint64Range(value, fieldName);

  if (value > UINT32_MAX_BIGINT) {
    throw new Error(`${fieldName} exceeds the ZIP 32-bit field range`);
  }

  return Number(value);
}

export function toUint16Checked(value: bigint, fieldName: string): number {
  assertUint64Range(value, fieldName);

  if (value > UINT16_MAX_BIGINT) {
    throw new Error(`${fieldName} exceeds the ZIP 16-bit field range`);
  }

  return Number(value);
}

export function readASCII(buffer: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(buffer[offset + index]);
  }
  return value;
}
