/**
 * App-facing ZIP facade.
 *
 * Only the scalable, file-backed surface is exported here — this is what real
 * import/export flows should use. The in-memory helpers (parseZipArchive,
 * createMemoryZipWriter, readZipEntry*, createMemoryZipReaderSource) are
 * intentionally not re-exported: they exist for tests, fixtures, and tiny
 * archives, and keeping them off the facade stops app code from growing
 * accidental dependencies on them. Import them from
 * `~/lib/zip/reader/memory-reader` and `~/lib/zip/writer/memory-writer`
 * directly when writing tests.
 */
export {
  openZipReader,
  type ZipEntryInfo,
  type ZipReader,
  type ZipReaderSource,
} from './reader/random-access-reader';

export {
  createZipWriter,
  type ZipChunkSource,
  type ZipOutputSink,
  type ZipWriter,
} from './writer/sequential-writer';

export {
  createExpoZipReaderSource,
  createExpoZipWriter,
  type ExpoZipWriter,
} from './adapters/expo';

export {
  createZipEntryLookup,
  type ZipEntryLookup,
  type ZipEntryLookupSource,
} from './zip-entry-lookup';

// Snapshot transfer encoding uses one bounded RFC 1952 member rather than a
// ZIP archive, while sharing this module's audited DEFLATE and CRC32 core.
export {
  decodeGzipBounded,
  encodeGzip,
  GzipCodecError,
  type GzipCodecErrorCode,
  type GzipDecodeLimits,
  type GzipEncodeOptions,
} from './core/gzip-codec';
