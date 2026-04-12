/**
 * CRC32 implementation used by ZIP local and central directory records.
 */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[value] = current;
  }
  return table;
})();

export function updateCrc32(
  checksum: number,
  buffer: Uint8Array,
  offset: number,
  length: number,
): number {
  let current = checksum;
  for (let index = 0; index < length; index += 1) {
    current = crcTable[(current ^ buffer[offset + index]) & 0xff] ^ (current >>> 8);
  }
  return current;
}

/**
 * Computes the CRC32 checksum for a byte range.
 */
export function computeCrc32(buffer: Uint8Array, offset: number, length: number): number {
  return updateCrc32(0xffffffff, buffer, offset, length) ^ 0xffffffff;
}
