import { Image } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { MOODS, PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';
import { AssetType, type Asset, type Mood } from '~/types';
import { deletePhotoFile } from '~/lib/photoUtils';
import { deleteVoiceMemoFile } from '~/lib/voiceMemoUtils';
import { generateUUID, sanitizePromptTitle } from '~/lib/utils';
import {
  createExpoZipReaderSource,
  openZipReader,
  type ZipReader,
} from '~/lib/zip';

export const VALID_MOODS = new Set<string>(MOODS);

function readFilePrefixBytes(file: File, length: number): Uint8Array {
  const safeLength = Math.min(length, file.size);
  const handle = file.open();

  try {
    return handle.readBytes(safeLength);
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
  const filename = `${generateUUID()}.${extension}`;
  const file = new File(dir, filename);
  try {
    file.write(bytes);
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
  const filename = `${generateUUID()}.${extension}`;
  const file = new File(dir, filename);
  try {
    file.write(bytes);
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
 * Reads JSON from a ZIP entry after verifying the archive path is safe.
 */
export async function readSafeZipJson<T>(
  zip: ZipReader,
  path: string,
): Promise<T> {
  return zip.readEntryJson<T>(assertSafeArchivePath(path));
}

/**
 * Reads raw bytes from a ZIP entry after verifying the archive path is safe.
 */
export async function readSafeZipBytes(
  zip: ZipReader,
  path: string,
): Promise<Uint8Array> {
  return zip.readEntryBytes(assertSafeArchivePath(path));
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
