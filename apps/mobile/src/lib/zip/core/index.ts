/**
 * Low-level ZIP codec entry points.
 *
 * This module is intentionally pure and platform-agnostic so it can be
 * extracted into a standalone npm package later.
 */
// Keep the core facade small: re-export the byte-level reader/writer entry
// points while preserving higher-level callers from deep-importing internals.
export { parseZipArchiveBytes } from './archive-bytes-reader';
export { encodeZipArchiveBytes } from './archive-bytes-writer';
export { deflateRaw, inflateRaw } from './deflate-codec';

export * from './byte-io';
export * from './filename-codec';
export * from './zip-constants';
export * from './zip-parser';
export type {
  ParsedLocalFileHeader,
  ParsedZipDirectory,
  ParsedZipEntryMeta,
  ZipEntries,
} from './types';
