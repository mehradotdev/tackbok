# Phase V7-1 gate

Status: **CLOSED at owner review 2026-08-14** — see
[`review-2026-08-14.md`](./review-2026-08-14.md). ADR V7-0007 is affirmed as
a corrective amendment (forensically verified against the committed fixture's
own recorded hash). V7-0 obligations V1/V2 are discharged. One obligation
(W1: merge must not emit a domain its own codec rejects — the
delete-versus-media-metadata-edit case) carries into V7-2 and must be fixed
with a regression test before any V7-2 code consumes merge output.

This gate is not authorization to wire protocol v2 into the production
runtime; that remains V7-4's gate.

## Pure codec and validation

- [x] The portable builder produces canonical payload bytes, a SHA-256 identity
  over those bytes, and deterministic single-member gzip output using the
  approved writer profile.
- [x] The parser enforces, in order: 16 MiB compressed cap; bounded
  decompression with a 64 MiB ceiling enforced inside the raw inflater; exact
  first-member termination; gzip header/trailer integrity; strict UTF-8;
  duplicate-aware JSON parsing; closed shapes, safe integers, depth/node/string
  caps; canonical-byte equality; snapshot-hash equality; then collection,
  aggregate, sort, conflict-ID, and referential invariants.
- [x] Concatenated gzip members, corrupt trailers, malformed UTF-8, duplicate
  decoded keys, unknown fields, non-canonical JSON, wrong hashes, dangling
  references, unordered arrays, oversized compressed input, and a highly
  compressible 64 MiB+1 decompression bomb are rejected by
  `src/lib/cloudSync/v2/codec.test.ts`.
- [x] The decoder has no provider, SQLite, storage, runtime, or mutation import;
  no domain-eligible value is returned before every validation stage passes.

## Merge and media

- [x] All eight frozen base/local/remote cases pass byte-identically against
  their expected domain outputs.
- [x] Idempotence and specified commutativity are exercised for every golden
  case. Conflict branch labels are compared as an unordered pair; selected
  user state, conflict identity/candidates, and recovery identity are stable.
- [x] A deterministic 128-case generated catalog proves that both concurrent
  authored bodies survive and recovered IDs repeat exactly.
- [x] Extra regression coverage exercises delete-versus-unchanged, base-less
  delete-versus-live, relation removal, immutable media mutation, asset and
  derived-ID collision rejection, and profile alternate media protection.
- [x] `calculateMediaReferencesV2` protects entry-owned assets plus the selected
  and alternate profile-photo references.

## Durable cross-runtime evidence (V1/V2)

- [x] The successor probe is permanently reachable through the `__DEV__`
  `dev-diagnostics?suite=v7-canonical` deep link, including before the normal
  bootstrap gate, and remains visible in the dev-diagnostics screen.
- [x] The probe constructs the complete report envelope itself and calls
  `assertV7CanonicalReportIsRedacted` before either filesystem or log output.
- [x] Android emulator API 36 / Hermes reproduced all 8 accepted vectors and
  all 11 required rejections through that durable path:
  [`evidence/2026-08-14-android-api36-canonical.json`](./evidence/2026-08-14-android-api36-canonical.json).
- [x] iOS 26.5 simulator / Hermes reproduced the same durable path:
  [`evidence/2026-08-14-ios26.5-canonical.json`](./evidence/2026-08-14-ios26.5-canonical.json).

These are simulator/emulator determinism results. They make the V7-0 runs
re-runnable but are not physical-device performance, memory, or release-build
evidence.

## Repository verification

- [x] `bun run v7:phase0:test`: 1 suite / 24 tests passed after the recorded
  ADR V7-0007 correction.
- [x] `bun run v7:phase1:test`: snapshot-v2 plus its in-house gzip/DEFLATE
  safety suites passed; exact rerun counts are recorded in the host report.
- [x] Full Jest: 46 suites / 435 tests passed.
- [x] `bun x tsc --noEmit` passed.
- [x] `bun run lint` completed with 0 errors and 18 pre-existing warnings in
  files outside this change; changed files produced no warnings.
- [x] Scope audit found no diff under `src/lib/cloudSync/protocol/`,
  `src/lib/cloudSync/phase0/`, or `src/lib/cloudSync/phase3/`, and no v2 import
  of provider, SQLite, storage, or runtime code. Consolidated host report:
  [`evidence/2026-08-14-host-tests.json`](./evidence/2026-08-14-host-tests.json).

## Non-claims and owner decision

- Protocol v2 is not connected to SQLite, Drive, production sync, or UI.
- No real Drive request, account, token, journal, or media data was used.
- No physical-device timing or memory claim is made.
- ADR V7-0007 restores two Unicode scalars whose approved hash and owner-review
  description were already present but whose committed fixture value was
  truncated. **Owner review 2026-08-14: affirmed.** The amended bytes hash to
  the already-committed `acecb51c…` digest that the V7-0 review verified
  independently before the commit, so this restores signed-off content; it is
  not a precedent for changing fixtures to accommodate code.

## Owner-review findings

- **W1 (carried into V7-2):** a branch deleting an unchanged entry merged
  against a branch editing only that entry's observed media metadata yields a
  domain whose media descriptor references a tombstoned owner; the codec's own
  referential validation rejects it. Fail-closed, reproduced at review. Fix
  plus regression test are the entry condition for any V7-2 consumer of
  `mergeSnapshotDomainsV2` output.
- **W2 (minor, recorded):** equal-sequence tombstone pairs keep the first
  argument's `deletedByDeviceId`, so provenance is argument-order dependent;
  user state and conflict candidates were verified order-free. Optional
  deterministic tie-break.
- **W3 (nit):** `mimeType: ""` bypasses the printable-ASCII check in
  `validation.ts`.

The device reports are emulator/simulator determinism evidence executed by
the implementing agent through the durable probe path; they are now
re-runnable from the repository (deep link in the phase README). Physical
device evidence remains a V7-5 obligation.
