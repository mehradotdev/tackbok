import { encodeZipArchiveBytes, readUint, writeUint, writeUint64 } from './core';
import {
  addZip64EndOfCentralDirectory,
  findEndOfCentralDirectoryOffset,
  findZip64EndOfCentralDirectoryOffset,
} from './test-utils';
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

  test('rejects malformed ZIP64 EOCD records that are smaller than the minimum size', async () => {
    const base = new Uint8Array(
      encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
    );
    const zip64 = addZip64EndOfCentralDirectory(base);
    const zip64EocdOffset = findZip64EndOfCentralDirectoryOffset(zip64);

    writeUint64(zip64, zip64EocdOffset + 4, 43n);

    await expect(openZipReader(createMemoryZipReaderSource(zip64))).rejects.toThrow(
      'Invalid ZIP archive: ZIP64 end of central directory record is malformed',
    );
  });

  test('rejects stored entries whose advertised sizes do not match', async () => {
    const bytes = new Uint8Array(
      encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
    );
    const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
    const centralDirectoryOffset = readUint(bytes, eocdOffset + 16);

    writeUint(bytes, centralDirectoryOffset + 24, 6);

    const archive = await openZipReader(createMemoryZipReaderSource(bytes));

    await expect(archive.readEntryText('sample.txt')).rejects.toThrow(
      'Invalid ZIP archive: stored entry has mismatched compressed and uncompressed sizes',
    );
  });
});
