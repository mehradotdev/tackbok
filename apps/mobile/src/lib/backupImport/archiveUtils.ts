import { Image } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { MOODS, PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';
import { AssetType, type Asset, type Mood } from '~/types';
import { deletePhotoFile } from '~/lib/photoUtils';
import { deleteVoiceMemoFile } from '~/lib/voiceMemoUtils';
import { sanitizePromptTitle } from '~/lib/utils';
import { createExpoZipReaderSource, openZipReader, type ZipReader } from '~/lib/zip';

export const VALID_MOODS = new Set<string>(MOODS);

function readFilePrefixBytes(file: File, length: number): Uint8Array {
  const safeLength = Math.min(length, file.size);
  const handle = file.open();

  try {
    return handle.readBytesSync(safeLength);
  } finally {
    handle.close();
  }
}

/**
 * Trims optional text values and normalizes empty strings to null.
 */
export function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Extracts a sanitized file extension, falling back when the source name has none.
 */
function getSafeExtension(filename: string | null | undefined, fallback: string): string {
  const match = filename?.match(/\.([A-Za-z0-9]+)$/);
  return match?.[1]?.toLowerCase() || fallback;
}

/**
 * Ensures a document subdirectory exists before writing imported assets.
 */
function ensureDirectory(dirName: string): Directory {
  const dir = new Directory(Paths.document, dirName);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/**
 * Rejects archive paths that could escape the expected backup directory structure.
 */
export function assertSafeArchivePath(path: string): string {
  if (!path || path.startsWith('/') || path.includes('..')) {
    throw new Error('Backup archive contains an unsafe file path');
  }
  return path;
}

/**
 * Deletes any imported asset files that were created before an import failed.
 */
export function cleanupImportedFiles(relativeUris: string[]): void {
  for (const relativeUri of relativeUris) {
    if (relativeUri.startsWith(`${PHOTOS_DIR_NAME}/`)) {
      deletePhotoFile(relativeUri);
      continue;
    }

    if (relativeUri.startsWith(`${VOICE_MEMOS_DIR_NAME}/`)) {
      deleteVoiceMemoFile(relativeUri);
    }
  }
}

/**
 * Reads image dimensions so imported image assets can retain width and height metadata.
 */
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

/**
 * Writes an imported photo into the app document directory and returns its asset record.
 */
export async function writeImportedPhoto(
  bytes: Uint8Array,
  archivePath: string,
): Promise<Asset> {
  const dir = ensureDirectory(PHOTOS_DIR_NAME);
  const extension = getSafeExtension(archivePath, 'jpg');
  const filename = `${randomUUID()}.${extension}`;
  const file = new File(dir, filename);
  try {
    file.writeSync(bytes);
  } catch (error) {
    if (file.exists) {
      file.delete();
    }
    throw error;
  }

  let width: number | undefined;
  let height: number | undefined;
  try {
    const size = await getImageSize(file.uri);
    width = size.width;
    height = size.height;
  } catch {
    width = undefined;
    height = undefined;
  }

  return {
    type: AssetType.IMAGE,
    uri: `${PHOTOS_DIR_NAME}/${filename}`,
    width,
    height,
  };
}

/**
 * Writes an imported audio file into the app document directory and returns its asset record.
 */
export function writeImportedAudio(bytes: Uint8Array, archivePath: string): Asset {
  const dir = ensureDirectory(VOICE_MEMOS_DIR_NAME);
  const extension = getSafeExtension(archivePath, 'm4a');
  const filename = `${randomUUID()}.${extension}`;
  const file = new File(dir, filename);
  try {
    file.writeSync(bytes);
  } catch (error) {
    if (file.exists) {
      file.delete();
    }
    throw error;
  }

  return {
    type: AssetType.AUDIO,
    uri: `${VOICE_MEMOS_DIR_NAME}/${filename}`,
  };
}

/**
 * The largest JSON data file (such as `entries.json`) an import reads. It is
 * read, decoded and parsed whole, so a crafted or broken backup with a huge
 * one could run the phone out of memory. A 10,000-entry Tackbok export's
 * `entries.json` is about 9 MB, so 50 MB fits over 50,000 entries, more than
 * a century of daily writing. Both the stored and the unpacked size are
 * capped; a larger file stops the import with `ImportDataTooLargeError`.
 */
export const MAX_IMPORT_JSON_BYTES = 50 * 1000 * 1000;

/** A backup data file over `MAX_IMPORT_JSON_BYTES`, refused before it is read. */
export class ImportDataTooLargeError extends Error {
  constructor(readonly path: string) {
    super(
      `Backup data file is larger than ${MAX_IMPORT_JSON_BYTES / 1000 / 1000} MB: ${path}`,
    );
    this.name = 'ImportDataTooLargeError';
  }
}

/** Whether a ZIP entry's stored or unpacked size is over `limit`. */
function isEntryOver(zip: ZipReader, path: string, limit: number): boolean {
  const info = zip.getEntryInfo(path);
  const cap = BigInt(limit);
  return !!info && (info.uncompressedSize > cap || info.compressedSize > cap);
}

/**
 * Reads JSON from a ZIP entry after verifying the archive path is safe.
 * Throws `ImportDataTooLargeError`, without reading, for an entry over
 * `MAX_IMPORT_JSON_BYTES` (its stored or its unpacked size).
 */
export async function readSafeZipJson<T>(zip: ZipReader, path: string): Promise<T> {
  const safePath = assertSafeArchivePath(path);
  if (isEntryOver(zip, safePath, MAX_IMPORT_JSON_BYTES))
    throw new ImportDataTooLargeError(safePath);
  return zip.readEntryJson<T>(safePath);
}

/**
 * The largest file an import copies, per file (a backup may hold any number).
 * The import reads each file whole into memory and hashes it on the JS
 * thread, so a much larger one can freeze the app or run a phone out of
 * memory. 100 MB is about 3× the largest file the app makes itself: a
 * 30-minute voice note, about 29 MB. A larger file is skipped and reported
 * as not restored; files already in the journal or a cloud backup are not
 * affected (#251). Both the stored and the unpacked size are capped, so a
 * compressed file briefly holds at most about twice this.
 * shortcut: whole-file reads; stream and hash natively to raise or drop the cap.
 */
export const MAX_IMPORT_ASSET_BYTES = 100 * 1000 * 1000;

/** A ZIP entry over `MAX_IMPORT_ASSET_BYTES`, refused before it is read. */
export class ImportAssetTooLargeError extends Error {
  constructor(readonly path: string) {
    super(`File is larger than ${MAX_IMPORT_ASSET_BYTES / 1000 / 1000} MB`);
    this.name = 'ImportAssetTooLargeError';
  }
}

/**
 * Reads raw bytes from a ZIP entry after verifying the archive path is safe.
 * Throws `ImportAssetTooLargeError`, without reading, for an entry over
 * `MAX_IMPORT_ASSET_BYTES` (its stored or its unpacked size).
 */
export async function readSafeZipBytes(
  zip: ZipReader,
  path: string,
): Promise<Uint8Array> {
  const safePath = assertSafeArchivePath(path);
  if (isEntryOver(zip, safePath, MAX_IMPORT_ASSET_BYTES))
    throw new ImportAssetTooLargeError(safePath);
  return zip.readEntryBytes(safePath);
}

/**
 * Loads and parses a ZIP archive from a picked file URI.
 */
export async function loadZipFromUri(uri: string): Promise<ZipReader> {
  return openZipReader(createExpoZipReaderSource(uri));
}

/**
 * Performs a lightweight signature check to determine whether a file looks like a ZIP archive.
 */
export function isZipFile(uri: string): boolean {
  const file = new File(uri);
  const bytes = readFilePrefixBytes(file, 4);
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Determines whether an entry contains enough meaningful content to keep during import.
 */
export function buildSubstantiveCheck(entry: {
  textTitle: string | null;
  textContent: string | null;
  mood: Mood | null;
  assets: Asset[];
}): boolean {
  return (
    !!entry.textTitle || !!entry.textContent || !!entry.mood || entry.assets.length > 0
  );
}

/**
 * Derives a presentable title for Gratitude imports from the prompt or the first note line.
 */
export function deriveGratitudeTitle(
  noteText: string | null,
  prompt: string | null,
): string | null {
  const cleanPrompt = sanitizePromptTitle(prompt ?? '');
  if (cleanPrompt) {
    return cleanPrompt;
  }

  const firstLine = noteText
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ? firstLine.slice(0, 120) : null;
}
