import {
  findZipEntryPathByBasename,
  hasZipEntry,
  parseZipArchive,
  readZipEntryText,
} from './reader/memory-reader';
import { parseLocalFileHeader } from './core/zip-parser';
import { createZipEntryLookup } from './zip-entry-lookup';
import {
  encodeZipArchiveBytes,
  parseZipArchiveBytes,
  readUint,
  readUint64,
  readUshort,
  writeUint,
  writeUshort,
} from './core';
import {
  ZIP_CENTRAL_DIRECTORY_DIGITAL_SIGNATURE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
  addCentralDirectoryDigitalSignature,
  addCentralDirectoryZip64Extra,
  addZip64EndOfCentralDirectory,
  findEndOfCentralDirectoryOffset,
  findZip64EndOfCentralDirectoryOffset,
  toArrayBuffer,
} from './test-utils';
import {
  createMemoryZipReaderSource,
  openZipReader,
} from './reader/random-access-reader';

const textEncoder = new TextEncoder();

function createArchiveEntries(count: number): Record<string, Uint8Array> {
  const entries: Record<string, Uint8Array> = Object.create(null) as Record<
    string,
    Uint8Array
  >;

  for (let index = 0; index < count; index += 1) {
    entries[`file-${index}.txt`] = new Uint8Array(0);
  }

  return entries;
}

describe('ZIP archive helpers', () => {
  describe('parseZipArchive', () => {
    test('round-trips a classic ZIP archive', () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({ 'notes/entry.json': textEncoder.encode('{"ok":true}') }),
      );

      const archive = parseZipArchive(bytes);

      expect(readZipEntryText(archive, 'notes/entry.json')).toBe('{"ok":true}');
    });

    test('round-trips UTF-8 filenames with emoji and non-BMP code points', () => {
      const unicodePath = 'notes/emoji-😀/music-𠮷-🧪.txt';
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({ [unicodePath]: textEncoder.encode('unicode-ok') }),
      );

      const archive = parseZipArchive(bytes);

      expect(readZipEntryText(archive, unicodePath)).toBe('unicode-ok');
    });

    test('surfaces oversize in-memory ZIP entries with guidance', () => {
      const base = new Uint8Array(
        encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
      );
      const zip64 = addCentralDirectoryZip64Extra(base, {
        compressedSize: 5n,
        uncompressedSize: 0x80000000n,
        localHeaderOffset: 0n,
      });

      expect(() => parseZipArchive(zip64)).toThrow(
        'ZIP entry is too large for the in-memory archive API; use openZipReader instead',
      );
    });

    test('supports helper lookups against ZipReader instances', async () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({
          'nested/manifest.json': textEncoder.encode('{"ok":true}'),
          'nested/assets/avatar.jpg': new Uint8Array([1, 2, 3]),
        }),
      );
      const archive = await openZipReader(createMemoryZipReaderSource(bytes));

      expect(hasZipEntry(archive, 'nested/manifest.json')).toBe(true);
      expect(hasZipEntry(archive, 'manifest.json')).toBe(false);
      expect(findZipEntryPathByBasename(archive, 'avatar.jpg')).toBe(
        'nested/assets/avatar.jpg',
      );
    });

    test('supports reusable basename and directory lookups against ZipReader instances', async () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({
          'backup-2026/gratitudeImages/photo-1.jpg': new Uint8Array([1, 2, 3]),
          'backup-2026/journalRecordingsFolder/memo-1.mp3': new Uint8Array([4, 5, 6]),
        }),
      );
      const archive = await openZipReader(createMemoryZipReaderSource(bytes));
      const lookup = createZipEntryLookup(archive);

      expect(lookup.hasPath('backup-2026/gratitudeImages/photo-1.jpg')).toBe(true);
      expect(lookup.findByDirectoryAndBasename('gratitudeImages', 'photo-1.jpg')).toBe(
        'backup-2026/gratitudeImages/photo-1.jpg',
      );
      expect(lookup.findByBasename('memo-1.mp3')).toBe(
        'backup-2026/journalRecordingsFolder/memo-1.mp3',
      );
    });

    test('supports nested directory paths in reusable directory lookups', async () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({
          'backup-2026/assets/gratitudeImages/photo-1.jpg': new Uint8Array([1, 2, 3]),
          'backup-2026/assets/journalRecordingsFolder/memo-1.mp3': new Uint8Array([4, 5, 6]),
        }),
      );
      const archive = await openZipReader(createMemoryZipReaderSource(bytes));
      const lookup = createZipEntryLookup(archive);

      expect(
        lookup.findByDirectoryAndBasename('assets/gratitudeImages', 'photo-1.jpg'),
      ).toBe('backup-2026/assets/gratitudeImages/photo-1.jpg');
      expect(
        lookup.findByDirectoryAndBasename(
          'backup-2026/assets/journalRecordingsFolder',
          'memo-1.mp3',
        ),
      ).toBe('backup-2026/assets/journalRecordingsFolder/memo-1.mp3');
    });

    test('does not treat the basename as a directory segment match', async () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({
          'backup-2026/misc/gratitudeImages': new Uint8Array([1, 2, 3]),
          'backup-2026/gratitudeImages/gratitudeImages': new Uint8Array([4, 5, 6]),
        }),
      );
      const archive = await openZipReader(createMemoryZipReaderSource(bytes));
      const lookup = createZipEntryLookup(archive);

      expect(
        lookup.findByDirectoryAndBasename('gratitudeImages', 'gratitudeImages'),
      ).toBe('backup-2026/gratitudeImages/gratitudeImages');
    });
  });

  describe('parseZipArchiveBytes', () => {
    test('supports ZIP64 extra fields in central directory entries', () => {
      const base = new Uint8Array(
        encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
      );
      const zip64 = addCentralDirectoryZip64Extra(base, {
        compressedSize: 5n,
        uncompressedSize: 5n,
        localHeaderOffset: 0n,
      });

      const archive = parseZipArchiveBytes(toArrayBuffer(zip64));

      expect(new TextDecoder().decode(archive['sample.txt'])).toBe('hello');
    });

    test('supports ZIP64 EOCD metadata when classic EOCD fields are saturated', () => {
      const base = new Uint8Array(
        encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
      );
      const zip64 = addZip64EndOfCentralDirectory(base);

      const archive = parseZipArchiveBytes(toArrayBuffer(zip64));

      expect(new TextDecoder().decode(archive['sample.txt'])).toBe('hello');
    });

    test('rejects malformed ZIP64 extra fields', () => {
      const base = new Uint8Array(
        encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
      );
      const zip64 = addCentralDirectoryZip64Extra(base, {
        compressedSize: 5n,
        uncompressedSize: 5n,
        localHeaderOffset: 0n,
      });
      const eocdOffset = findEndOfCentralDirectoryOffset(zip64);
      const centralDirectoryOffset = readUint(zip64, eocdOffset + 16);
      const nameLength = readUshort(zip64, centralDirectoryOffset + 28);
      const extraOffset = centralDirectoryOffset + 46 + nameLength;

      writeUshort(zip64, extraOffset + 2, 8);

      expect(() => parseZipArchiveBytes(toArrayBuffer(zip64))).toThrow(
        'Malformed ZIP64 extra field for central directory entry',
      );
    });

    test('rejects stored entries whose advertised sizes do not match', () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
      );
      const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
      const centralDirectoryOffset = readUint(bytes, eocdOffset + 16);

      writeUint(bytes, centralDirectoryOffset + 24, 6);

      expect(() => parseZipArchiveBytes(toArrayBuffer(bytes))).toThrow(
        'Invalid ZIP archive: stored entry has mismatched compressed and uncompressed sizes',
      );
    });

    test('rejects classic EOCD entry count mismatches as corruption', () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
      );
      const eocdOffset = findEndOfCentralDirectoryOffset(bytes);

      writeUshort(bytes, eocdOffset + 8, 0);
      writeUshort(bytes, eocdOffset + 10, 1);

      expect(() => parseZipArchiveBytes(toArrayBuffer(bytes))).toThrow(
        'Invalid ZIP archive: central directory entry counts disagree (0 on-disk vs 1 total)',
      );
    });

    test('accepts an optional central directory digital signature trailer', () => {
      const bytes = addCentralDirectoryDigitalSignature(
        new Uint8Array(
          encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
        ),
        new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      );

      const archive = parseZipArchiveBytes(toArrayBuffer(bytes));

      expect(new TextDecoder().decode(archive['sample.txt'])).toBe('hello');
    });

    test('rejects unknown trailing bytes in the central directory slice', () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({ 'sample.txt': textEncoder.encode('hello') }, true),
      );
      const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
      const trailer = new Uint8Array(6);

      writeUint(trailer, 0, ZIP_CENTRAL_DIRECTORY_DIGITAL_SIGNATURE + 1);
      writeUshort(trailer, 4, 0);

      const malformed = new Uint8Array(bytes.length + trailer.length);
      malformed.set(bytes.subarray(0, eocdOffset), 0);
      malformed.set(trailer, eocdOffset);
      malformed.set(bytes.subarray(eocdOffset), eocdOffset + trailer.length);

      writeUint(
        malformed,
        eocdOffset + trailer.length + 12,
        readUint(bytes, eocdOffset + 12) + trailer.length,
      );

      expect(() => parseZipArchiveBytes(toArrayBuffer(malformed))).toThrow(
        'Invalid ZIP archive: central directory has trailing bytes beyond declared entries',
      );
    });
  });

  describe('encodeZipArchiveBytes', () => {
    // TODO: Add a manual workstation end-to-end check for exact UINT32_MAX entry
    // sizes and offsets. CI cannot cheaply build a multi-GB archive fixture, so we
    // only cover the classic EOCD sentinel boundary here.
    test('emits ZIP64 EOCD metadata when the entry count reaches the classic sentinel', () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes(createArchiveEntries(65535), true),
      );
      const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
      const locatorOffset = eocdOffset - 20;

      expect(readUshort(bytes, eocdOffset + 8)).toBe(0xffff);
      expect(readUshort(bytes, eocdOffset + 10)).toBe(0xffff);
      expect(readUint(bytes, eocdOffset + 12)).toBe(0xffffffff);
      expect(readUint(bytes, locatorOffset)).toBe(
        ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
      );

      const zip64EocdOffset = findZip64EndOfCentralDirectoryOffset(bytes);

      expect(readUint(bytes, zip64EocdOffset)).toBe(
        ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
      );
      expect(readUint64(bytes, zip64EocdOffset + 32)).toBe(65535n);
    });

    test('emits ZIP64 EOCD metadata when the entry count exceeds classic limits', () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes(createArchiveEntries(65536), true),
      );
      const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
      const locatorOffset = eocdOffset - 20;

      expect(readUshort(bytes, eocdOffset + 8)).toBe(0xffff);
      expect(readUshort(bytes, eocdOffset + 10)).toBe(0xffff);
      expect(readUint(bytes, eocdOffset + 12)).toBe(0xffffffff);
      expect(readUint(bytes, locatorOffset)).toBe(
        ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE,
      );

      const zip64EocdOffset = findZip64EndOfCentralDirectoryOffset(bytes);

      expect(readUint(bytes, zip64EocdOffset)).toBe(
        ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
      );
      expect(readUint64(bytes, zip64EocdOffset + 32)).toBe(65536n);
    });

    test('stores already-compressed image formats without deflate', () => {
      const bytes = new Uint8Array(
        encodeZipArchiveBytes({ 'media/photo.heic': new Uint8Array([1, 2, 3, 4]) }),
      );

      expect(parseLocalFileHeader(bytes, 0).compressionMethod).toBe(0);
    });
  });
});
