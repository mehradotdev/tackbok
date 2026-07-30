import { readUint } from './byte-io';
import { computeCrc32, updateCrc32 } from './crc32';
import { deflateRaw, inflateRaw } from './deflate-codec';

/** Bitwise reference CRC32 used to validate the table-driven implementation. */
function referenceCrc32(buffer: Uint8Array): number {
  let current = 0xffffffff;
  for (const byte of buffer) {
    current ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
  }
  return (current ^ 0xffffffff) >>> 0;
}

function pseudoRandomBytes(length: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let state = seed;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes;
}

describe('core safety', () => {
  test('readUint handles full 32-bit unsigned values', () => {
    const max = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const highBit = new Uint8Array([0x00, 0x00, 0x00, 0x80]);

    expect(readUint(max, 0)).toBe(0xffffffff);
    expect(readUint(highBit, 0)).toBe(0x80000000);
  });

  test('inflateRaw rejects truncated DEFLATE bitstreams', () => {
    const source = new TextEncoder().encode('hello hello hello');
    const compressed = deflateRaw(source);
    const truncated = compressed.subarray(0, compressed.length - 1);

    expect(() => inflateRaw(truncated)).toThrow(
      'Invalid DEFLATE data: truncated bitstream',
    );
  });

  test('computeCrc32 matches the CRC32 check value and a bitwise reference', () => {
    const check = new TextEncoder().encode('123456789');
    expect(computeCrc32(check, 0, check.length)).toBe(0xcbf43926);

    // Length 1027 is deliberately not a multiple of 8 so the slice-by-8 fast
    // path and the byte-at-a-time tail are both exercised.
    const bytes = pseudoRandomBytes(1027, 42);
    expect(computeCrc32(bytes, 0, bytes.length)).toBe(referenceCrc32(bytes));
    expect(computeCrc32(bytes, 5, 900)).toBe(
      referenceCrc32(bytes.subarray(5, 905)),
    );
  });

  test('updateCrc32 chained over arbitrary splits matches a single pass', () => {
    const bytes = pseudoRandomBytes(4096, 7);
    const whole = computeCrc32(bytes, 0, bytes.length);

    for (const splitAt of [0, 1, 7, 8, 9, 1000, 4095, 4096]) {
      let checksum = 0xffffffff;
      checksum = updateCrc32(checksum, bytes, 0, splitAt);
      checksum = updateCrc32(checksum, bytes, splitAt, bytes.length - splitAt);
      expect((checksum ^ 0xffffffff) >>> 0).toBe(whole);
    }
  });

  test('inflateRaw round-trips into an exactly sized destination buffer', () => {
    const compressible = new TextEncoder().encode('hello hello hello '.repeat(50));
    const incompressible = pseudoRandomBytes(70000, 3);

    for (const source of [compressible, incompressible]) {
      const output = new Uint8Array(source.length);
      inflateRaw(deflateRaw(source), output);
      expect(output).toEqual(source);
    }
  });

  test('inflateRaw rejects streams that underfill a fixed destination buffer', () => {
    const compressible = new TextEncoder().encode('hello hello hello '.repeat(50));
    const incompressible = pseudoRandomBytes(70000, 3);

    // A destination one byte larger than the decoded payload must not be
    // silently zero-padded.
    for (const source of [compressible, incompressible]) {
      const compressed = deflateRaw(source);
      expect(() => inflateRaw(compressed, new Uint8Array(source.length + 1))).toThrow(
        'Invalid DEFLATE data: output is smaller than the declared size',
      );
    }

    // The 0x03 0x00 empty-stream fast path must obey the same rule.
    const emptyStream = deflateRaw(new Uint8Array(0));
    expect(Array.from(emptyStream)).toEqual([3, 0]);
    expect(() => inflateRaw(emptyStream, new Uint8Array(1))).toThrow(
      'Invalid DEFLATE data: output is smaller than the declared size',
    );
    expect(inflateRaw(emptyStream, new Uint8Array(0))).toEqual(new Uint8Array(0));
    expect(inflateRaw(emptyStream)).toEqual(new Uint8Array(0));
  });

  test('inflateRaw rejects reserved distance symbols 30 and 31', () => {
    // Hand-assembled fixed-Huffman blocks: final-block bit, block type 01,
    // length symbol 257 (a three-byte match), then the reserved distance
    // symbol. Real encoders never emit distance codes above 29.
    const reservedSymbol30 = new Uint8Array([0x03, 0x3e]);
    const reservedSymbol31 = new Uint8Array([0x03, 0x7e]);

    for (const stream of [reservedSymbol30, reservedSymbol31]) {
      expect(() => inflateRaw(stream, new Uint8Array(3))).toThrow(
        'Invalid DEFLATE data: reserved distance symbol',
      );
      expect(() => inflateRaw(stream)).toThrow(
        'Invalid DEFLATE data: reserved distance symbol',
      );
    }
  });

  test('inflateRaw rejects output larger than the provided buffer', () => {
    // Compressible input decodes through the Huffman literal/match paths;
    // incompressible input decodes through the stored-block path.
    const compressible = new TextEncoder().encode('hello hello hello '.repeat(50));
    const incompressible = pseudoRandomBytes(70000, 3);

    for (const source of [compressible, incompressible]) {
      const compressed = deflateRaw(source);
      expect(() => inflateRaw(compressed, new Uint8Array(source.length - 1))).toThrow(
        'Invalid DEFLATE data: output exceeds the declared size',
      );
    }
  });
});
