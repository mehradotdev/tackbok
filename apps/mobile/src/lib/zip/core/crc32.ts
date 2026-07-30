/**
 * CRC32 implementation used by ZIP local and central directory records.
 *
 * Uses the slice-by-8 variant: 8 lookup tables let the hot loop consume 8
 * bytes per iteration, which matters because export runs this over every
 * stored media byte on the interpreted (Hermes) JS thread.
 */

const CRC_TABLES = (() => {
  const tables = new Uint32Array(256 * 8);

  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    tables[value] = current;
  }

  for (let slice = 1; slice < 8; slice += 1) {
    for (let value = 0; value < 256; value += 1) {
      const previous = tables[(slice - 1) * 256 + value];
      tables[slice * 256 + value] = (previous >>> 8) ^ tables[previous & 0xff];
    }
  }

  return tables;
})();

export function updateCrc32(
  checksum: number,
  buffer: Uint8Array,
  offset: number,
  length: number,
): number {
  let current = checksum;
  let index = offset;
  const end = offset + length;
  const end8 = offset + (length & ~7);

  while (index < end8) {
    current ^=
      buffer[index] |
      (buffer[index + 1] << 8) |
      (buffer[index + 2] << 16) |
      (buffer[index + 3] << 24);
    current =
      CRC_TABLES[1792 + (current & 0xff)] ^
      CRC_TABLES[1536 + ((current >>> 8) & 0xff)] ^
      CRC_TABLES[1280 + ((current >>> 16) & 0xff)] ^
      CRC_TABLES[1024 + (current >>> 24)] ^
      CRC_TABLES[768 + buffer[index + 4]] ^
      CRC_TABLES[512 + buffer[index + 5]] ^
      CRC_TABLES[256 + buffer[index + 6]] ^
      CRC_TABLES[buffer[index + 7]];
    index += 8;
  }

  while (index < end) {
    current = CRC_TABLES[(current ^ buffer[index]) & 0xff] ^ (current >>> 8);
    index += 1;
  }

  return current;
}

/**
 * Computes the CRC32 checksum for a byte range.
 */
export function computeCrc32(buffer: Uint8Array, offset: number, length: number): number {
  // Normalize the finalized CRC to uint32 so comparisons stay consistent with ZIP field reads.
  return (updateCrc32(0xffffffff, buffer, offset, length) ^ 0xffffffff) >>> 0;
}
