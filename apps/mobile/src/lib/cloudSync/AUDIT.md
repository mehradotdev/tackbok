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

## Follow-up implementation

The findings below describe the original audit state; each now has an implementation status.

### 1. High: concurrent edits to a recovered entry can block sync

`snapshot/merge.ts` creates a new recovery whose `conflictOriginId` points to the
entry being merged. If that entry is already recovered, it creates a chain.
`snapshot/validation.ts` rejects a recovery whose origin is itself recovered.

Reproduced with a valid root + recovered entry, concurrent edits to the recovery,
and `encodeSnapshot(mergeSnapshotDomains(...))`: `invalid-conflict-origin`.
This predates the date fix and also affects text conflicts.

Implemented: recovery origins are immutable lineage links to live entries or
same-type tombstones. Repeated recoveries are valid; cycles and missing ancestors
remain invalid. Validation walks and memoizes lineage paths in linear time.
Deleting an ancestor preserves its tombstone rather than rewriting/promoting the
remaining family. Tests cover repeated conflicts, ancestor deletion, orphaned
links, and cycles. Existing immediate conflict references remain unchanged.

### 2. High: bulk local applies can exceed SQLite bind limits

`snapshot/storage/productionJournal.ts` inserts entire collections with a single
`.values(...)` call. The codec accepts up to 100,000 entries and 500,000 relations,
while the bundled Expo SQLite source defaults to 32,766 parameters per statement.
An entry insert binds several values per row. The accepted format is therefore
larger than this write path can reliably apply. This is a source-level finding;
the native simulator's exact compiled limit was not queried.

Implemented: all seven bulk collections use 50-row batches inside the existing
atomic transaction. A production-adapter test restores 10,000 entries and 10,000
relations into real SQLite, verifies values, and forces a later-batch failure to
prove the deletes and earlier batches roll back together.

### 3. Medium: every successful apply rewrites the complete local journal

`ProductionSnapshotJournalStore.applyMergedIfGeneration` deletes and reinserts
entries, tags, relations, prompts, profile, media, tombstones, and conflicts.
It also scans all relations for every entry when rebuilding legacy tag strings.

Implemented: relation strings are built from a single entry index. Unchanged
journal applications skip materialization and database writes, with a second
transactional generation check to reject intervening edits. Changed journals
still use atomic replacement, now with bounded inserts. The production-adapter
restore test took roughly 132 ms on the development machine on its first run
(not a native iOS/Android timing). Per-row diffed writes are deliberately deferred
until native measurements justify their added bookkeeping.

### 4. Medium: multi-device history has no effective snapshot retention

`snapshot/sync/cleanup.ts` returns without deleting old snapshots whenever there
is more than one logical device. Even two fully converged devices retain all
historical complete snapshots. New snapshots can accumulate during ordinary use.

Implemented: cleanup validates current head payloads and requires a single
surviving frontier that covers the other devices. It retains every current head,
the three newest snapshots, and the 30-day grace period. An old candidate is
removed only if its decoded author sequence is strictly covered by that survivor.
Unknown/divergent branches and uploaded candidates ahead of known heads stay.
Head changes abort a deletion batch. At most ten old candidates are examined per
pass, with a rotating in-memory cursor to avoid starvation by retained objects.
Tests cover multi-device convergence, divergent/offline heads, unpublished
candidates, a changing head, and restoring after cleanup. Media deletion remains
outside this cleanup path.

### 5. Medium: repeated whole-file verification increases sync cost

`snapshot/storage/productionJournal.ts` can hash a file in `hasVerified`, again
in `openVerifiedSource`, and again during materialization. Media lookup logic is
duplicated between source discovery and existence verification.

Implemented: one verified-source resolver serves presence and upload lookup,
including fallback from unreadable staged files to retained originals. Upload
planning opens that source directly instead of hashing once for presence and
again to open it. Unchanged applies skip materialization, and staged cleanup no
longer scans every descriptor for every blob. No cross-pass hash cache was added;
materialization and subsequent operations still verify bytes independently.
Tests assert one initial hash read, later-call revalidation, and retained fallback.
A full native bytes-read benchmark is still useful before adding more caching.

### 6. Medium: error categories can incorrectly blame backup corruption

`snapshot/sync/engine.ts` groups most merge failures under
`invalid-remote-snapshot`; `snapshot/drive/transport.ts` also maps HTTP 400 to
`invalid-data`, which reaches the same category. Local pending-candidate failures
in `publication.ts` similarly use a remote-snapshot reason.

Implemented: local merge/model and pending-candidate failures use journal
preparation recovery. HTTP 400 now has an `invalid-request` provider code and
`provider-request-rejected` attention state, with an update/retry instruction.
Invalid downloaded content still uses backup verification. Hydration shares the
same provider classification. Unknown failures use neutral queued-work copy
instead of claiming Drive was unreachable. New text is present in all six locales;
non-sensitive diagnostic codes remain persisted.

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

Follow-up compatibility: recovery lineage chains and the provider-request attention
state also require updated clients. No cloud data reset or database migration is
needed. Follow-up changes are separate from the initial unsigned commit `1af686b`.

Follow-up validation: 231 Jest tests across 23 suites and 55 Bun tests across
four files passed, including the production SQLite adapter. The final expanded
retention cases passed in the 42-test engine suite. TypeScript and targeted lint
passed. Native-device timing and live Google Drive verification remain pending.

## Attachment order follow-up

Snapshots now carry an optional `attachmentOrder` ID array on each entry. The
existing local `entries.assets` array remains the storage source; no database
column or migration is added. Capture resolves legacy URI-only assets against
normalized media IDs. Restore applies this sequence to photos and voice memos,
while media records remain sorted by ID for canonical hashing.

Media merge decides membership first. Order merge projects the base and both
branches onto surviving IDs, keeps a one-sided change, or uses lexical ID-array
comparison for competing changes. It appends missing survivors from the other
branch, then any remaining IDs in sorted order. Order never deletes an attachment
or revives one removed by media merge; it creates no additional conflict entries.
Duplicate IDs and references to another entry's media are rejected at validation.

Older snapshots without this field remain readable and retain the asset-ID
fallback. Their original display order cannot be reconstructed from cloud data
alone. Both clients must be updated before syncing new ordered snapshots, because
older clients reject unknown entry fields. An unchanged, already-synced journal
does not automatically publish new ordering metadata; the next journal change
publishes the order currently present on that device.

Validation: 236 Jest tests across 24 suites and 56 Bun tests passed. Coverage
includes concurrent additions/deletions, competing orders, legacy fallback,
symmetric and repeatable merges, codec round-trips, and real SQLite capture and
restore of both photo and voice-memo arrays. TypeScript, targeted lint, and
whitespace checks passed. Live cross-device verification remains pending.
