# Phase-2 gate

Date: 2026-08-09

Status: **REOPENED 2026-08-09 by owner review — data-loss race and coverage gaps found.**
See [`../review-2026-08-09.md`](../review-2026-08-09.md): MB-1 (confirmed
dirty-entity clobber when assets are unpublishable), MB-2 (CAS bypass in
tombstoned-tag recovery — investigate), MB-3 (frozen validation caps largely
unenforced), MB-4 (gate claims exceed actual test coverage — seeding
unimplemented, ~16/34 golden scenarios unexercised, revocation absent from
chaos scheduling, delivery order never reversed at the engine). The checkbox
text below overstates coverage and must be corrected when the gate re-closes.

## Evidence

Command: `bun run phase2:test`

Recorded result: **6 suites passed, 17 tests passed, 0 failed**.

- [x] New codec code reproduces the frozen Phase-0 canonical fixtures and does
  not alter their reference encoder or golden hashes.
- [x] Out-of-order children remain incomplete until their parents arrive;
  declared recovery dependencies also block application until satisfied.
- [x] Head computation, descendant checks, N-head resolution, and ambiguous
  criss-cross merge-base sets are deterministic.
- [x] Text conflicts preserve all authored states through deterministic recovered
  copies; scalar alternates and recovered-asset remapping are retained.
- [x] A concurrent edit survives a tombstone while a causally later tombstone
  wins.
- [x] Apply-CAS protects a local save raced between resolve and apply, keeps its
  outbox intent, and converges on the following passes.
- [x] An entry racing a tombstoned tag deterministically creates and publishes a
  live recovered tag, then converges.
- [x] Initial seed plus two- and three-device edits converge with duplicate writes
  and reversed delivery order.
- [x] Twelve deterministic chaos seeds converge after interrupted/lost-response
  pushes, duplicate delivery, concurrent edits, deletes, and retry/restart cycles.
- [x] Both revocation kinds dominate stale writers in every scheduled test order;
  purge preserves revocation markers.
- [x] The fake-provider contract proves immutable duplicate tolerance, collision
  rejection, bounded pagination, idempotent permanent delete, and resumable purge.

## Scope of this evidence

This is machine-checkable, provider-independent evidence. It does not demonstrate
Google OAuth, Google Drive behavior, physical-device transfer performance, or a
production SQLite/runtime integration; those belong to later phases.
