# Cloud Backup & Sync

Google Drive backup and practical multi-device sync for the journal. No Tackbok
account.

> **Direction change — 2026-08-12:** [`plan-v7.md`](./plan-v7.md) replaces the
> per-entity v6 design with snapshot-based sync. The owner approved the plan
> direction and resolved its §18 decisions on 2026-08-14; schemas, caps, and
> merge rules froze at the closed V7-0 gate. V7-4 now wires snapshot sync for
> new/restored connections while preserving the v6 runtime for existing
> protocol-v1 alpha vaults until the dedicated V7-5 retirement phase.

Read these in this order:

1. [`plan-v7.md`](./plan-v7.md) — approved direction and current phase plan.
2. [`v7-phase0/README.md`](./v7-phase0/README.md) — closed V7-0 design bundle.
3. [`v7-phase1/README.md`](./v7-phase1/README.md) — closed pure codec/merge
   phase and the durable device probe.
4. [`v7-phase2/README.md`](./v7-phase2/README.md) — closed durable-publisher
   phase; returned once for blocking finding X1, remediated and re-reviewed.
5. [`v7-phase3/README.md`](./v7-phase3/README.md) — closed Drive snapshot
   adapter phase with redacted real-service evidence.
6. [`v7-phase4/README.md`](./v7-phase4/README.md) — production runtime/UI
   replacement bundle, host evidence, and open interactive acceptance checks.
7. [`plan-v6.md`](./plan-v6.md) — frozen historical plan explaining retained
   protocol-v1 paths.
8. Phase 0–4 gates/reviews only when maintaining or retiring existing v6 code.

Do not delete the v6 phase folders or review records during design. They are an
audit trail for schema migrations, Google authorization, Drive behavior,
security constraints, physical/simulator evidence, and bugs whose fixes remain
relevant to v7. They may be pruned only in a dedicated post-v7 cleanup after no
production path relies on the old engine.

## Proposed v7 status

| Phase | State |
| --- | --- |
| V7-0 — snapshot ADR, fixtures, measured limits | ✅ closed at owner review 2026-08-14; obligation V1 carries to V7-1 ([gate](./v7-phase0/gate.md), [review](./v7-phase0/review-2026-08-14.md)) |
| V7-1 — snapshot codec + merge engine | ✅ closed at owner review 2026-08-14; obligation W1 carries to V7-2 ([gate](./v7-phase1/gate.md), [review](./v7-phase1/review-2026-08-14.md)) |
| V7-2 — durable publisher vs. fake provider | ✅ closed at owner re-review 2026-08-15 after one X1 return; X3 note carries to V7-5 ([gate](./v7-phase2/gate.md), [review](./v7-phase2/review-2026-08-15.md)) |
| V7-3 — Google Drive snapshot adapter | ✅ closed at owner review 2026-08-15; Y1 carries to V7-4 entry, Y2 noted ([gate](./v7-phase3/gate.md), [review](./v7-phase3/review-2026-08-15.md)) |
| V7-4 — runtime + UI replacement | host claims verified at owner review 2026-08-15; Y1/Y2 discharged; four interactive acceptance checks open ([gate](./v7-phase4/gate.md), [review](./v7-phase4/review-2026-08-15.md)) |
| V7-5 — device hardening + v6 retirement | not started |

## Historical v6 status

| Phase | State |
| --- | --- |
| 0 — format ADR, fixtures, spikes | ✅ conditionally closed ([gate](./phase0/gate.md)) |
| 1 — normalized model + outbox | ✅ closed ([gate](./phase1/gate.md)) |
| 2 — engine vs. the fake provider | ✅ closed ([gate](./phase2/gate.md)) |
| 3 — Google Drive adapter | ✅ conditionally closed ([gate](./phase3/gate.md), [waiver](./phase3/waiver.md)) |
| 4a/4a.1 — durable runtime (no UI) | ✅ closed ([gate](./phase4/gate.md), [review](./phase4/review-4a-2026-08-09.md)) |
| 4b — UI + translations | implementation committed in `ae7833c`; final owner re-review was overtaken by the v7 pivot ([gate](./phase4/gate.md), [review](./phase4/review-4a-2026-08-09.md)) |
| 5 — hardening + rollout | superseded before start |
| 6 — background-transfer decision | superseded before start; device questions carry to V7-5 |

## Documentation layout

- [`plan-v7.md`](./plan-v7.md) — approved snapshot-sync direction; V7-0 freezes
  the proposed schema, caps, merge rules, and budgets.
- [`v7-phase0/`](./v7-phase0/README.md) — protocol-v2 ADRs, synthetic frozen
  fixtures, request model, host measurements, and evidence gate.
- [`v7-phase1/`](./v7-phase1/README.md) — pure snapshot codec/merge tests,
  durable cross-runtime canonical reports, and the V7-1 owner gate.
- [`v7-phase2/`](./v7-phase2/README.md) — SQLite publisher checkpoints,
  atomic base shadows, fake-provider crash/concurrency schedules, and gate.
- [`v7-phase3/`](./v7-phase3/README.md) — Drive adapter semantics, durable
  provider cache, request-budget tests, and redacted real-service evidence.
- [`v7-phase4/`](./v7-phase4/README.md) — normalized production adapter,
  protocol-selective runtime, production UI/copy, and gate evidence.
- [`plan-v6.md`](./plan-v6.md) — frozen historical plan for the currently
  implemented per-entity protocol.
- `phase0/` — protocol v1 ADRs (`0001`–`0005`), the spike write-ups, and the
  Phase-0 gate with its owner waiver. `results/` holds the on-device
  diagnostics runs.
- `phase1/`, `phase2/` — gates and evidence for the local model and the engine.
- `phase4/` — the split Phase-4 runtime gate and redacted machine evidence.
- `phase3/` — the Drive adapter. Read [`gate.md`](./phase3/gate.md) for what was
  proven, [`waiver.md`](./phase3/waiver.md) for what was not and what is owed on
  the first physical device, [`probes.md`](./phase3/probes.md) to re-run the
  owner probe suite, `findings/` for the two Android authorization defects, and
  `evidence/` for the redacted probe reports behind every claim.
- [`review-2026-08-09.md`](./review-2026-08-09.md) — historical cross-phase
  review that produced Phase 1/2 remediation. Retained because those fixes
  affect reusable local data and media code.

## Conventions

- **Gates are evidence, not intent.** A ticked box names what was executed and
  where the report is. An unticked box stays unticked until it is, or a recorded
  owner waiver dispositions it.
- **Findings outlive their fix.** `phase3/findings/` explains why the code looks
  the way it does — why `expiresAt` is reported as 0, why a SecureStore
  connection mark exists. Both look removable without the finding that forced
  them.
- **Evidence is redacted at write time**, not by review: no tokens, account
  emails or stable account identifiers, Drive session URIs, file bodies, media
  bytes, or journal data. `assertReportIsRedacted` throws before a report is
  written or logged.

## Retained v6 code map

- `src/lib/cloudSync/protocol/` — **frozen protocol v1 primitives.** Canonical
  JSON encoding and the numeric validation caps. Every vault hash depends on
  them; a change here is a new protocol version, not an edit.
- `src/lib/cloudSync/` — `codec/`, `domain/`, `ancestry/`, `conflicts/`,
  `outbox/`, `engine/`, `storage/`, `providers/`, `auth/`.
- `src/lib/cloudSync/phase0/` and `phase3/` — spike and probe harnesses, plus
  the golden fixtures. Dev-only; reachable through the `__DEV__`-gated
  `dev-diagnostics` and `dev-cloud-probes` routes. Kept because the Phase-3
  waiver commits to re-running them on the first physical device.

## Historical retained implementation: how v6 works in the app

> The following explains the protocol-v1 path retained for already-configured
> alpha vaults. New/restored connections use v7 snapshot sync after V7-4. See
> [`plan-v7.md`](./plan-v7.md) and [`v7-phase4/gate.md`](./v7-phase4/gate.md).

This section describes the current implementation in plain language. The short
version is: every committed journal change is first made durable on the device,
then Tackbok synchronizes it with Google Drive when a trigger runs and the
device is online.

### Example: saving one new entry

1. When the entry save commits, the entry and a small sync instruction are
   written to SQLite in the same transaction. This instruction is the durable
   **outbox** row.
2. The UI can immediately say **Safely queued**. This means the change will
   survive closing or crashing the app. It does **not** yet mean Google Drive
   has received it.
3. Tackbok waits **30 seconds after the most recent committed change** before
   starting the normal foreground sync. Another save during that interval
   resets the timer, so a burst of edits is normally handled together.
4. When the pass runs, Tackbok checks the remote vault and downloads remote
   changes **before** it uploads the local entry. It then resolves both sides,
   uploads the required immutable files, verifies the result, and saves its
   checkpoint.
5. The outbox row is removed only if the exact saved generation was published.
   If the entry was edited again while the first version was uploading, the
   newer generation remains queued for a follow-up pass; sync completion cannot
   erase or overwrite the newer edit.

Pressing **Sync now** skips the 30-second wait and starts a pass immediately.
If the device is offline, authorization needs attention, Drive is rate-limited,
or another recoverable error occurs, the outbox row remains on the device and
the UI continues to report it as queued.

### What causes Tackbok to check Google Drive?

Tackbok is event-driven; it does not continuously poll Drive while the app is
open.

| Trigger | Current behavior |
| --- | --- |
| Cloud sync starts after app launch | Runs an initial pass as soon as migrations and the normalized model are ready. |
| A journal change commits | Runs 30 seconds after the latest committed change. |
| The app becomes active again | Schedules a pass after 30 seconds. |
| Internet connectivity returns | Schedules a pass after 30 seconds. |
| The app moves to the background | Attempts one immediate, bounded best-effort pass. |
| The user presses **Sync now** | Runs immediately if the runtime is ready and the device is online. |
| OS background task | Registered with a 15-minute minimum interval, but Android/iOS choose the actual execution time. It is not a guaranteed 15-minute heartbeat. |

The OS may delay or skip background work because of force-stop, battery saver,
Doze, Low Power Mode, network conditions, or other scheduling policy. A queued
change is therefore never dependent on a background task: it remains durable
and is retried when a later trigger runs, including the next app launch. Phase
6 still has to measure real minimized/background behavior on physical devices.

Changes made by another device are discovered on these same sync passes. “Up
to date” means this device completed its latest pass successfully; it cannot
promise that another device did not make a change a moment later.

### What is a batch or sync pass?

A **sync pass** is one bounded unit of work. Bounding the work prevents a large
vault from monopolizing memory or keeping a background task alive indefinitely.
Each pass follows this order:

1. **Checking:** refresh authorization, check whether the vault was revoked,
   and pull/validate remote changes.
2. **Preparing:** turn queued local states into immutable versions and resolve
   any local/remote branches.
3. **Uploading:** upload media dependencies first, then entity versions and
   resolution files.
4. **Finishing:** apply safe remote results locally, settle only the generations
   that were actually published, and persist the restart checkpoint.

The four steps shown in the UI describe the **current pass**, not an invented
percentage of the whole backup. A pass can discover more remote work, so a
large restore or initial backup may run several 1-to-4 sequences. The remaining
queue count is a useful indicator of local work still waiting to upload; a
restore can also have remote work remaining when that local count is zero.

Current important bounds are:

- an ordinary pass resolves at most **500 distinct entities** (entries, tags,
  prompts, or the profile);
- initial-vault seeding introduces local data in **50-entity batches** through
  the ordinary outbox rather than a separate bulk-upload path;
- the Drive adapter lists up to **100 files per page** and allows at most
  **4 concurrent authenticated downloads**;
- large uploads are resumable in **256 KiB chunks**.

The checkpoints, staged pages, outbox, and upload-session state are persisted.
If the process dies halfway through a pass, the next engine instance resumes or
safely repeats the work. Immutable, hash-addressed files make repetition
idempotent. A batch ID is diagnostic grouping only; it does not make Google
Drive publication one atomic remote transaction.

### Other behavior worth knowing

- **Pull before push:** every conforming pass checks revocation and remote
  changes before publishing local work. This prevents a long-offline device
  from blindly overwriting newer data or resurrecting a deleted vault.
- **Editing stays available:** one sync pass runs at a time, but it does not
  lock the journal UI. Generation counters and compare-and-set checks protect
  edits made while syncing.
- **Conflicts preserve data:** independent edits are merged deterministically.
  When journal text cannot be merged safely, Tackbok keeps a deterministic
  primary and creates recovered copies instead of silently discarding text.
- **Wi-Fi only for media:** this preference is **off by default**. When enabled,
  text-only entities may still sync over mobile data. An entry containing new,
  not-yet-uploaded media waits as one complete unit so Tackbok never publishes
  an entry version that points to a missing photo or voice memo. See the
  detailed explanation below.
- **Pause sync:** pausing stops network synchronization but keeps new outbox
  work safely queued on the device.
- **Retries:** an individual Drive request gets up to three attempts for
  transient/rate-limit failures, using bounded backoff and `Retry-After` when
  Drive supplies it. Failure does not clear queued intent.
- **Storage and privacy:** vault data lives in Google Drive's app-data area.
  Protocol v1 is encrypted in transit and by Google Drive, but is not
  end-to-end encrypted by Tackbok. OAuth tokens stay in SecureStore and are
  never written to SQLite, the vault, logs, diagnostics, or analytics.
- **No notification dependency:** cloud sync never requests notification
  permission. Background scheduling and queued-data safety do not depend on
  notifications.
- **Destructive actions are different:** deleting an ordinary entry creates a
  mergeable tombstone. **Delete cloud backup** and **Delete journal everywhere**
  instead publish a vault revocation marker and perform a resumable purge so an
  offline stale device cannot later rejoin and resurrect that vault.

### What does “Wi-Fi only for media” do to an entry with attachments?

Suppose a new entry contains text, one photo, and one voice memo while the
device is using mobile data:

1. Saving still commits the complete entry and its outbox instruction locally,
   so the UI reports it as safely queued.
2. Tackbok may sync other text-only entries over mobile data, but it does **not**
   upload the new photo or voice memo.
3. Tackbok also does **not** upload that entry as a temporary text-only version.
   The entry version references its attachments by content hash, and publishing
   it before those blobs exist in Drive would create a broken backup. The whole
   entry version therefore remains queued.
4. When Wi-Fi becomes available, Tackbok hashes/registers the media, uploads the
   photo and voice-memo blobs first, verifies them, and only then publishes the
   entry version that refers to them.

If the attachment bytes were already uploaded previously—for example, the user
only edited the text of an existing entry—Tackbok verifies that those blobs are
already in Drive and can publish the updated entry without uploading the same
media again. Media is content-addressed, so identical stored bytes are reused.

The practical answer is: **new media waits for Wi-Fi, and an entry that depends
on that new media waits with it. Nothing is deliberately backed up with missing
attachments.** The original local files are retained while the work is queued,
including across process death or app restarts.

### What is a tombstone?

A **tombstone** is a small synchronized version whose meaning is “this entity
was deleted.” It preserves the deletion as part of the entity's version history
instead of merely removing the local database row and leaving other devices
unable to tell whether the item was deleted or simply never downloaded.

For example, when an ordinary journal entry is deleted:

1. the visible entry is removed from this device;
2. Tackbok queues a tombstone for that entry's stable ID;
3. the next successful pass publishes the tombstone with links to the versions
   it supersedes; and
4. other devices pull it and remove the same entry from their visible journal.

A tombstone is not a visible empty entry, a recycle-bin item, or an immediate
physical erasure of every historical Drive object. It is a mergeable fact in
the sync graph. That distinction matters if one offline device edits an entry
while another device deletes it: a deletion that definitely came after the
edit can win, while a genuinely concurrent edit is preserved according to the
conflict rules rather than being silently destroyed.

Tombstones are only for ordinary entities such as entries, tags, and prompts.
**Delete cloud backup** and **Delete journal everywhere** have vault-wide
meaning, so they use a stronger revocation marker and resumable physical purge
instead of hundreds or thousands of individual tombstones.

Implementation entry points for this behavior are `runtime/SyncRuntime.ts`
(triggers and debounce), `runtime/backgroundTask.ts` (OS task registration),
`runtime/production.ts` (production pass wiring), `engine/inMemoryEngine.ts`
(the deterministic pass), and `protocol/validationCaps.ts` (frozen v1 bounds).
