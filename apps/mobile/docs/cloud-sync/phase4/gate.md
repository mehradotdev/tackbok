# Phase-4a gate — runtime only

Date: 2026-08-09

Status: **CLOSED — 4a and 4a.1 accepted at owner re-review 2026-08-10. Phase 4b
may start.**
B1, B2, B3, S1–S5, N1 and N3 from the
[Phase-4a owner review](./review-4a-2026-08-09.md) are closed and independently
re-verified; see the two re-review sections at the end of that document.
**N4 (privacy-screen and website analytics allowlist) remains merge-blocking
before cloud sync is user-reachable.** N2 (peak JS heap) and N5 (synchronous
launch load, measured at 607 ms per 20,000 entities on the host and untested on
device against §13's 5-second interactivity target) are Phase-6
physical-device obligations.

Phase 4 was split for reviewability. This gate covers only the durable SQLite
engine and runtime wiring requested for **4a**. It adds no screens, settings UI,
translations, or website/policy changes.

## Evidence

Machine-readable evidence:
[`evidence/2026-08-09-machine.json`](./evidence/2026-08-09-machine.json).

Cross-phase regression: full Jest **39 suites / 335 tests**, Phase 1 **4/4**,
Phase 3 **10/10**, TypeScript clean, ESLint **0 errors** (19 pre-existing
warnings).

- [x] **The full frozen Phase-2 catalog passes through SQLite reconstruction.**
  `bun run phase4:test` ran the exact 34 executable runners sourced from the
  frozen `golden-v1.json` catalog. Each device interaction opens a new
  `SQLiteSyncEngine` from its structured SQLite rows; every per-device store
  asserted at least one successful restore. Initial seed pages are supplied by
  the test's normalized-source cursor, matching production. The command also
  re-ran the original Phase-2 suite: **9 suites / 73 tests**. The Phase-4 Bun
  gate itself passed **91/91**.
- [x] **Restart injection covers every §5.5 boundary and the revocation marker.**
  The SQLite gate killed and reconstructed the engine after blob, edit,
  recovery-init, resolution, join, and revocation-marker publication. Every
  schedule settled its durable outbox without losing intent.
- [x] **Every bounded §6.6 purge position tested resumes.** A one-object page
  was used and the process was killed after purge batches 1 through 5. A fresh
  engine finished the purge and only `revocations/` markers remained.
- [x] **Queued sync intent and retained media survive a kill.** The gate killed
  after the remote edit write, reconstructed from SQLite, observed the outbox
  still dirty, and verified the independent `sync_retained_media` row and URI
  were unchanged before the retry settled the queue. Production media sources
  are reconstructed from `media_assets`/`sync_retained_media` and streamed in
  1 MiB reads; raw media is not put in the production checkpoint. A focused
  generation test also proves that a stale Phase-1 queue row cannot resurrect
  an edit already settled in the atomic checkpoint, while generation N+1 is
  still adopted after restart.
- [x] **An interrupted normalized-model Apply is replayed.** With production's
  explicit materialization acknowledgement enabled, the gate killed after the
  structured engine Apply but before the normalized/UI transaction. A fresh
  engine returned the same pending entity, materialized it, acknowledged it,
  and a second restart returned no pending Apply.
- [x] **The general-chaos and revocation schedules pass with restart after every
  pass.** Seeds 1–12 ran with three SQLite-backed devices, duplicate writes,
  convergence, stale writers, and both revocation kinds.
- [x] **Initial seeding is SQL-paged, checkpointed, and restartable.**
  Production selects at most 50 normalized identities with an ID cursor and
  materializes only that page. The 80-entity gate reconstructed between passes
  and included an edit to `e-075` before the cursor reached it. The authored
  value survived, the queue drained, and the final checkpoint was
  `entry:e-079`.
- [x] **The pass checkpoint stays bounded as the vault grows.** A real SQLite
  host probe seeded 500 and 2,000 approximately 400-character entries in
  50-row pages, reconstructing after every page. Results:

  | Entities | Saves | Checkpoint JSON written | Largest checkpoint | Wall clock |
  | ---: | ---: | ---: | ---: | ---: |
  | 500 | 570 | 307,745 bytes | 8,730 bytes | 320 ms |
  | 2,000 | 2,280 | 1,231,848 bytes | 8,733 bytes | 2,860 ms |

  Four times the entities produced 4.00× the checkpoint bytes while the
  largest checkpoint remained effectively flat. This specifically guards the
  B1 regression; it is host-machine evidence, not a claim that the §13
  physical-device restore targets have been measured.
- [x] **Sync cannot start before the normalized model is ready.** The runtime
  gate held engine construction at zero after a failed backfill, then exercised
  the scheduled in-session retry; only after readiness became true was the
  engine constructed and its first pass run.
- [x] **A background pass is bounded and returns.** The periodic/background
  path invokes exactly one engine pass. Remaining cursor/outbox work is durable
  for a later invocation. The task definition remains at module scope, but OS
  registration is enabled only while a live vault is configured and an old
  registration is removed for users without one.
- [x] **Committed local writes schedule sync and in-flight triggers are kept.**
  Every routed domain transaction emits a post-commit signal. The foreground
  runtime debounces it for 30 seconds, and a trigger that arrives during a pass
  coalesces into exactly one follow-up pass. A bounded background invocation
  never grows into that loop.
- [x] **Quiet passes do not rewrite or refresh the whole vault.** Structured
  engine persistence writes only dirty entities; Phase-1 queue reconciliation
  queries only keys changed by the pass; normalized materialization receives
  only CAS-approved pending keys. The React Query cache is invalidated only
  when a remotely sourced Apply committed.
- [x] **Cloud sync requests no notification permission.** The gate scanned the
  runtime modules and `_layout.tsx` and found neither `expo-notifications` nor a
  permission-request call. Reminder notification behavior remains separate and
  untouched.
- [x] **Analytics is allowlisted and content-free.** Connected, started,
  succeeded, failed, and conflict-recovered events carry only provider,
  trigger, entity type, normalized category, and coarse count/duration buckets.
  No token, account label, ID, hash, filename, URI, or journal field is accepted.

## Phase-4a.1 evidence — N1 and N3

- [x] **Restore resolution is driven by touched keys, including late
  dependencies.** Pulled keys, provisional captures, CAS retries, degraded
  entities receiving a later valid object, and graphs awakened by a later
  cross-entity recovery are placed in `pendingResolutionKeys`. A reverse
  recovery-dependency index is rebuilt once at process restoration and then
  maintained incrementally. A focused regression reconstructs the SQLite
  engine after receiving an incomplete resolution, delivers its recovery in a
  later pass, and verifies that the dependent graph becomes complete and is
  applied without a full-vault walk.
- [x] **Engine sync work across a restore is no longer quadratic on the host
  probe.** This measures one long-lived engine across bounded passes, which is
  the production shape; it is not an end-to-end restore including per-launch
  reconstruction. The owner-review baseline reported 7,600 ms at 10,000 entities
  and 30,400 ms at 20,000 (4.00×). During 4a.1, the same 10,000/20,000 shape
  also exposed a redundant per-entity `UPDATE sync_versions` whose vault-only
  query plan caused 6,768/26,079 ms (3.85×) even after touched-key resolution.
  The update was removed because each complete dirty-graph delta already
  upserts every version's exact `applied` bit. Final evidence from
  `bun run phase4:test`:

  | Restored entities | Bounded passes | Sync work | Quiet pass |
  | ---: | ---: | ---: | ---: |
  | 10,000 | 20 | 610 ms | < 1 ms |
  | 20,000 | 40 | 1,198 ms | < 1 ms |

  Two times the entities required 1.96× the measured sync work. The probe uses
  a real in-memory SQLite store and the ordinary remote-Apply path. Its
  immutable fake remote objects are exposed through an indexed cursor because
  `FakeCloudProvider` itself performs a full array scan/sort per page. These
  are **host-only** timings, not physical-device or §13 heap evidence.
- [x] **A vault switch cannot restore the prior vault's structured state.**
  Reads from `sync_entity_state`, `sync_change_queue`, and `sync_conflicts` are
  scoped through device/vault-owned engine rows. Because those Phase-1 tables
  predate multi-vault columns, opening a different vault on the same device
  also transactionally tears down the previous engine replica—versions,
  heads, queue, conflicts, checkpoints, metadata, and gate-only blobs—then
  rebuilds from the normalized journal and the selected remote vault. A direct
  same-device/same-entity-ID vault-switch test verifies no old head, queue,
  conflict, version, or checkpoint is restored. Journal rows and retained
  media are outside the teardown.

## Implementation notes

- Migration `0005_normal_mauler.sql` adds the atomic
  `sync_engine_checkpoints` restart row. Migration
  `0006_classy_roxanne_simpson.sql` adds per-entity dependency metadata, dirty
  local-domain rows, and gate-only inline-blob rows. The checkpoint contains
  only bounded pass state; versions, heads, conflicts, outbox intent, and dirty
  local state are restored from structured tables. Domain materialization is
  transactionally CAS-aware.
- Runtime startup occurs from `_layout.tsx` only after the SQL migration and
  settings hydration. With no configured live vault, engine creation is a
  no-op; the runtime never initiates interactive consent by itself. A completed
  remote materialization invalidates the React Query cache only after its
  database transaction and structured engine-state persistence succeed.
- Production restart attachment uses `refreshConnection()`. On Android that
  stays behind `AndroidGoogleAuthorization` and its durable connection mark.
  Disconnect remains `auth.signOut()` through `GoogleDriveProvider`; no global
  OAuth revocation endpoint was added.
- Pending local media is hashed in bounded batches through the Phase-0 native
  `StreamingHashModule`. Uploads use restart-reconstructible file sources and
  the Phase-3 resumable-session ledger. Entry and profile-photo replacement
  preserve superseded local bytes through the retained-media ledger before a
  live media row is deleted or repointed.

## Explicit non-claims / next boundary

- This is machine evidence, not physical-device background/Doze evidence. The
  Phase-3 waiver obligations remain open exactly as recorded.
- No UI, translation, privacy-policy, website, or store-review work was done.
  The six `cloud_sync_*` events therefore ship without the §10 companion
  updates; see N4 in the re-review. Nothing emits until a vault is configured,
  so the privacy screen is not yet inaccurate — but it becomes so the moment
  cloud sync is user-reachable.
- Peak JS heap during restore (§13, ≤ 250 MB) has **not** been measured by
  anyone; the bounded-checkpoint probe above measures serialization volume, not
  residency. See N2.
- Synchronous engine construction at launch was measured by the owner at 607 ms
  per 20,000 entities on a desktop host and scales linearly, implying ~1.5 s at
  50,000 there. It has **not** been measured on a device against §13's "app
  interactive ≤ 5 s during restore". See N5.
