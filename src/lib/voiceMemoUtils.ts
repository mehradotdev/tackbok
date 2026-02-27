import { Paths, File, Directory } from 'expo-file-system';
import { VOICE_MEMOS_DIR_NAME } from '~/constants';
import { type Asset, AssetType } from '~/types';
import { generateUUID } from '~/lib/utils';

// ============================================================================
// Directory Setup
// ============================================================================

/** Returns the voice memos directory (creates it if it doesn't exist). */
function getVoiceMemosDir(): Directory {
  const dir = new Directory(Paths.document, VOICE_MEMOS_DIR_NAME);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

// ============================================================================
// Helpers
// ============================================================================

/** Convert a relative asset URI (e.g. `voice_memos/abc.m4a`) to a full file URI. */
export function getFullVoiceMemoUri(relativeUri: string): string {
  const file = new File(Paths.document, relativeUri);
  return file.uri;
}

/** Check whether a voice memo file exists on disk for the given relative URI. */
export function voiceMemoFileExists(relativeUri: string): boolean {
  try {
    const file = new File(Paths.document, relativeUri);
    return file.exists;
  } catch {
    return false;
  }
}

/**
 * Extract the first AUDIO asset from an entry's assets array.
 * Returns null if no audio asset exists.
 */
// TODO: do we need this?
export function getVoiceMemoAsset(assets: Asset[] | null): Asset | null {
  return assets?.find((a) => a.type === AssetType.AUDIO) ?? null;
}

/**
 * Extract all AUDIO assets from an entry's assets array.
 * Returns an empty array if no audio assets exist.
 */
export function getVoiceMemoAssets(assets: Asset[] | null): Asset[] {
  return assets?.filter((a) => a.type === AssetType.AUDIO) ?? [];
}

// ============================================================================
// Save
// ============================================================================

/**
 * Copy a recording from its temp URI to permanent storage.
 * Returns an `Asset` object with a *relative* URI suitable for persisting in the DB.
 */
export async function saveVoiceMemo(sourceUri: string): Promise<Asset> {
  const voiceMemosDir = getVoiceMemosDir();

  const filename = `${generateUUID()}.m4a`;
  const srcFile = new File(sourceUri);
  const destFile = new File(voiceMemosDir, filename);
  srcFile.copy(destFile);

  return {
    type: AssetType.AUDIO,
    uri: `${VOICE_MEMOS_DIR_NAME}/${filename}`,
  };
}

// ============================================================================
// Delete
// ============================================================================

/**
 * Delete a voice memo file from the app's document storage.
 * Silently ignores errors (file might already be gone).
 */
export function deleteVoiceMemoFile(relativeUri: string) {
  try {
    const file = new File(Paths.document, relativeUri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Silently ignore deletion errors
  }
}

/**
 * Delete the entire voice memos directory and all its contents.
 * Used when the user chooses to delete all data.
 * Silently ignores errors (directory might not exist).
 */
export function deleteAllVoiceMemos() {
  try {
    const dir = new Directory(Paths.document, VOICE_MEMOS_DIR_NAME);
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // Silently ignore deletion errors
  }
}
