import { gunzipSync, gzipSync } from 'node:zlib';

import { computeCrc32 } from './crc32';
import { decodeGzipBounded, encodeGzip, GzipCodecError } from './gzip-codec';

const LIMITS = {
  maxCompressedBytes: 1024 * 1024,
  maxUncompressedBytes: 1024 * 1024,
};

function expectGzipError(run: () => unknown, code: GzipCodecError['code']): void {
  try {
    run();
    throw new Error(`Expected gzip error ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(GzipCodecError);
    expect((error as GzipCodecError).code).toBe(code);
  }
}

function gzipWithOptionalHeader(source: Uint8Array): Uint8Array {
  const ordinary = encodeGzip(source);
  const deflate = ordinary.subarray(10, ordinary.length - 8);
  const trailer = ordinary.subarray(ordinary.length - 8);
  const flags = 0x02 | 0x04 | 0x08 | 0x10;
  const prefix = new Uint8Array([
    0x1f, 0x8b, 8, flags, 0, 0, 0, 0, 0, 3,
    3, 0, 0xaa, 0xbb, 0xcc,
    0x73, 0x79, 0x6e, 0x74, 0x68, 0x65, 0x74, 0x69, 0x63, 0,
    0x74, 0x65, 0x73, 0x74, 0,
  ]);
  const result = new Uint8Array(prefix.length + 2 + deflate.length + trailer.length);
  result.set(prefix);
  const headerCrc = computeCrc32(prefix, 0, prefix.length) & 0xffff;
  result[prefix.length] = headerCrc & 0xff;
  result[prefix.length + 1] = headerCrc >>> 8;
  result.set(deflate, prefix.length + 2);
  result.set(trailer, prefix.length + 2 + deflate.length);
  return result;
}

describe('in-house gzip codec', () => {
  test('writes deterministic metadata and round-trips one member', () => {
    const source = new TextEncoder().encode('synthetic snapshot text '.repeat(100));
    const first = encodeGzip(source, { level: 6 });
    const second = encodeGzip(source, { level: 6 });

    expect(first).toEqual(second);
    expect(Array.from(first.subarray(0, 10))).toEqual([
      0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 255,
    ]);
    expect(decodeGzipBounded(first, LIMITS)).toEqual(source);
    expect(decodeGzipBounded(encodeGzip(new Uint8Array(0), { level: 0 }), LIMITS))
      .toEqual(new Uint8Array(0));
  });

  test('accepts valid optional gzip fields and verifies FHCRC', () => {
    const source = new TextEncoder().encode('portable gzip member');
    const gzip = gzipWithOptionalHeader(source);
    expect(decodeGzipBounded(gzip, LIMITS)).toEqual(source);

    const corruptHeaderCrc = gzip.slice();
    corruptHeaderCrc[31] ^= 1;
    expect(() => decodeGzipBounded(corruptHeaderCrc, LIMITS)).toThrow(/header CRC/);
  });

  test('interoperates with the Node zlib reference implementation', () => {
    const source = new TextEncoder().encode('cross-implementation synthetic text '.repeat(100));
    const ours = encodeGzip(source);
    const node = new Uint8Array(gzipSync(source, { level: 6 }));

    expect(new Uint8Array(gunzipSync(ours))).toEqual(source);
    expect(decodeGzipBounded(node, LIMITS)).toEqual(source);
  });

  test('rejects malformed headers, corrupt trailers, appended bytes, and another member', () => {
    const source = new TextEncoder().encode('single member');
    const valid = encodeGzip(source);

    const reservedFlag = valid.slice();
    reservedFlag[3] = 0x20;
    expect(() => decodeGzipBounded(reservedFlag, LIMITS)).toThrow(/reserved header/);

    const corruptTrailer = valid.slice();
    corruptTrailer[corruptTrailer.length - 8] ^= 1;
    expect(() => decodeGzipBounded(corruptTrailer, LIMITS)).toThrow(/CRC/);

    const trailing = new Uint8Array(valid.length + 1);
    trailing.set(valid);
    expect(() => decodeGzipBounded(trailing, LIMITS)).toThrow(/Trailing data/);

    const concatenated = new Uint8Array(valid.length * 2);
    concatenated.set(valid);
    concatenated.set(valid, valid.length);
    expect(() => decodeGzipBounded(concatenated, LIMITS)).toThrow(/members/);
  });

  test('enforces compressed and decompressed bounds during decoding', () => {
    const source = new TextEncoder().encode('x'.repeat(4096));
    const valid = encodeGzip(source);

    expectGzipError(() => decodeGzipBounded(valid, {
      ...LIMITS,
      maxCompressedBytes: valid.length - 1,
    }), 'compressed-size-cap');
    expectGzipError(() => decodeGzipBounded(valid, {
      ...LIMITS,
      maxUncompressedBytes: source.length - 1,
    }), 'uncompressed-size-cap');
  });
});
