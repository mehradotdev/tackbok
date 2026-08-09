/**
 * Numeric validation caps for vault protocol v1, frozen in
 * `docs/cloud-sync/phase0/0001-protocol-v1.md`. They bound what the engine and
 * every provider will accept from a remote vault, so loosening one widens the
 * attack surface and tightening one can reject vaults already in the field.
 * Changes require the same sign-off as any other protocol change.
 *
 * Production code, not phase-0 scaffolding — see `canonicalJsonV1.ts`.
 */
export const PROTOCOL_V1_CAPS = {
  vaultJsonBytes: 16 * 1024,
  revocationJsonBytes: 16 * 1024,
  entityVersionJsonBytes: 1024 * 1024,
  parentCount: 64,
  ancestryDepth: 4096,
  dependencyObjectsPerEntity: 10_000,
  entitiesPerPass: 500,
  recoveryDependencyCount: 64,
  dependencyBytesPerEntity: 64 * 1024 * 1024,
  entityIdUtf8Bytes: 256,
  deviceIdUtf8Bytes: 256,
  batchIdUtf8Bytes: 256,
  titleUtf8Bytes: 16 * 1024,
  entryContentUtf8Bytes: 768 * 1024,
  displayNameUtf8Bytes: 4 * 1024,
  promptTextUtf8Bytes: 64 * 1024,
  mimeTypeUtf8Bytes: 256,
  scalarAlternateJsonBytes: 64 * 1024,
  tagIdsPerEntry: 512,
  assetsPerEntity: 256,
  maximumMediaBytes: 200 * 1024 * 1024,
  maximumMetadataDepth: 16,
} as const;

export type ProtocolV1Cap = keyof typeof PROTOCOL_V1_CAPS;
