import { readUint } from './byte-io';
import { deflateRaw, inflateRaw } from './deflate-codec';

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
});
