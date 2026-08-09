# Phase-1 gate

Date: 2026-08-09

Status: **REOPENED 2026-08-09 by owner review — release-blocking defects found.**
See [`../review-2026-08-09.md`](../review-2026-08-09.md): H1 (profile loss on
kill during first-launch backfill), H2 (own-backup restore crash), H3 (no
retained-media ledger consumer — universal media leak), H4/H5 (import
identity/tag-association failures), M1–M5. The checked evidence below remains
accurate for what the harness tests; the harness did not cover these paths.

## Evidence

Command: `bun run phase1:test`

Recorded result: **2 tests passed, 0 failed, 18 assertions**.

- [x] The schema-only Drizzle migration applies through migration `0004` with
  foreign keys enabled.
- [x] A repository mutation commits the legacy/domain row, normalized tag and
  media rows, generation advance, and coalesced outbox intent atomically.
- [x] Replacing media creates retained-media and outstanding-obligation rows in
  the same transaction.
- [x] A forced rollback leaves neither the domain mutation nor its outbox intent.
- [x] A one-row backfill batch can stop and resume from its persisted checkpoint.
- [x] Stable recovered asset IDs remain identical across restart and a second
  completed reconciliation pass.
- [x] Concurrent entry edit, entry deletion, tag-membership removal, asset
  replacement, and profile change win over stale backfill input and remain
  consistent after restart.
- [x] All currently identified application mutation paths route through the
  transaction-scoped repositories; profile data is sourced from SQLite, and
  media removal routes through the retained-media ledger.
- [x] Portable ZIP round-trip tests preserve entry, tag, prompt, asset, and
  profile identities while retaining the version-1 envelope.

## Scope of this evidence

The gate harness is a deterministic in-memory SQLite kill/restart and rollback
simulation. It verifies the relevant transaction boundaries and checkpoint
invariants; it does not claim that an operating system process was physically
killed at every machine instruction. Phase 1 performs no network or Google
account operation.
