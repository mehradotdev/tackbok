import { parseZipArchiveBytes } from '../core';
import { cloneBytes, toArrayBuffer } from '../shared/bytes';
import { normalizeArchiveError } from '../shared/error-utils';
import { ensureTextDecoder } from '../shared/text-codec';
import type { ZipReader } from './random-access-reader';

/**
 * In-memory ZIP reader helpers.
 *
 * Use this API for small archives and tests when ZIP bytes are already loaded
 * into memory. For larger archives, prefer openZipReader.
 */

/**
 * In-memory view of a ZIP archive keyed by archive path.
 */
export interface ZipArchive {
  readonly entries: Readonly<Record<string, Uint8Array>>;
}

type ZipEntryLookupArchive = ZipArchive | ZipReader;

/**
 * Parses raw ZIP bytes into an immutable archive-like object of entry buffers.
 */
export function parseZipArchive(bytes: Uint8Array): ZipArchive {
  // TODO: Benchmark import latency before adding a hybrid read path that keeps
  // smaller archives (roughly 64-128 MB) on the in-memory API and uses
  // openZipReader for larger backups.
  // TODO: Validate entry payloads against their stored CRC32 values during reads;
  // current ZIP parsing catches many structural issues, but does not yet detect
  // every case of silent payload corruption.
  try {
    const parsed = parseZipArchiveBytes(toArrayBuffer(bytes));
    const entries: Record<string, Uint8Array> = Object.create(null) as Record<
      string,
      Uint8Array
    >;
    for (const [path, value] of Object.entries(parsed)) {
      entries[path] = cloneBytes(value);
    }
    return { entries };
  } catch (error) {
    throw normalizeArchiveError(error, 'Invalid ZIP archive');
  }
}

/**
 * Checks whether the archive contains an entry at the exact path.
 */
export function hasZipEntry(archive: ZipEntryLookupArchive, path: string): boolean {
  if ('hasEntry' in archive) {
    return archive.hasEntry(path);
  }

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
  archive: ZipEntryLookupArchive,
  basename: string,
): string | null {
  const safeBasename = basename.trim();
  if (!safeBasename) {
    return null;
  }

  const paths =
    'listEntries' in archive
      ? archive.listEntries().map((entry) => entry.path)
      : Object.keys(archive.entries);
  const match = paths.find((path) => path.split('/').pop() === safeBasename);

  return match ?? null;
}
