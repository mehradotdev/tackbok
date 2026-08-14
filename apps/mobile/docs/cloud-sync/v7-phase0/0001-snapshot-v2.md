# ADR V7-0001: snapshot protocol v2

Status: **proposed for the V7-0 owner gate**  
Date: 2026-08-14  
Scope: portable metadata snapshots only; media bytes remain separate blobs

This ADR supplies the exact candidate schema and validation limits requested by
plan v7. It is deliberately not a production implementation. The schema and
limits become protocol requirements only when the owner closes plan-v7 §18.5,
§18.6, and §18.10 at the V7-0 gate.

## Decision

Protocol v2 stores a complete logical journal as canonical JSON compressed with
gzip. The logical snapshot ID is the lowercase SHA-256 of the uncompressed
canonical payload bytes. `snapshotId` is outside the hashed payload.

All objects are closed: an unknown key is invalid. All required keys must be
present, including nullable keys. JSON numbers are permitted only where an
`Int` appears below and must be safe, non-negative integers; floating point,
exponents that decode to a non-integer, `-0`, `NaN`, and infinities are invalid.
All strings must be valid Unicode scalar sequences with no unpaired UTF-16
surrogate. Authored text is not Unicode-normalized.

```ts
type Int = number;                 // 0..Number.MAX_SAFE_INTEGER, never -0
type Id = string;                  // opaque stable ID, 1..128 UTF-8 bytes
type Sha256 = string;              // exactly 64 lowercase hexadecimal bytes
type Mood = 'AMAZING' | 'HAPPY' | 'OKAY' | 'SAD' | 'AWFUL';
type EntityType = 'entry' | 'tag' | 'prompt' | 'profile';
type AssetKind = 'photo' | 'voice' | 'profile-photo';

interface JournalSnapshotPayloadV2 {
  format: 'tackbok-snapshot';
  formatVersion: 2;
  vaultId: Id;
  parentSnapshotIds: Sha256[];
  observedDeviceHeads: ObservedDeviceHeadV2[];
  authorDeviceId: Id;
  deviceSequence: Int;
  createdAt: Int; // display/diagnostics only; never merge precedence
  entries: SnapshotEntryV2[];
  tags: SnapshotTagV2[];
  entryTags: SnapshotEntryTagV2[];
  prompts: SnapshotPromptV2[];
  profile: SnapshotProfileV2;
  media: SnapshotMediaV2[];
  tombstones: SnapshotTombstoneV2[];
  conflicts: SnapshotConflictV2[];
}

interface StoredJournalSnapshotV2 {
  snapshotId: Sha256;
  payload: JournalSnapshotPayloadV2;
}

interface ObservedDeviceHeadV2 {
  deviceId: Id;
  deviceSequence: Int;
  snapshotId: Sha256;
}

interface SnapshotEntryV2 {
  entryId: Id;
  title: string | null;
  content: string | null;
  mood: Mood | null;
  createdAt: Int;
  updatedAt: Int; // display only
  conflictOriginId: Id | null;
}

interface SnapshotTagV2 {
  tagId: Id;
  title: string;
  createdAt: Int;
  updatedAt: Int;
  conflictOriginId: Id | null;
}

interface SnapshotEntryTagV2 {
  entryId: Id;
  tagId: Id;
  createdAt: Int;
}

interface SnapshotPromptV2 {
  promptId: Id;
  title: string;
  createdAt: Int;
  updatedAt: Int;
  conflictOriginId: Id | null;
}

interface SnapshotProfileV2 {
  profileId: 'profile';
  displayName: string | null;
  photoAssetId: Id | null;
  updatedAt: Int;
}

interface SnapshotMediaV2 {
  assetId: Id;
  ownerType: 'entry' | 'profile';
  ownerId: Id;
  kind: AssetKind;
  blobHash: Sha256;
  mimeType: string | null;
  byteSize: Int;
  width: Int | null;
  height: Int | null;
  durationMs: Int | null;
  createdAt: Int;
  updatedAt: Int;
}

interface SnapshotTombstoneV2 {
  entityType: EntityType;
  entityId: Id;
  baseStateHash: Sha256 | null;
  deletedStateHash: Sha256 | null;
  deletedByDeviceId: Id;
  deletionSequence: Int;
}

interface SnapshotConflictV2 {
  conflictId: Sha256;
  entityType: EntityType;
  entityId: Id;
  field: 'title' | 'content' | 'mood' | 'displayName' | 'photoAssetId' |
    'tagMembership' | 'assetReference' | 'deleteEdit' | 'referencedDelete';
  baseValueHash: Sha256 | null;
  localValueHash: Sha256 | null;
  remoteValueHash: Sha256 | null;
  primaryValueHash: Sha256 | null;
  alternates: Array<{
    valueHash: Sha256;
    value: string | null;
  }>;
  recoveredEntityIds: Id[];
}

interface DeviceHeadV2 {
  format: 'tackbok-device-head';
  formatVersion: 2;
  vaultId: Id;
  deviceId: Id;
  deviceSequence: Int;
  snapshotId: Sha256;
  updatedAt: Int; // display/cleanup only
}
```

`deletedStateHash` is the hash of the last known canonical entity value at the
deleting device. It lets an offline device distinguish “delete of the base”
from a delete that had already observed an edit. A tombstone with neither a
known `baseStateHash` nor a `deletedStateHash` is valid only for a locally
created-and-deleted record which has never appeared in an accepted base.

## Canonical array order

Writers normalize before encoding; readers reject non-normalized arrays.

| Array | Sort key | Uniqueness |
| --- | --- | --- |
| `parentSnapshotIds` | SHA-256 ascending | snapshot ID |
| `observedDeviceHeads` | `deviceId` | device ID |
| `entries` | `entryId` | entry ID |
| `tags` | `tagId` | tag ID |
| `entryTags` | `(entryId, tagId)` | pair |
| `prompts` | `promptId` | prompt ID |
| `media` | `assetId` | asset ID |
| `tombstones` | `(entityType, entityId)` | pair |
| `conflicts` | `conflictId` | conflict ID |
| conflict `alternates` | `valueHash` | value hash |
| `recoveredEntityIds` | ID ascending | ID |

Comparison is Unicode code-point order. Protocol IDs are restricted to printable
ASCII, so UTF-16, code-point, and UTF-8 ordering coincide for all valid IDs.

## Referential invariants

- Exactly one profile exists and its ID is `profile`.
- An `entryTag` references a live entry and live tag.
- `profile.photoAssetId`, when non-null, references a `profile-photo` asset
  owned by `profile`.
- Every media owner exists and its kind agrees with its owner type.
- No live entity and tombstone share `(entityType, entityId)`.
- `conflictOriginId` is null or references an extant primary entity of the same
  type; cycles and chains longer than one edge are invalid.
- A conflict references an extant entity or its tombstone. Recovered IDs are
  live and have `conflictOriginId` equal to that conflict's primary entity.
- Parent IDs are distinct, differ from the snapshot's computed ID, and number
  at most eight. A parent is causal metadata, not a restore dependency.
- Observed head entries are distinct and cannot claim the author device at a
  sequence greater than the payload's `deviceSequence`.
- `createdAt`, `updatedAt`, and relation timestamps are display/audit metadata,
  never cross-device conflict precedence.

## Candidate validation caps

Validation is performed on compressed bytes, during bounded decompression, on
the parsed tree, and again on references before any domain mutation.

| Limit | Candidate maximum | Rejection point |
| --- | ---: | --- |
| Compressed snapshot | 16 MiB | before/during download |
| Uncompressed canonical payload | 64 MiB | streaming decompressor output |
| JSON nesting depth | 12 | streaming/parser validation |
| Total JSON nodes | 2,000,000 | parser validation |
| Entries | 100,000 | collection validation |
| Tags | 10,000 | collection validation |
| Entry-tag relations | 500,000 | collection validation |
| Prompts | 5,000 | collection validation |
| Media descriptors | 200,000 | collection validation |
| Tombstones | 500,000 | collection validation |
| Conflict records | 50,000 | collection validation |
| Alternates per conflict | 8 | collection validation |
| Observed device heads | 256 | collection validation |
| Parent snapshot IDs | 8 | collection validation |
| Stable ID / device ID / vault ID | 128 UTF-8 bytes, printable ASCII | scalar validation |
| Entry title | 16 KiB UTF-8 | scalar validation |
| Entry body | 1 MiB UTF-8 | scalar validation |
| Total authored text | 48 MiB UTF-8 | aggregate validation |
| Tag/prompt title | 4 KiB UTF-8 | scalar validation |
| Profile display name | 1 KiB UTF-8 | scalar validation |
| MIME type | 127 printable ASCII bytes | scalar validation |
| Media byte size | 8 TiB | scalar validation |
| Image dimension | 100,000 px each | scalar validation |
| Audio duration | 30 days in ms | scalar validation |
| Device sequence | `Number.MAX_SAFE_INTEGER` | scalar validation |
| Timestamp | `8_640_000_000_000_000` ms | scalar validation |

`Total authored text` includes live/recovered entry titles and bodies, tag and
prompt titles, profile display name, and any retained scalar conflict alternate;
it cannot be bypassed by moving text into conflict records.

The 16/64 MiB envelope is intentionally far above the representative 10,000
entry fixture while remaining small enough for a bounded mobile parser. It is a
candidate until the owner reviews the measurements. Media bytes never count
toward it.

## Validation order and mutation boundary

1. Reject a response whose declared or observed compressed length exceeds
   16 MiB.
2. Stream gzip output into a bounded sink and abort at 64 MiB. The absolute
   output limit bounds decompression bombs without rejecting legitimate highly
   repetitive authored text merely because it compresses unusually well.
3. Verify UTF-8 is well formed, parse JSON, and enforce closed shapes, integers,
   string limits, node count, and depth.
4. Normalize and canonicalize the payload; reject if the downloaded
   uncompressed bytes are not already canonical.
5. SHA-256 the canonical bytes and compare with the filename and envelope.
6. Enforce collection, uniqueness, sort-order, and referential invariants.
7. Only then enter the domain transaction.

No validation failure is repaired by dropping fields or records. It becomes an
`Attention needed` state defined in [0004-pause-recovery.md](./0004-pause-recovery.md).

## Consequences

- A new device restores all text from one bounded object.
- Auth tokens, provider state, account email, local paths, and v6 internals are
  structurally absent.
- Strict closed shapes make upgrades explicit rather than silently lossy.
- The high logical limits support long-lived journals, but actual device memory
  and time targets remain subject to V7-5 hardware evidence.
