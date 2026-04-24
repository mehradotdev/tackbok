import { Image, Platform } from 'react-native';
import { format } from 'date-fns';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MOODS, PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';
import { db, tags } from '~/db';
import { AssetType, type Asset, type Mood } from '~/types';
import { deletePhotoFile, photoFileExists } from '~/lib/photoUtils';
import { deleteVoiceMemoFile, voiceMemoFileExists } from '~/lib/voiceMemoUtils';
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
 * Builds a filesystem-safe timestamp string for exported backup filenames.
 */
export function generateTimestamp(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH-mm-ss");
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
  const extension = match?.[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || fallback;
}

/**
 * Ensures a document subdirectory exists before writing imported or exported assets.
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
 * Saves a generated ZIP backup using Android directory access or the native share sheet.
 */
export async function saveZipFile(zipBytes: Uint8Array, fileName: string): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const directory = await Directory.pickDirectoryAsync();
      const file = directory.createFile(fileName, 'application/zip');
      file.write(zipBytes);
      return;
    } catch (error) {
      throw new Error('Export cancelled or failed', { cause: error });
    }
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  const file = new File(Paths.cache, fileName);
  try {
    file.write(zipBytes);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/zip',
      dialogTitle: 'Export Tackbok Backup',
      UTI: 'public.zip-archive',
    });
  } finally {
    if (file.exists) {
      file.delete();
    }
  }
}

/**
 * Saves or shares a ZIP file that has already been written to disk.
 */
export async function saveGeneratedZipFile(file: File, fileName: string): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const directory = await Directory.pickDirectoryAsync();
      const destination = new File(directory, fileName);
      if (destination.exists) {
        destination.delete();
      }
      file.copy(destination);
      return;
    } catch (error) {
      throw new Error('Export cancelled or failed', { cause: error });
    }
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/zip',
    dialogTitle: 'Export Tackbok Backup',
    UTI: 'public.zip-archive',
  });
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
export async function isZipFile(uri: string): Promise<boolean> {
  const file = new File(uri);
  const bytes = readFilePrefixBytes(file, 4);
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Builds a lookup map from stored tag IDs to tag titles for export serialization.
 */
export async function buildTagIdToNameMap(): Promise<Map<string, string>> {
  const allTags = await db.select().from(tags);
  const map = new Map<string, string>();

  for (const tag of allTags) {
    map.set(tag.tag_id, tag.title);
  }

  return map;
}

/**
 * Resolves a comma-separated tag ID list into tag titles using a prebuilt lookup map.
 */
export function resolveTagIdsToTitles(
  tagIds: string,
  tagMap: Map<string, string>,
): string[] {
  if (!tagIds) return [];

  return tagIds
    .split(',')
    .map((tagId) => tagMap.get(tagId.trim()))
    .filter((title): title is string => !!title);
}

/**
 * Converts a stored relative asset URI into a document file reference when it points to managed media.
 */
export function getRelativeAssetFile(relativeUri: string): File | null {
  try {
    if (
      relativeUri.startsWith(`${PHOTOS_DIR_NAME}/`) ||
      relativeUri.startsWith(`${VOICE_MEMOS_DIR_NAME}/`)
    ) {
      return new File(Paths.document, relativeUri);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Maps a stored asset URI to the archive path used inside Tackbok backup ZIP files.
 */
export function createArchiveAssetPath(type: Asset['type'], relativeUri: string): string {
  const fileName = relativeUri.split('/').pop();
  if (!fileName) {
    throw new Error('Asset URI is invalid');
  }

  const dirName = type === AssetType.IMAGE ? 'photos' : 'voice-memos';
  return `media/${dirName}/${fileName}`;
}

/**
 * Checks whether the underlying file for a stored asset still exists on disk.
 */
export function assetFileExists(asset: Asset): boolean {
  if (asset.type === AssetType.IMAGE) {
    return photoFileExists(asset.uri);
  }

  return voiceMemoFileExists(asset.uri);
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
