import { format } from 'date-fns';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';
import { db, tags } from '~/db';
import { AssetType, type Asset } from '~/types';
import { photoFileExists } from '~/lib/photoUtils';
import { voiceMemoFileExists } from '~/lib/voiceMemoUtils';

const ZIP_MIME_TYPE = 'application/zip';
const ZIP_DIALOG_TITLE = 'Export Tackbok Backup';
const ZIP_UTI = 'public.zip-archive';
const BACKUP_EXPORT_FILE_PREFIX = 'TackbokBackup_';
const BACKUP_EXPORT_FILE_SUFFIX = '.zip';
const STALE_SHARED_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type GeneratedZipCleanupStrategy = 'delete-immediately' | 'defer-cleanup';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error) {
    return error;
  }

  return 'Unknown export error';
}

function createExportError(error: unknown): Error {
  return new Error(`Export cancelled or failed: ${getErrorMessage(error)}`, {
    cause: error,
  });
}

/**
 * Builds a filesystem-safe timestamp string for exported backup filenames.
 */
export function generateTimestamp(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH-mm-ss");
}

function isDeferredBackupZipFile(file: File): boolean {
  const fileName = file.uri.split('/').pop() ?? '';
  return (
    fileName.startsWith(BACKUP_EXPORT_FILE_PREFIX) && fileName.endsWith(BACKUP_EXPORT_FILE_SUFFIX)
  );
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
 * Saves a generated ZIP backup using Android directory access or the native share sheet.
 */
export async function saveOrShareZipFile(
  file: File,
  fileName: string,
): Promise<GeneratedZipCleanupStrategy> {
  if (Platform.OS === 'android') {
    try {
      const directory = await Directory.pickDirectoryAsync();
      const existing = new File(directory, fileName);
      if (existing.exists) {
        existing.delete();
      }

      const destination = directory.createFile(fileName, ZIP_MIME_TYPE);
      const bytes = await file.bytes();
      destination.write(bytes);
      // Android writes a user-owned copy before we return, so the temp cache file can go away.
      return 'delete-immediately';
    } catch (error) {
      throw createExportError(error);
    }
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: ZIP_MIME_TYPE,
      dialogTitle: ZIP_DIALOG_TITLE,
      UTI: ZIP_UTI,
    });
    // On iOS the share sheet can dismiss before the destination app finishes copying the file.
    return 'defer-cleanup';
  } catch (error) {
    throw createExportError(error);
  }
}

/**
 * Deletes deferred backup ZIPs from the cache directory once they are no longer needed.
 */
export function cleanupDeferredBackupZipFiles(
  minAgeMs = STALE_SHARED_BACKUP_MAX_AGE_MS,
  now = Date.now(),
): void {
  const cacheDirectory = new Directory(Paths.cache);
  if (!cacheDirectory.exists) {
    return;
  }

  for (const entry of cacheDirectory.list()) {
    if (!(entry instanceof File) || !entry.exists || !isDeferredBackupZipFile(entry)) {
      continue;
    }

    const modifiedAt = entry.modificationTime ?? entry.creationTime ?? 0;
    // Keep recently shared ZIPs around long enough for the OS or target app to finish reading them.
    if (now - modifiedAt < minAgeMs) {
      continue;
    }

    try {
      if (entry.exists) {
        entry.delete();
      }
    } catch (error) {
      console.warn(`Failed to delete deferred backup export: ${entry.uri}`, error);
    }
  }
}
