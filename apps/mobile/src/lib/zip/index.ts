export * from './reader';
export * from './writer';
export * from './adapters/expo';

export {
  encodeZipArchiveBytes,
  parseZipArchiveBytes,
  type ParsedLocalFileHeader,
  type ParsedZipDirectory,
  type ParsedZipEntryMeta,
} from './core';

// Keep the app-facing ZIP surface small: callers should prefer this facade
// rather than importing deep internal modules.
