const PRESERVED_ZIP_ERROR_PREFIXES = [
  'Invalid ZIP archive:',
  'Unsupported ZIP feature:',
  'ZIP entry is too large for the in-memory archive API;',
  'ZIP archive is too large for the in-memory archive API;',
] as const;

/**
 * Normalizes unknown thrown values into a proper Error instance.
 */
export function normalizeZipError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  return new Error('Unknown ZIP processing error');
}

export function shouldPreserveZipErrorMessage(message: string): boolean {
  return PRESERVED_ZIP_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix));
}

/**
 * Preserves actionable ZIP errors while still wrapping unknown failures with a stable message.
 */
export function normalizeArchiveError(error: unknown, fallbackMessage: string): Error {
  const normalized = normalizeZipError(error);
  if (shouldPreserveZipErrorMessage(normalized.message)) {
    return normalized;
  }

  return new Error(fallbackMessage, {
    cause: normalized,
  });
}
