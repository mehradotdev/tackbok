# Phase-1 gate

Date: 2026-08-09

Status: **RE-CLOSED 2026-08-09 after owner-review remediation.**

The H1–H5 and M1–M5 findings in
[`../review-2026-08-09.md`](../review-2026-08-09.md) were fixed and covered by
targeted regressions. Phase 1 is ready for its downstream integration work.

## Evidence

Command: `bun run phase1:test`

Recorded result: **4 tests passed, 0 failed, 26 assertions**.

Supporting command: `bun run test:jest -- --runInBand --no-watchman`

Recorded result: **35 suites passed, 276 tests passed, 0 failed**.

- [x] The schema-only Drizzle migration applies through migration `0004` with
  foreign keys enabled.
- [x] A repository mutation commits the legacy/domain row, normalized tag and
  media rows, generation advance, and coalesced outbox intent atomically.
- [x] Replacing media creates retained-media and outstanding-obligation rows in
  the same transaction.
- [x] A forced rollback leaves neither the domain mutation nor its outbox intent.
- [x] A one-row backfill batch can stop and resume from its persisted checkpoint.
- [x] The legacy profile is committed before entry batching, remains in the
  persisted compatibility cache until migration completes, and survives an
  interrupted first-launch backfill.
- [x] Stable recovered asset IDs remain identical across restart and a second
  completed reconciliation pass.
- [x] Concurrent entry edit, entry deletion, tag-membership removal, asset
  replacement, and profile change win over stale backfill input and remain
  consistent after restart.
- [x] All currently identified application mutation paths route through the
  transaction-scoped repositories; profile data is sourced from SQLite, and
  media removal routes through the retained-media ledger.
- [x] Portable ZIP round-trip tests preserve entry, tag, prompt, asset, and
  profile identities while retaining the version-1 envelope; own-backup profile
  photos restore idempotently, primary-key collisions remap safely, mixed
  stable-ID/title tag associations survive, and creation timestamps are kept.
- [x] With no configured vault, the retained-media reaper deletes eligible
  bytes and completes their obligations; with a vault, it leaves them for the
  sync lifecycle.
- [x] Entry deletion removes normalized tag joins even when SQLite foreign-key
  enforcement is disabled, and Delete All clears the normalized profile.
- [x] Backfill row selection and reconciliation occur inside their write
  transactions, and startup runs the checkpointed work in the background.

## Scope of this evidence

The gate harness is a deterministic in-memory SQLite kill/restart and rollback
simulation. It verifies the relevant transaction boundaries and checkpoint
invariants; it does not claim that an operating system process was physically
killed at every machine instruction. Phase 1 performs no network or Google
account operation.
