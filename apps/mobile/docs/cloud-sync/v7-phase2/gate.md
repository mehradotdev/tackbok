# Phase V7-2 gate

Status: **CLOSED at owner re-review 2026-08-15** (see
[`review-2026-08-15.md`](./review-2026-08-15.md)). The bundle was returned at
the 2026-08-15 owner review with blocking finding X1 (a mid-publication local
edit silently dropped merged remote content from the next publication); the
remediation reconciles the published domain with the newest journal
generation after a CAS miss and does not settle the base shadow until an
apply succeeds. Both X1 schedules, the bounded-contention case, and the X2
corruption case were verified at re-review, including against the original
review reproduction probe. X3 (iOS `F_FULLFSYNC`) carries to V7-5. **V7-3 is
authorized.** Protocol v2 remains disconnected from the production runtime,
Google Drive, and user interface until V7-3/V7-4 wire it deliberately.

## Returned-finding remediation

- [x] **X1, live pass:** a remote-derived entry followed by a local edit at
  `after-head-advanced` survives in the journal, the target device's next
  published snapshot, and a fresh-device restore after the source device head
  is removed. The remote entry has no synthetic tombstone.
- [x] **X1, crash/resume:** death at `after-head-advanced`, a local edit while
  the process is down, and resume produce the same three-part result. The
  pending publication remains at `head-advanced` until the reconciled domain
  wins a fresh generation CAS; the base shadow cannot settle first.
- [x] The reconciliation loop is bounded to four fresh captures. Continuous
  concurrent writers return a transient retry while retaining the durable
  pending publication instead of weakening the CAS or advancing the base.
- [x] **X2:** malformed persisted candidate bytes now become a durable
  `invalid-remote-snapshot` Attention pause with the redacted validation class;
  the exception no longer escapes the sync engine.

## Entry obligation and pure-layer regressions

- [x] V7-1 W1 is fixed before the durable publisher consumes merge output.
  ADR [V7-0008](./0008-media-owner-closure.md) records that observational media
  metadata cannot retain an asset whose merged owner is tombstoned; the exact
  delete-versus-media-metadata regression encodes successfully.
- [x] W2 now has an order-free canonical tie-break for equal-sequence
  tombstones, and W3 rejects an empty MIME string. `bun run v7:phase1:test`
  passed 6 suites / 74 tests.
- [x] Frozen V7-0 fixtures remain unchanged. `bun run v7:phase0:test` passed
  1 suite / 24 tests.

## Durable local state and base shadow

- [x] Migration `0007` creates vault/device-scoped sync state, one coalesced
  pending publication, the base-shadow checkpoint, and a shadow reaper. It is
  registered in both Drizzle metadata and `migrations.js`.
- [x] Candidate bytes and device sequence are allocated once in a SQLite
  transaction and reused after restart or an ambiguous provider response.
  Stage advancement is monotonic.
- [x] Settlement pairs the new base checkpoint, captured generation, pending
  deletion, and old-shadow reaper entry in one `BEGIN IMMEDIATE` transaction.
  A later edit remains dirty through generation compare-and-set.
- [x] The base-shadow manager performs bounded decode, complete payload
  validation, temp write/fsync, read-back validation, atomic rename with parent
  directory fsync, and only then SQLite settlement. The fake rejects rename
  before fsync. Android `:app:compileDebugKotlin` and an unsigned iOS simulator
  Debug build both compiled the additive native atomic-file module.
- [x] Corrupt and unupgradeable future shadow formats are quarantined and
  degrade to conservative two-way reconciliation. They do not block sync or
  silently select a side.

## Publisher, crash safety, and provider faults

- [x] `bun run v7:phase2:test` passed 34 Bun/SQLite scenarios / 181 assertions.
  The harness reconstructs the engine after every plan-v7 §8 kill point:
  after local mutation, during media transfer, after candidate persistence,
  after snapshot upload, after verification, after head advance, during remote
  download, during merge application, and during cleanup. It also injects death
  after each ADR V7-0005 base-shadow boundary: temp fsync, read-back validation,
  atomic rename, and SQLite settlement.
- [x] Every restart retains local intent and the previous verified snapshot.
  Lost upload/head responses retry the same immutable candidate and sequence;
  replaying the complete-state apply after a kill cannot duplicate materialized
  entries, relations, media descriptors, tombstones, or conflicts.
- [x] Required media transfers and hash verification precede snapshot upload.
  A missing or unreadable blob durably pauses with the ADR V7-0004 reason and
  cannot publish a dangling snapshot. A resumed persisted candidate rechecks
  and, when possible, re-uploads media that vanished before snapshot upload.
  V7-2 performs no media garbage collection.
- [x] Authorization, quota, permission, rate-limit, and transient fake-provider
  failures map to durable Attention/retry results. Every ADR V7-0004 Attention
  reason has a stable recovery-action ID for V7-4 localization and UI wiring.
- [x] `backup-deleted` and `journal-deleted` markers dominate dirty local
  publication. Neither path republishes into the revoked vault.
- [x] Cleanup keeps the three newest verified snapshots, protects current
  heads, waits the 30-day grace period, and safely retries interruption. With
  multiple logical heads it conservatively skips deletion rather than guessing
  whether a branch is resolved.

## Concurrent schedules and bounded publication

- [x] Simultaneous two-device conflicting edits remain independently
  discoverable and converge with both authored bodies preserved.
- [x] Three simultaneous disjoint writers retain all branches and converge.
  Nine unresolved frontier parents pause as `frontier-too-wide` rather than
  truncating a branch.
- [x] Equal-sequence/different-snapshot physical heads pause durably when both
  candidates validate; the reader never chooses by list order.
- [x] A synthetic 2,000-entry import increments 2,000 local generations but
  produces exactly one compressed snapshot upload and one device-head update,
  not per-entry provider objects.
- [x] The alpha v1 transition marks current local normalized state for one v2
  publication and does not copy v1 protocol state into protocol v2.

## Repository verification

- [x] Full Jest passed 47 suites / 444 tests using
  `bun x jest --runInBand --no-watchman`.
- [x] `bun x tsc --noEmit` passed.
- [x] `bun x drizzle-kit check` passed; migration `0007` metadata and history
  are internally consistent.
- [x] `bun run lint` completed with 0 errors and 18 pre-existing warnings;
  changed files produced no warnings.
- [x] `git diff --check` passed. Scope audit found no diff under frozen
  `src/lib/cloudSync/protocol/`, `src/lib/cloudSync/phase0/`, or
  `src/lib/cloudSync/phase3/`.
- [x] Original owner-reviewed evidence:
  [`evidence/2026-08-14-host-tests.json`](./evidence/2026-08-14-host-tests.json).
  X1/X2 remediation evidence:
  [`evidence/2026-08-15-remediation-host-tests.json`](./evidence/2026-08-15-remediation-host-tests.json).

## Non-claims

- The provider is in-memory. No Google API, real Drive account, OAuth token,
  selected account email, network request, or provider quota was exercised.
- SQLite behavior is exercised through Bun's real SQLite engine using migration
  `0007`; the normalized journal adapter is a synthetic in-memory test double.
  Production domain write-path integration remains V7-4.
- Android and iOS evidence proves native Debug compilation only. It is not
  release-signing, physical-device fsync/power-loss, timing, or memory evidence.
- No production runtime, background task, UI, translations, analytics, website,
  or notification behavior changed.
- Snapshot download caching/change cursors and real request budgets belong to
  the V7-3 Drive adapter. V7-2 does not claim Drive request efficiency.
- No v6 code was deleted or switched off. V7-5 remains the dedicated retirement
  phase.
