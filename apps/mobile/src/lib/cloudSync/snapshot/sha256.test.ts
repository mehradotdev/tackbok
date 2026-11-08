import { createHash, randomBytes } from 'node:crypto';
import { hexDigestHasher, sha256Bytes } from './sha256';

// Stands in for expo-crypto's native digest: raw SHA-256 bytes as an ArrayBuffer.
const nodeDigestHasher = hexDigestHasher(async (bytes) => {
  const digest = createHash('sha256').update(bytes).digest();
  return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
});

describe('hexDigestHasher', () => {
  test.each([
    ['empty', new Uint8Array()],
    ['one byte', Uint8Array.of(0x61)],
    ['one block boundary', new Uint8Array(64).fill(0xff)],
    ['1 MiB random', new Uint8Array(randomBytes(1024 * 1024))],
  ])('matches the pure-JS hash for %s input', async (_name, bytes) => {
    const hex = await nodeDigestHasher(bytes);
    expect(hex).toMatch(/^[a-f0-9]{64}$/);
    expect(hex).toBe(sha256Bytes(bytes));
  });

  test('hashes only the viewed bytes of a subarray', async () => {
    const backing = new Uint8Array(randomBytes(4096));
    const view = backing.subarray(100, 3000);
    expect(await nodeDigestHasher(view)).toBe(sha256Bytes(view));
  });

  test('rejects a digest that is not 32 bytes', async () => {
    const short = hexDigestHasher(async () => new ArrayBuffer(16));
    await expect(short(Uint8Array.of(1))).rejects.toThrow('invalid-sha256-digest');
  });
});
