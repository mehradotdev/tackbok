export const SNAPSHOT_CAPS = Object.freeze({
  compressedBytes: 16 * 1024 * 1024,
  uncompressedBytes: 64 * 1024 * 1024,
  jsonDepth: 12,
  jsonNodes: 2_000_000,
  entries: 100_000,
  tags: 10_000,
  entryTags: 500_000,
  prompts: 5_000,
  media: 200_000,
  tombstones: 500_000,
  conflicts: 50_000,
  alternatesPerConflict: 8,
  observedDeviceHeads: 256,
  parentSnapshotIds: 8,
  idBytes: 128,
  entryTitleBytes: 16 * 1024,
  entryBodyBytes: 1024 * 1024,
  authoredTextBytes: 48 * 1024 * 1024,
  shortTitleBytes: 4 * 1024,
  profileNameBytes: 1024,
  mimeTypeBytes: 127,
  mediaByteSize: 8 * 1024 * 1024 * 1024,
  imageDimension: 100_000,
  audioDurationMs: 30 * 24 * 60 * 60 * 1000,
  timestamp: 8_640_000_000_000_000,
});

export class SnapshotValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

export function invalid(code: string, message: string): never {
  throw new SnapshotValidationError(code, message);
}
