import { Paths, File, Directory } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { VOICE_MEMOS_DIR_NAME } from '~/constants';
import { type Asset, AssetType } from '~/types';

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

/**
 * Validates that a relative URI belongs to the voice-memo directory and
 * contains no path-traversal segments. Throws if the URI is suspicious.
 */
function assertVoiceMemoRelativeUri(relativeUri: string): string {
  if (
    relativeUri.startsWith('/') ||
    relativeUri.includes('..') ||
    !relativeUri.startsWith(`${VOICE_MEMOS_DIR_NAME}/`)
  ) {
    throw new Error('Invalid voice memo URI');
  }
  return relativeUri;
}

function getVoiceMemoExtension(path: string | null | undefined, fallback = 'm4a'): string {
  const match = path?.match(/\.([A-Za-z0-9]+)(?:$|\?)/);
  const extension = match?.[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || fallback;
}

/** Convert a relative asset URI (e.g. `voice_memos/abc.m4a`) to a full file URI. */
export function getFullVoiceMemoUri(relativeUri: string): string {
  const file = new File(Paths.document, assertVoiceMemoRelativeUri(relativeUri));
  return file.uri;
}

/** Check whether a voice memo file exists on disk for the given relative URI. */
export function voiceMemoFileExists(relativeUri: string): boolean {
  try {
    const file = new File(Paths.document, assertVoiceMemoRelativeUri(relativeUri));
    return file.exists;
  } catch {
    return false;
  }
}

/**
 * Filter an array of assets to only AUDIO assets whose files actually exist on disk.
 * Non-AUDIO assets (e.g. IMAGE) are excluded.
 * Returns an empty array if no voice memos remain after filtering.
 */
export function filterExistingVoiceMemos(assets: Asset[] | null): Asset[] {
  if (!assets || assets.length === 0) return [];
  return assets.filter((a) => a.type === AssetType.AUDIO && voiceMemoFileExists(a.uri));
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

  const filename = `${randomUUID()}.${getVoiceMemoExtension(sourceUri)}`;
  const srcFile = new File(sourceUri);
  const destFile = new File(voiceMemosDir, filename);
  await srcFile.copy(destFile);
  // Best-effort cleanup: once persisted, remove the temp recording.
  // This prevents temp storage bloat and avoids races with UI dismissal.
  try {
    if (srcFile.exists) {
      srcFile.delete();
    }
  } catch {
    // Ignore — temp cleanup is best-effort
  }

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
    const file = new File(Paths.document, assertVoiceMemoRelativeUri(relativeUri));
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Silently ignore deletion errors (includes invalid URI guard throws)
  }
}

/**
 * Delete the entire voice memos directory and all its contents.
 * Used when the user chooses to delete all data.
 * Throws if the directory cannot be deleted so the caller can abort and
 * surface the failure instead of silently reporting success.
 */
export function deleteAllVoiceMemos() {
  const dir = new Directory(Paths.document, VOICE_MEMOS_DIR_NAME);
  if (dir.exists) {
    try {
      dir.delete();
    } catch (cause) {
      throw new Error(
        `Failed to delete voice memos directory "${VOICE_MEMOS_DIR_NAME}": ${cause}`,
        { cause },
      );
    }
  }
}
