# Phase-2 gate

Date: 2026-08-09

Status: **RE-CLOSED 2026-08-09 after owner-review remediation.**

MB-1 through MB-4 and SF-1 through SF-4 from
[`../review-2026-08-09.md`](../review-2026-08-09.md) were fixed and covered by
targeted regressions. The remaining production-SQLite concerns from SF-5/SF-6
are explicitly deferred to the Phase-4 integration gate below.

## Evidence

Command: `bun run phase2:test`

Recorded result: **9 suites passed, 65 tests passed, 0 failed**.

Review PoC command:
`bun run scripts/cloud-sync-review/review-2026-08-09-poc.ts`

Recorded result: dirty edit preserved, Apply-CAS held, and exactly one stable
recovered tag converged.

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
  outbox intent, and converges on the following passes; an entity with an
  unpublishable asset is deferred as a whole rather than overwritten remotely.
- [x] An entry racing a tombstoned tag deterministically creates and publishes a
  single live recovered tag from stable identities, only after the tombstone is
  complete and subject to the same generation CAS.
- [x] Initial seeding advances a sorted, 50-entity checkpoint only after each
  batch drains; a raced local mutation and an already-published item are not
  lost or needlessly republished.
- [x] The fake provider can return reversed change delivery within a bounded
  page and expose different marker views to concurrent devices.
- [x] Twelve deterministic general-chaos seeds and twelve deterministic
  revocation schedules converge under the exact operations asserted by their
  tests. Both revocation kinds are represented and purge preserves markers.
- [x] The fake-provider contract proves immutable duplicate tolerance, collision
  rejection, bounded pagination, idempotent permanent delete, and resumable purge.
- [x] Every one of the 34 frozen golden-scenario IDs is bound to and executes a
  deterministic runner, including four publish-crash boundaries, profile and
  set conflicts, initial seeding, per-device destructive-marker views, media,
  portable import/export, and validation behavior.
- [x] The frozen ADR-0001 cap table is enforced at parser/engine/provider
  boundaries, oversized or corrupt remote entities are quarantined without
  aborting unrelated work, and the 500-entity pass cap resumes by cursor.

## Scope of this evidence

This is machine-checkable, provider-independent evidence against the in-memory
engine. It does not demonstrate Google OAuth, Google Drive behavior,
physical-device transfer performance, or durable process restart from the
production SQLite model. In particular, persisted edit-sequence allocation,
reconstruction after a real process death, and final provisional/revocation
integration must be tested in Phase 4. These are merge-blocking Phase-4
obligations, not evidence supplied by this gate.
