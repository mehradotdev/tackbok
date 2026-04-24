import { encodeZipArchiveBytes } from '../core';
import { cloneBytes } from '../shared/bytes';
import { normalizeArchiveError } from '../shared/error-utils';
import { ensureTextEncoder } from '../shared/text-codec';

/**
 * In-memory ZIP writer helpers.
 *
 * Use this API for tests and small generated archives where producing one
 * final Uint8Array is acceptable.
 */

/**
 * Minimal in-memory ZIP writer for assembling archives from bytes or text.
 */
export interface MemoryZipWriter {
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

class InMemoryZipWriter implements MemoryZipWriter {
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
      return new Uint8Array(encodeZipArchiveBytes(this.entries));
    } catch (error) {
      throw normalizeArchiveError(error, 'Failed to generate ZIP archive');
    }
  }
}

/**
 * Creates an in-memory ZIP writer for export, fixtures, or tests.
 */
export function createMemoryZipWriter(): MemoryZipWriter {
  return new InMemoryZipWriter();
}
