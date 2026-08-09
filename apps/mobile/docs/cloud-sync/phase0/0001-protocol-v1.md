# ADR 0001: Tackbok cloud-sync protocol v1

- Status: accepted as the Phase-0 candidate; protocol confirmation is blocked by the gate
- Date: 2026-08-08
- Source of authority: `z-backup-final-v6.md`

## Decision

Protocol v1 is a plaintext-at-provider, Google-Drive-only, provider-neutral
vault namespace. Every entity owns an immutable, hash-named, multi-parent
version DAG. Causality comes only from ancestry. Device counters and timestamps
are diagnostic fields and never select a winner.

The vault root is `tackbok-vaults/<vault-id>/`. A version body repeats `vaultId`
and is rejected when it differs from the resolved root. Entity versions live at
`entities/<type>/<entity-id>/<sha256>.json`; whole-file blobs live at
`blobs/<first-2>/<sha256>`; revocations live at
`revocations/<sha256>.json`. The SHA-256 is lowercase hexadecimal over the exact
canonical UTF-8 body, with no BOM or trailing newline.

Only Google Drive is writable in v1. `putImmutable` is idempotent by verified
content, not by physical Drive filename. Same-content physical duplicates are
tolerated; same logical key with different bytes is corruption. There is no
automatic GC. External deletion of an unknown terminal version remains the
accepted v1 blind spot.

## Canonical JSON (`canonical-json-v1`)

The reference encoder is
[`canonicalJsonV1.ts`](../../../src/lib/cloudSync/phase0/canonicalJsonV1.ts).

- Input is the schema-projected value. Unknown fields are rejected by schema
  validation before encoding.
- Object keys are NFC Unicode scalar strings and are ordered by ECMAScript UTF-16
  code units (the RFC 8785 property-order rule). A non-NFC key is rejected.
- String values must contain valid Unicode scalar values and are normalized to NFC.
- Only safe integers are allowed. Floats, non-finite numbers, and negative zero are rejected.
- `null` is encoded only where the schema permits it. Missing optional fields are
  omitted; `undefined`, holes, functions, symbols, class instances, and cycles are rejected.
- JSON escaping is the ECMAScript `JSON.stringify` string escape. Arrays retain
  their supplied order.
- Schema construction sorts set-like arrays before encoding: parent hashes,
  recoveries `(entityType, entityId, versionHash)`, tag IDs, and asset descriptors
  by stable ID. Ordinary arrays are not generically sorted.

Golden canonical strings and hashes are checked in
[`canonical-v1.json`](../../../src/lib/cloudSync/phase0/fixtures/canonical-v1.json).

## Version and conflict contract

- `edit` versions carry full device ID, per-device sequence, and display-only
  timestamp. `resolution`, `recovery-init`, and `join` carry none of those fields.
- System-version parents are the sorted complete head set. A resolution declares
  every recovery dependency, and all blobs, provisional parents, and recovery
  initial versions are published before it.
- A head must have complete, verified ancestry. Missing parents or recovery
  objects remain incomplete and cannot be applied. Cross-vault, cross-entity,
  cyclic, self-referencing, corrupt, or cap-exceeding ancestry is quarantined.
- Dirty state becomes a provisional causal branch before pulled state is applied.
  Apply performs a persistent `local_generation` compare-and-swap for dirty and
  initially clean entities alike.
- If generation N publishes while N+1 exists, N+1 remains dirty and is parented
  on provisional-N, never on the resolution that N+1 did not observe.
- Head sets and maximal common ancestors are ancestry-derived. Multiple or absent
  usable merge bases invoke preservation-first behavior; traversal order never
  chooses a base.
- Identical canonical states join. Candidate groups use their lowest head hash as
  representative. N-head set changes use stable IDs; a removal wins only after
  an observed add with an unambiguous base.
- Concurrent title/content states become deterministic recovered entries. Their
  assets use
  `sha256("tackbok-recovered-asset-v1" + recoveredEntryId + originalAssetId)`
  while retaining the original blob hash.
- Named scalar conflicts choose the lowest-representative-hash primary and retain
  every alternate in `sync_conflicts`. This is intentionally narrower than live-row
  no-loss, but the alternate and retained ancestry remain inspectable.
- A causally later delete wins; a concurrent edit survives. Tag and prompt title
  uniqueness is enforced only for ordinary user creation, permitting recovered
  duplicates. An entry concurrently referencing a tombstoned tag receives a
  deterministic recovered tag when the last live tag state is available.

The synced profile is the singleton entity ID `profile`, containing display name
and optional photo descriptor. Profile email is never serialized.

## Revocation contract

`journal-deleted` and `backup-deleted` are immutable revocation markers, not
entity tombstones. Any valid marker kills the vault before pull or push. Purge
preserves all revocation markers and permanently deletes the rest in resumable
batches. Each device acts once on the strictest marker in the listing it observed:
`journal-deleted` wipes local data; `backup-deleted` keeps it; both disconnect.
The accepted concurrent-marker exception is therefore observation-local, never
global precedence. Late physical residue is best-effort re-swept and can never be
restored by a conforming client.

## Validation caps

Caps are measured after UTF-8 encoding and before persistence. A cap violation
rejects/quarantines the affected object; `entitiesPerPass` alone defers excess
valid work to a later pass.

| Cap | Value |
| --- | ---: |
| Vault JSON | 16 KiB |
| Revocation JSON | 16 KiB |
| Entity-version JSON | 1 MiB |
| Parents per version | 64 |
| Ancestry depth | 4,096 |
| Dependency objects fetched per entity | 10,000 |
| Entities processed per pass | 500 |
| Recovery dependencies per resolution | 64 |
| Total fetched dependency bytes per entity | 64 MiB |
| Entity/device/batch ID | 256 UTF-8 bytes each |
| Entry title | 16 KiB UTF-8 |
| Entry content | 768 KiB UTF-8 |
| Profile display name | 4 KiB UTF-8 |
| Custom prompt text | 64 KiB UTF-8 |
| MIME type | 256 UTF-8 bytes |
| Scalar-alternate snapshot | 64 KiB canonical JSON |
| Tag IDs per entry | 512 |
| Assets per entity | 256 |
| Metadata nesting depth | 16 |
| Single media file | 200 MiB |

The executable constants are
[`validationCaps.ts`](../../../src/lib/cloudSync/phase0/validationCaps.ts), and
the golden catalog contains at-limit and over-limit expectations for every cap.

## Frozen performance targets

- Streaming SHA-256: at least 25 MiB/s on the reference devices, with no whole-file
  JS buffer. A single file is capped at 200 MiB.
- About 200 MiB of unique media transfers no more than 5% metadata overhead. A
  later 1 MiB attachment transfers at most 2 MiB; text-only edits transfer no media.
- Hashing/upload keeps timeline scrolling at least 55 fps and adds no more than
  25 ms p95 save latency.
- At 20,000–50,000 version objects: UI interactive within 5 seconds, full text
  restore within 30 minutes on Wi-Fi, peak JS heap at most 250 MiB, and resume loses
  at most one listing page.

These targets are not loosened by an implementation choice. Failure of the
restore-scale target requires an immutable checkpoint/index extension before
protocol confirmation; it must not introduce a mutable global head.

## Consequences

The format favors recovery and deterministic convergence over remote compactness.
The Phase-2 pure engine must be built test-first against the Phase-0 catalog.
Nothing in this ADR authorizes Phase 1 while the Phase-0 gate remains open.
