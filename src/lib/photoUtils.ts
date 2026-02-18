import { Image } from 'react-native';
import { Paths, File, Directory } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { PHOTO_MAX_DIMENSION, PHOTO_QUALITY, PHOTOS_DIR_NAME } from '~/constants';
import { type Asset, AssetType } from '~/types';
import { generateUUID } from '~/lib/utils';

/** Returns the photos directory (creates it if it doesn't exist). */
function getPhotosDir(): Directory {
  const dir = new Directory(Paths.document, PHOTOS_DIR_NAME);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

// ============================================================================
// Helpers
// ============================================================================

/** Convert a relative asset URI (e.g. `photos/abc.jpg`) to a full file URI. */
export function getFullPhotoUri(relativeUri: string): string {
  const file = new File(Paths.document, relativeUri);
  return file.uri;
}

/** Check whether a photo file exists on disk for the given relative URI. */
export function photoFileExists(relativeUri: string): boolean {
  try {
    const file = new File(Paths.document, relativeUri);
    return file.exists;
  } catch {
    return false;
  }
}

/**
 * Filter an array of assets to only those whose photo files actually exist on disk.
 * Non-IMAGE assets are kept as-is (future-proofing for other asset types).
 * Returns null if the filtered array is empty (matches DB convention).
 */
export function filterExistingPhotos(assets: Asset[] | null): Asset[] {
  if (!assets || assets.length === 0) return [];
  return assets.filter((a) => {
    if (a.type === AssetType.IMAGE) return photoFileExists(a.uri);
    return true;
  });
}

/**
 * Returns a small deterministic rotation angle (in degrees) for a photo URI.
 * Uses a simple hash so the same photo always gets the same tilt.
 * Base range: roughly -3.5° to +3.5° for a subtle scrapbook feel.
 *
 * When `width` and `height` are provided, the rotation is scaled down for
 * portrait / tall photos so that corners (and the remove button) stay visible.
 * Photos at or wider than 4:3 get full rotation; narrower photos get
 * proportionally less (continuous linear scale, no hard breakpoints).
 */
export function getPhotoRotation(uri: string, width?: number, height?: number): number {
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    hash = (hash * 31 + uri.charCodeAt(i)) | 0;
  }

  // Base rotation: roughly -3.5 to +3.5 degrees
  const baseRotation = (hash % 700) / 100;

  // Scale down for tall / narrow photos
  if (width && height && height > 0) {
    const aspectRatio = width / height;
    const referenceRatio = 4 / 3; // baseline where full rotation applies
    const scale = Math.min(aspectRatio / referenceRatio, 1);
    return baseRotation * scale;
  }

  return baseRotation;
}

// ============================================================================
// Pick
// ============================================================================

export type PickPhotosResult =
  | { status: 'success'; uris: string[] }
  | { status: 'denied'; source: 'camera' | 'library' }
  | { status: 'cancelled' };

/**
 * Launch the image picker (camera or library) and return selected URIs.
 * Permissions are requested lazily — only when the user taps the action.
 *
 * Returns a result object with:
 * - `status: 'success'` — user picked photos (may be empty if picker returned nothing)
 * - `status: 'denied'` — permission was denied (caller should guide user to Settings)
 * - `status: 'cancelled'` — user cancelled the picker
 */
export async function pickPhotos(
  source: 'camera' | 'library',
  maxSelections: number,
): Promise<PickPhotosResult> {
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return { status: 'denied', source: 'camera' };

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1, // full quality — we compress ourselves
      exif: false, // strip EXIF metadata (GPS, camera info, etc.) for privacy
    });
    if (result.canceled || !result.assets) return { status: 'cancelled' };
    return { status: 'success', uris: result.assets.map((a) => a.uri) };
  }

  // Library
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return { status: 'denied', source: 'library' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: maxSelections,
    quality: 1,
    exif: false, // strip EXIF metadata for privacy
  });
  if (result.canceled || !result.assets) return { status: 'cancelled' };
  return { status: 'success', uris: result.assets.map((a) => a.uri) };
}

// ============================================================================
// Compress & Save
// ============================================================================

/** Get the dimensions of an image at a given URI. */
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

/**
 * Compress the image at `sourceUri` (resize to fit within PHOTO_MAX_DIMENSION,
 * JPEG at PHOTO_QUALITY), copy it to the app's documents dir, and return an
 * `Asset` object with a *relative* URI suitable for persisting in the DB.
 */
export async function compressAndSavePhoto(sourceUri: string): Promise<Asset> {
  const photosDir = getPhotosDir();

  // 1. Get source dimensions to determine which axis to constrain.
  //    Specifying only ONE dimension in resize preserves aspect ratio;
  //    specifying BOTH would force those exact dimensions and distort.
  const src = await getImageSize(sourceUri);
  const resizeOp =
    src.width >= src.height
      ? { width: Math.min(src.width, PHOTO_MAX_DIMENSION) }
      : { height: Math.min(src.height, PHOTO_MAX_DIMENSION) };

  const context = ImageManipulator.manipulate(sourceUri);
  context.resize(resizeOp);
  const imageRef = await context.renderAsync();
  const saved = await imageRef.saveAsync({
    compress: PHOTO_QUALITY,
    format: SaveFormat.JPEG,
  });

  // 2. Copy to permanent location with a UUID filename
  const filename = `${generateUUID()}.jpg`;
  const srcFile = new File(saved.uri);
  const destFile = new File(photosDir, filename);
  srcFile.copy(destFile);
  try {
    srcFile.delete();
  } catch {
    /* ignore — temp file cleanup is best-effort */
  }

  // 3. Return relative asset with dimensions for aspect-ratio preservation
  return {
    type: AssetType.IMAGE,
    uri: `${PHOTOS_DIR_NAME}/${filename}`,
    width: imageRef.width,
    height: imageRef.height,
  };
}

// ============================================================================
// Delete
// ============================================================================

/**
 * Delete a photo file from the app's document storage.
 * Silently ignores errors (file might already be gone).
 */
export function deletePhotoFile(relativeUri: string) {
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
 * Delete the entire photos directory and all its contents.
 * Used when the user chooses to delete all data.
 * Silently ignores errors (directory might not exist).
 */
export function deleteAllPhotos() {
  try {
    const dir = new Directory(Paths.document, PHOTOS_DIR_NAME);
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // Silently ignore deletion errors
  }
}
