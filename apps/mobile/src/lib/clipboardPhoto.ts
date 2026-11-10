import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import type { PickPhotosResult } from '~/lib/photoUtils';

// Clipboard images are requested as PNG so transparency survives until
// compressAndSavePhoto places them on white.
export const CLIPBOARD_IMAGE_OPTIONS = { format: 'png' } as const;

export type PasteImageResult = 'added' | 'no-image' | 'invalid-image';

const IMAGE_DATA_URI_HEADER = /^data:image\/([a-z0-9.+-]+);base64$/i;

/**
 * Splits a base64 `data:image/*` URI into a safe file extension and its
 * payload. Returns null for anything else (text, links, other MIME types).
 */
export function parseImageDataUri(
  data: unknown,
): { extension: string; base64: string } | null {
  if (typeof data !== 'string') return null;
  const comma = data.indexOf(',');
  if (comma <= 0) return null;
  const header = IMAGE_DATA_URI_HEADER.exec(data.slice(0, comma));
  const base64 = data.slice(comma + 1).trim();
  if (!header || base64.length === 0) return null;
  const extension = header[1].toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  return { extension, base64 };
}

/**
 * Reads the clipboard image. Call only after the user taps paste; the type
 * check for enabling the control is `Clipboard.hasImageAsync()`.
 */
export async function readClipboardImageDataUri(): Promise<string | null> {
  const image = await Clipboard.getImageAsync(CLIPBOARD_IMAGE_OPTIONS);
  return image?.data ?? null;
}

/**
 * Writes an image data URI to a temporary cache file, hands it to the regular
 * photo path, and deletes the temporary file afterwards, whatever the outcome.
 * `compressAndSavePhoto` remains the final check that the bytes decode.
 */
export async function addImageFromDataUri(
  data: string | null,
  addPhotos: (result: PickPhotosResult) => void | Promise<void>,
): Promise<PasteImageResult> {
  if (data === null) return 'no-image';
  const parsed = parseImageDataUri(data);
  if (!parsed) return 'invalid-image';

  const tmpFile = new File(Paths.cache, `clipboard-${randomUUID()}.${parsed.extension}`);
  try {
    try {
      await tmpFile.write(parsed.base64, { encoding: 'base64' });
    } catch {
      return 'invalid-image';
    }
    await addPhotos({ status: 'success', uris: [tmpFile.uri] });
    return 'added';
  } finally {
    try {
      if (tmpFile.exists) tmpFile.delete();
    } catch {
      /* ignore — temp file cleanup is best-effort */
    }
  }
}
