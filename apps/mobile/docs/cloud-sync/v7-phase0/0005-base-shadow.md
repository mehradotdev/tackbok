# ADR V7-0005: versioned base shadow

Status: **proposed for the V7-0 owner gate**  
Date: 2026-08-14

## Purpose

The base shadow is the last complete remote state this installation accepted.
It makes a correct three-way merge possible even after Drive cleanup removes
that snapshot object. It is local sync metadata, not a second user backup and
not a raw SQLite copy.

## Format 1

The on-disk file is a deterministic gzip stream containing canonical JSON:

```ts
interface BaseShadowV1 {
  format: 'tackbok-base-shadow';
  shadowFormatVersion: 1;
  protocolFormatVersion: 2;
  vaultId: string;
  snapshotId: string;
  acceptedDeviceHeads: Array<{
    deviceId: string;
    deviceSequence: number;
    snapshotId: string;
  }>;
  payload: JournalSnapshotPayloadV2;
}
```

`snapshotId` must equal the SHA-256 of `payload` canonical bytes. The payload
and accepted-head vector satisfy the same validation, ordering, and cap rules
as a remote snapshot. Credentials, selected account email, provider file IDs,
change cursors, session URIs, local paths, download state, and dirty-generation
state are excluded.

SQLite stores only the commit metadata needed to pair the file atomically:

```ts
interface BaseShadowCheckpointV1 {
  vaultId: string;
  shadowFormatVersion: 1;
  snapshotId: string;
  fileName: string;       // app-private relative basename, not a portable URI
  canonicalSha256: string;
  byteCount: number;
  committedGeneration: number;
}
```

The implementation writes and fsyncs a new temporary file, validates it by
reading it back, atomically renames it, and then commits the checkpoint and
captured dirty-generation settlement in the same SQLite transaction. The old
shadow is retained until that transaction commits and is deleted later by a
best-effort local reaper. A crash therefore yields either the old complete
shadow or the new complete shadow, never mixed metadata.

## Upgrade rule

Base-shadow parsing dispatches on `shadowFormatVersion`, independently of the
remote protocol version.

1. Keep a reader for every shadow version reachable from a supported app
   upgrade.
2. An upgrader is a pure, deterministic, lossless transformation from one
   validated shadow to the next. It never consults current domain state or wall
   clock and never drops unknown/authored values.
3. Write the upgraded shadow with the same atomic sequence. Do not remove the
   old file before the new checkpoint commits.
4. Verify that the embedded protocol payload still hashes to its recorded
   snapshot ID. A shadow-format upgrade does not rewrite protocol payload
   bytes merely for convenience.
5. If no lossless upgrader exists, the bytes are corrupt, or the version is
   newer than the app, quarantine the file and mark the base unavailable.
   Continue with ADR V7-0003 conservative two-way reconciliation. Do not fail
   sync outright and do not silently select either side.
6. After the conservative merge publishes and verifies, its accepted payload
   becomes a fresh current-version shadow. Any recovered conflict remains in
   the portable snapshot until reviewed.

Downgrade behavior is equally conservative: an older app that cannot read a
newer shadow treats it as unavailable. It must still reject a newer remote
protocol with `unsupported-format`; base-shadow fallback is not permission to
misread remote data.

## Size and privacy

The base shadow uses the same 16 MiB compressed / 64 MiB uncompressed caps as a
snapshot. Two shadow files may temporarily coexist during atomic replacement,
so local storage planning reserves at least 128 MiB plus compressed staging.
The file is app-private but not end-to-end encrypted in v2; product disclosure
must not describe it as such.

