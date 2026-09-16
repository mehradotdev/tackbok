# Cloud sync audit — 2026-09-16

## Scope and recommendation

This is a focused source and regression-test review of snapshot merging,
validation, planning/publication, Drive transport/discovery, local materialization,
runtime scheduling, and recovery. It is not a live Google Drive end-to-end test
or a measured device performance benchmark. No user backup was reset or edited.

Keep the complete-snapshot design for alpha. It is easier to reason about than
introducing an operation log or CRDT now. Simplify the hot paths and align merge
rules with actual editing behavior before adding providers or protocol features.
Keep theme preferences local unless the product explicitly needs them to roam.

## Fixed in this change

- **Entry date changes blocked sync.** `merge.ts` treated the editable journal
  date (`createdAt`) as immutable. One-sided changes now use the existing
  three-way scalar merge. Concurrent date changes preserve both versions using
  recovered entries; unrelated text edits carry into both versions.
- **Equivalent conflicts could stop convergence.** Two devices can independently
  produce the same conflict ID with reversed local/remote hashes.
  `mergeConflictSet` now accepts that exact reversal and chooses a deterministic
  representation. It still rejects differences in other conflict data.
- **Redundant snapshot downloads during head rechecks.** `sync/engine.ts` now
  reuses decoded, hash-validated snapshots during one planning operation. Head
  listings and envelope checks still run, and the next sync verifies anew.
  A single-remote restore test now downloads its payload once instead of twice.
- **Repeated relation membership scans.** Filtering merged entry/tag relations
  now uses sets instead of scanning the full entity collections per relation.

### Compatibility and recovery

The snapshot validator now accepts `createdAt` conflict records. Older clients
reject these records and also retain the original immutable-date bug. Update
both iOS and Android clients together for alpha testing. Existing snapshots
remain readable by the new client; there is no database migration or vault reset.
Reload the updated app and use **Retry and verify backup** to clear the existing
pause and run the corrected merge.

## Remaining findings, in priority order

### 1. High: concurrent edits to a recovered entry can block sync

`snapshot/merge.ts` creates a new recovery whose `conflictOriginId` points to the
entry being merged. If that entry is already recovered, it creates a chain.
`snapshot/validation.ts` rejects a recovery whose origin is itself recovered.

Reproduced with a valid root + recovered entry, concurrent edits to the recovery,
and `encodeSnapshot(mergeSnapshotDomains(...))`: `invalid-conflict-origin`.
This predates the date fix and also affects text conflicts.

Next change: define one recovery-family model and make generation, conflict
references, deletion/promotion, and validation agree on it. Cover repeat edits
and deleting the original entry. Do not merely remove the validator check.

### 2. High: bulk local applies can exceed SQLite bind limits

`snapshot/storage/productionJournal.ts` inserts entire collections with a single
`.values(...)` call. The codec accepts up to 100,000 entries and 500,000 relations,
while the bundled Expo SQLite source defaults to 32,766 parameters per statement.
An entry insert binds several values per row. The accepted format is therefore
larger than this write path can reliably apply. This is a source-level finding;
the native simulator's exact compiled limit was not queried.

Next change: bounded insert batches inside the existing transaction, with a
large restore test against actual SQLite. The current 2,000-entry engine test
uses an in-memory journal and does not exercise production materialization.

### 3. Medium: every successful apply rewrites the complete local journal

`ProductionSnapshotJournalStore.applyMergedIfGeneration` deletes and reinserts
entries, tags, relations, prompts, profile, media, tombstones, and conflicts.
It also scans all relations for every entry when rebuilding legacy tag strings.

Next change: index relations by entry once, add bounded writes, then measure
transaction time on realistic journals. Consider diffed writes only if measured
cost warrants the extra logic. Keep generation checks and atomic transactions.

### 4. Medium: multi-device history has no effective snapshot retention

`snapshot/sync/cleanup.ts` returns without deleting old snapshots whenever there
is more than one logical device. Even two fully converged devices retain all
historical complete snapshots. New snapshots can accumulate during ordinary use.

Next change: design retention around proven covered heads and a grace period,
with offline-device, pending-publication, and restore tests. Do not just remove
the multi-device guard: its purpose is to protect unresolved branches.

### 5. Medium: repeated whole-file verification increases sync cost

`snapshot/storage/productionJournal.ts` can hash a file in `hasVerified`, again
in `openVerifiedSource`, and again during materialization. Media lookup logic is
duplicated between source discovery and existence verification.

Next change: centralize verified-source selection and measure bytes read per
sync. Scope any verification reuse to an operation and a stable file identity;
do not treat a stored hash alone as evidence that local bytes still match.

### 6. Medium: error categories can incorrectly blame backup corruption

`snapshot/sync/engine.ts` groups most merge failures under
`invalid-remote-snapshot`; `snapshot/drive/transport.ts` also maps HTTP 400 to
`invalid-data`, which reaches the same category. Local pending-candidate failures
in `publication.ts` similarly use a remote-snapshot reason.

Next change: separate invalid remote content, local merge/model failures, and
rejected provider requests. Retain non-sensitive error codes for diagnostics
and give each category an appropriate action. The date fix removes the reported
trigger but does not overhaul these error categories.

## Safeguards worth retaining

- Durable publication stages and upload verification before advancing a head.
- Generation-checked local application and reconciliation of edits during sync.
- Hash verification, bounded decoding, strict shape checks, and duplicate-key rejection.
- Connection lifecycle coordination and revocation checks before publication.
- Retained media and conservative deletion behavior.

## Validation

The cloud-sync command passed 227 Jest tests across 23 suites and 51 Bun tests.
After adding the concurrent-date integration case, the engine suite passed all
40 cases (one more than the initial run). TypeScript, lint on changed TypeScript
files, and whitespace checks passed. Tests cover the original ten-day date edit,
two-device convergence, date/text combinations, date-only conflicts, no-base
merges, codec validation, reversed conflict labels, and per-plan download reuse.
Live iOS/Android + Google Drive verification remains to be performed with both
clients running the updated code.
