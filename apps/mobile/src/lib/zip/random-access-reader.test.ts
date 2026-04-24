import { encodeZipArchiveBytes } from './core';
import { addZip64EndOfCentralDirectory } from './test-utils';
import {
  createMemoryZipReaderSource,
  openZipReader,
} from './reader/random-access-reader';

const textEncoder = new TextEncoder();


describe('openZipReader', () => {
  test('reads entries without materializing the whole archive', async () => {
    const bytes = new Uint8Array(
      encodeZipArchiveBytes(
        {
          'manifest.json': textEncoder.encode('{"ok":true}'),
          'assets/big.bin': new Uint8Array(150_000).fill(7),
        },
        true,
      ),
    );
    const reads: number[] = [];
    const reader = {
      ...createMemoryZipReaderSource(bytes),
      async read(offset: bigint, length: number): Promise<Uint8Array> {
        reads.push(length);
        return bytes.subarray(Number(offset), Number(offset) + length).slice();
      },
    };

    const archive = await openZipReader(reader);
    const bytesReadDuringOpen = reads.reduce((sum, value) => sum + value, 0);

    expect(archive.hasEntry('manifest.json')).toBe(true);
    expect(bytesReadDuringOpen).toBeLessThan(bytes.length);

    const manifest = await archive.readEntryJson<{ ok: boolean }>('manifest.json');
    const totalBytesRead = reads.reduce((sum, value) => sum + value, 0);

    expect(manifest).toEqual({ ok: true });
    expect(totalBytesRead).toBeLessThan(bytes.length);
  });

  test('reads UTF-8 filenames with emoji and non-BMP code points', async () => {
    const unicodePath = 'notes/emoji-😀/music-𠮷-🧪.txt';
    const bytes = new Uint8Array(
      encodeZipArchiveBytes({ [unicodePath]: textEncoder.encode('unicode-ok') }, true),
    );

    const archive = await openZipReader(createMemoryZipReaderSource(bytes));

    await expect(archive.readEntryText(unicodePath)).resolves.toBe('unicode-ok');
  });

  test('supports ZIP64 EOCD metadata', async () => {
    const base = new Uint8Array(
      encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
    );
    const zip64 = addZip64EndOfCentralDirectory(base);
    const archive = await openZipReader(
      createMemoryZipReaderSource(zip64),
    );

    await expect(archive.readEntryText('sample.txt')).resolves.toBe('hello');
  });
});
