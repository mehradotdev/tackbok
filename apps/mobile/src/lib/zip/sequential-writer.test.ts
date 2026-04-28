import {
  parseZipArchive,
  readZipEntryBytes,
  readZipEntryText,
} from './reader/memory-reader';
import { createZipWriter, type ZipOutputSink } from './writer/sequential-writer';
import { readUint, readUint64, readUshort } from './core';
import {
  ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  findEndOfCentralDirectoryOffset,
} from './test-utils';

function createMemorySink(): { sink: ZipOutputSink; getBytes(): Uint8Array } {
  const chunks: Uint8Array[] = [];

  return {
    sink: {
      async write(bytes: Uint8Array): Promise<void> {
        chunks.push(bytes.slice());
      },
    },
    getBytes(): Uint8Array {
      const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const data = new Uint8Array(size);
      let offset = 0;

      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      return data;
    },
  };
}

function createChunkSource(bytes: Uint8Array, chunkSize = 3) {
  return {
    size: BigInt(bytes.length),
    async *chunks(): AsyncIterable<Uint8Array> {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        yield bytes.subarray(offset, offset + chunkSize).slice();
      }
    },
  };
}

function createMismatchedChunkSource(
  bytes: Uint8Array,
  declaredSizeDelta: bigint,
  chunkSize = 3,
) {
  return {
    size: BigInt(bytes.length) + declaredSizeDelta,
    async *chunks(): AsyncIterable<Uint8Array> {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        yield bytes.subarray(offset, offset + chunkSize).slice();
      }
    },
  };
}

describe('createZipWriter', () => {
  test('writes both in-memory and streamed entries', async () => {
    const { sink, getBytes } = createMemorySink();
    const writer = createZipWriter(sink);
    const largeAsset = new Uint8Array(32_768).fill(9);

    await writer.addText('manifest.json', '{"ok":true}');
    await writer.addStored('media/photo.jpg', createChunkSource(largeAsset, 1024));
    await writer.close();

    const archive = parseZipArchive(getBytes());

    expect(readZipEntryText(archive, 'manifest.json')).toBe('{"ok":true}');
    expect(readZipEntryBytes(archive, 'media/photo.jpg')).toEqual(largeAsset);
  });

  test('stores already-compressed addBytes entries without deflate', async () => {
    const { sink, getBytes } = createMemorySink();
    const writer = createZipWriter(sink);

    await writer.addBytes('media/photo.webp', new Uint8Array([1, 2, 3, 4]));
    await writer.close();

    const bytes = getBytes();

    expect(readUshort(bytes, 8)).toBe(0);
  });

  test('serializes concurrent public operations', async () => {
    const { sink, getBytes } = createMemorySink();
    const writer = createZipWriter(sink);
    const largeAsset = new Uint8Array(8_192).fill(7);

    await Promise.all([
      writer.addStored('media/photo.jpg', createChunkSource(largeAsset, 257)),
      writer.addText('manifest.json', '{"ok":true}'),
    ]);
    await writer.close();

    const archive = parseZipArchive(getBytes());

    expect(readZipEntryBytes(archive, 'media/photo.jpg')).toEqual(largeAsset);
    expect(readZipEntryText(archive, 'manifest.json')).toBe('{"ok":true}');
  });

  test('aborts the writer after a sink write fails mid-entry', async () => {
    const writes: Uint8Array[] = [];
    let closeCalls = 0;
    const sink: ZipOutputSink = {
      async write(bytes: Uint8Array): Promise<void> {
        if (writes.length === 1) {
          writes.push(bytes.subarray(0, Math.ceil(bytes.length / 2)).slice());
          throw new Error('disk full');
        }

        writes.push(bytes.slice());
      },
      async close(): Promise<void> {
        closeCalls += 1;
      },
    };
    const writer = createZipWriter(sink);

    await expect(writer.addBytes('broken.bin', new Uint8Array([1, 2, 3, 4]), true)).rejects.toThrow(
      'disk full',
    );
    await expect(writer.addText('later.txt', 'nope')).rejects.toThrow(
      /ZIP writer has already been aborted/,
    );
    await writer.close();

    expect(closeCalls).toBe(1);
    expect(writes).toHaveLength(2);
  });

  test('rejects entry paths whose UTF-8 encoded name exceeds the ZIP 16-bit limit', async () => {
    const { sink } = createMemorySink();
    const writer = createZipWriter(sink);
    const oversizedPath = `${'é'.repeat(32768)}.txt`;

    await expect(writer.addText(oversizedPath, 'x')).rejects.toThrow(
      /ZIP entry path is too long for header encoding/,
    );
  });

  test('aborts the writer when a streamed entry size changes mid-write', async () => {
    let closeCalls = 0;
    const chunks: Uint8Array[] = [];
    const streamingSink: ZipOutputSink = {
      async write(bytes: Uint8Array): Promise<void> {
        chunks.push(bytes.slice());
      },
      async close(): Promise<void> {
        closeCalls += 1;
      },
    };
    const writer = createZipWriter(streamingSink);

    await expect(
      writer.addStored(
        'media/photo.jpg',
        createMismatchedChunkSource(new Uint8Array([1, 2, 3, 4]), 1n, 2),
      ),
    ).rejects.toThrow(/ZIP entry size changed while streaming/);
    await expect(writer.addText('later.txt', 'nope')).rejects.toThrow(
      /ZIP writer has already been aborted/,
    );
    await writer.close();

    expect(closeCalls).toBe(1);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('emits ZIP64 directory metadata when entry count exceeds classic limits', async () => {
    const { sink, getBytes } = createMemorySink();
    const writer = createZipWriter(sink);

    for (let index = 0; index < 65536; index += 1) {
      await writer.addBytes(`file-${index}.txt`, new Uint8Array(0), true);
    }

    await writer.close();

    const bytes = getBytes();
    const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
    const locatorOffset = eocdOffset - 20;

    expect(readUshort(bytes, eocdOffset + 8)).toBe(0xffff);
    expect(readUshort(bytes, eocdOffset + 10)).toBe(0xffff);
    expect(readUint(bytes, eocdOffset + 12)).toBe(0xffffffff);
    expect(readUint(bytes, locatorOffset)).toBe(
      ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
    );

    const zip64EocdOffset = Number(readUint64(bytes, locatorOffset + 8));

    expect(readUint(bytes, zip64EocdOffset)).toBe(
      ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
    );
    expect(readUint64(bytes, zip64EocdOffset + 32)).toBe(65536n);
  });

  test('emits ZIP64 directory metadata when entry count reaches the classic sentinel', async () => {
    // TODO: Add a manual workstation end-to-end check for exact UINT32_MAX entry
    // sizes and offsets. CI cannot cheaply stream a multi-GB boundary fixture, so
    // this suite only covers the classic EOCD sentinel boundary.
    const { sink, getBytes } = createMemorySink();
    const writer = createZipWriter(sink);

    for (let index = 0; index < 65535; index += 1) {
      await writer.addBytes(`file-${index}.txt`, new Uint8Array(0), true);
    }

    await writer.close();

    const bytes = getBytes();
    const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
    const locatorOffset = eocdOffset - 20;

    expect(readUshort(bytes, eocdOffset + 8)).toBe(0xffff);
    expect(readUshort(bytes, eocdOffset + 10)).toBe(0xffff);
    expect(readUint(bytes, eocdOffset + 12)).toBe(0xffffffff);
    expect(readUint(bytes, locatorOffset)).toBe(
      ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
    );

    const zip64EocdOffset = Number(readUint64(bytes, locatorOffset + 8));

    expect(readUint(bytes, zip64EocdOffset)).toBe(
      ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
    );
    expect(readUint64(bytes, zip64EocdOffset + 32)).toBe(65535n);
  });
});
