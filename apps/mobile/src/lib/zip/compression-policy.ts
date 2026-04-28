const STORED_FILE_EXTENSIONS = new Set([
  'aac',
  'avif',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'm4a',
  'mov',
  'mp3',
  'mp4',
  'ogg',
  'opus',
  'pdf',
  'png',
  'webm',
  'webp',
  'zip',
]);

/**
 * Returns whether an entry should be stored as-is instead of DEFLATE-compressed.
 */
export function shouldStoreWithoutCompression(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return STORED_FILE_EXTENSIONS.has(extension);
}