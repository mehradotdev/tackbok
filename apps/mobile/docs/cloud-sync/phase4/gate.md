# Phase-4a gate — runtime only

Date: 2026-08-09

Status: **READY FOR OWNER REVIEW — Phase 4b has not started.**

Phase 4 was split for reviewability. This gate covers only the durable SQLite
engine and runtime wiring requested for **4a**. It adds no screens, settings UI,
translations, or website/policy changes.

## Evidence

Machine-readable evidence:
[`evidence/2026-08-09-machine.json`](./evidence/2026-08-09-machine.json).

Cross-phase regression: full Jest **39 suites / 335 tests**, Phase 1 **4/4**,
Phase 3 **10/10**, TypeScript clean, ESLint **0 errors** (19 unchanged warnings).

- [x] **The full frozen Phase-2 catalog passes through the SQLite engine.**
  `bun run phase4:test` ran the exact 34 executable runners sourced from the
  frozen `golden-v1.json` catalog with `SQLiteSyncEngine` as their device
  factory. It also re-ran the original Phase-2 suite: **9 suites / 73 tests**.
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
- [x] **The general-chaos and revocation schedules pass with restart after every
  pass.** Seeds 1–12 ran with three SQLite-backed devices, duplicate writes,
  convergence, stale writers, and both revocation kinds.
- [x] **Initial seeding is checkpointed and restartable.** The 80-entity gate
  restarted between batches and included an edit to `e-075` before the cursor
  reached it. The authored value survived, the queue drained, and the final
  checkpoint was `entry:e-079`.
- [x] **Sync cannot start before the normalized model is ready.** The runtime
  gate held engine construction at zero after a failed backfill, then exercised
  the scheduled in-session retry; only after readiness became true was the
  engine constructed and its first pass run.
- [x] **A background pass is bounded and returns.** The periodic/background
  path invokes exactly one engine pass. Remaining cursor/outbox work is durable
  for a later invocation. `expo-background-task` is registered at module scope
  through `expo-task-manager` with the platform minimum interval.
- [x] **Cloud sync requests no notification permission.** The gate scanned the
  runtime modules and `_layout.tsx` and found neither `expo-notifications` nor a
  permission-request call. Reminder notification behavior remains separate and
  untouched.
- [x] **Analytics is allowlisted and content-free.** Connected, started,
  succeeded, failed, and conflict-recovered events carry only provider,
  trigger, entity type, normalized category, and coarse count/duration buckets.
  No token, account label, ID, hash, filename, URI, or journal field is accepted.

## Implementation notes

- Migration `0005_normal_mauler.sql` adds the atomic
  `sync_engine_checkpoints` restart row. Structured versions, heads, conflicts,
  provider state, and outbox settlement continue to be mirrored into their
  Phase-1 tables; domain materialization is transactionally CAS-aware.
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
- **Stop here for review. Do not begin Phase 4b until this gate is accepted.**
