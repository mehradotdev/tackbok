import { encode, parse } from './uzipLib';

/**
 * In-memory view of a ZIP archive keyed by archive path.
 */
export interface ZipArchive {
  readonly entries: Readonly<Record<string, Uint8Array>>;
}

/**
 * Minimal builder for assembling ZIP archives from bytes or text.
 */
export interface ZipArchiveBuilder {
  /**
   * Adds a binary file entry exactly as provided.
   * Use this for non-text payloads such as images, audio, or already-encoded data.
   */
  addBytes(path: string, bytes: Uint8Array): void;

  /**
   * Adds a UTF-8 text entry.
   * Use this for JSON, plain text, or any string content that should be encoded for you.
   */
  addText(path: string, text: string): void;

  /**
   * Serializes all accumulated entries into the final ZIP file bytes.
   * Call this once you have finished adding files and need a .zip payload to save or share.
   */
  toBytes(): Uint8Array;
}

const textDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder();
const textEncoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder();

/**
 * Returns the shared decoder or fails fast in runtimes without TextDecoder.
 */
function ensureTextDecoder(): TextDecoder {
  if (!textDecoder) {
    throw new Error('TextDecoder is not available in this runtime');
  }
  return textDecoder;
}

/**
 * Returns the shared encoder or fails fast in runtimes without TextEncoder.
 */
function ensureTextEncoder(): TextEncoder {
  if (!textEncoder) {
    throw new Error('TextEncoder is not available in this runtime');
  }
  return textEncoder;
}

/**
 * Normalizes unknown thrown values into a proper Error instance.
 */
function normalizeZipError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error('Unknown ZIP processing error');
}

/**
 * Extracts the exact byte window used by a Uint8Array as a standalone ArrayBuffer.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/**
 * Copies entry bytes so callers cannot mutate stored archive state by reference.
 */
function cloneBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

/**
 * Parses raw ZIP bytes into an immutable archive-like object of entry buffers.
 */
export function parseZipArchive(bytes: Uint8Array): ZipArchive {
  try {
    const parsed = parse(toArrayBuffer(bytes));
    const entries: Record<string, Uint8Array> = Object.create(null) as Record<
      string,
      Uint8Array
    >;
    for (const [path, value] of Object.entries(parsed)) {
      entries[path] = cloneBytes(value);
    }
    return { entries };
  } catch (error) {
    throw new Error('Invalid or unsupported ZIP archive', {
      cause: normalizeZipError(error),
    });
  }
}

/**
 * Checks whether the archive contains an entry at the exact path.
 */
export function hasZipEntry(archive: ZipArchive, path: string): boolean {
  return Object.prototype.hasOwnProperty.call(archive.entries, path);
}

/**
 * Reads an entry as bytes and returns a defensive copy.
 */
export function readZipEntryBytes(archive: ZipArchive, path: string): Uint8Array {
  const bytes = archive.entries[path];
  if (!bytes) {
    throw new Error(`Backup is missing required file: ${path}`);
  }
  return cloneBytes(bytes);
}

/**
 * Decodes a ZIP entry as UTF-8 text.
 */
export function readZipEntryText(archive: ZipArchive, path: string): string {
  return ensureTextDecoder().decode(readZipEntryBytes(archive, path));
}

/**
 * Reads and parses a JSON entry, surfacing a file-specific error on invalid JSON.
 */
export function readZipEntryJson<T>(archive: ZipArchive, path: string): T {
  const text = readZipEntryText(archive, path);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Backup file is invalid JSON: ${path}`);
  }
}

/**
 * Finds the first archive path whose final path segment matches the given basename.
 */
export function findZipEntryPathByBasename(
  archive: ZipArchive,
  basename: string,
): string | null {
  const safeBasename = basename.trim();
  if (!safeBasename) {
    return null;
  }

  const match = Object.keys(archive.entries).find(
    (path) => path.split('/').pop() === safeBasename,
  );

  return match ?? null;
}

class MemoryZipArchiveBuilder implements ZipArchiveBuilder {
  private readonly entries: Record<string, Uint8Array> = Object.create(null) as Record<
    string,
    Uint8Array
  >;

  addBytes(path: string, bytes: Uint8Array): void {
    this.entries[path] = cloneBytes(bytes);
  }

  addText(path: string, text: string): void {
    this.addBytes(path, ensureTextEncoder().encode(text));
  }

  /**
   * Encodes the accumulated entries into a ZIP byte array.
   */
  toBytes(): Uint8Array {
    try {
      return new Uint8Array(encode(this.entries));
    } catch (error) {
      throw new Error('Failed to generate ZIP archive', {
        cause: normalizeZipError(error),
      });
    }
  }
}

/**
 * Creates an in-memory ZIP builder for export or backup generation.
 */
export function createZipArchiveBuilder(): ZipArchiveBuilder {
  return new MemoryZipArchiveBuilder();
}
