# Tackbok Cloud Backup & Sync — implementation plan v7

Status: **direction approved by the owner 2026-08-14; §18 decisions resolved.**
Schemas, numeric caps, and the merge rule table become binding only when the
Phase V7-0 gate closes. No production code switches to v7 before that gate.

Created: 2026-08-12

Target: Tackbok mobile (Expo / React Native)

Initial provider: Google Drive `appDataFolder`

Coordination server: none

This plan proposes replacing plan v6's per-entity immutable version graph with
full, immutable, compressed logical snapshots. It does not change production
code merely by existing. Until this plan is approved and its replacement gates
pass, the app still runs the v6 implementation.

Plan v6 and its Phase 0–4 evidence remain historical records. Do not delete or
rewrite them to make v7 appear complete. They explain the current schema,
authorization behavior, security boundaries, and code that v7 will replace or
reuse.

## 1. Product contract

Tackbok provides dependable cloud backup, restore, and practical multi-device
sync for a private journal. It is not a real-time collaborative editor.

The expected case is one active device. Two or more devices are supported by
checking the cloud before publishing, merging stable-ID records against a known
base snapshot, and preserving ambiguous authored data rather than silently
discarding it.

The product promises:

- a local save is durable before the UI reports it as safely queued;
- a completed cloud sync leaves a verified, self-contained metadata snapshot;
- a new device can restore the complete text journal from one snapshot plus its
  referenced media blobs;
- a long-offline device checks current cloud heads before it publishes;
- concurrent snapshots remain discoverable and are merged on a later pass;
- conflicting journal text is preserved as a recovered entry;
- interrupted publication cannot corrupt the last verified backup;
- ordinary deletions sync through tombstones;
- vault-wide deletion remains protected by a durable revocation marker;
- OAuth tokens and the selected Google account email remain in SecureStore and
  never enter a journal snapshot.

The product does not promise:

- real-time collaboration or immediate cross-device propagation;
- conflict-free simultaneous editing of the same entry;
- a guaranteed background execution interval on iOS or Android;
- end-to-end encryption in snapshot protocol v2;
- immediate remote deletion of unreferenced media;
- restoration of arbitrary historical snapshots in the first v7 release.

## 2. Why v7 replaces v6

Plan v6 stores one immutable JSON file for every entity version. It provides
strong deterministic convergence, but a large import or old journal produces
thousands of small Drive files and lookup/upload requests. It also carries a
large ancestry, recovery, checkpoint, and conflict engine that is expensive to
maintain relative to Tackbok's product needs.

Protocol v2 instead publishes the complete portable logical journal in one
compressed snapshot. Photos and voice memos remain separate content-addressed
blobs, so changing one line of text never re-uploads all media.

The expected normal sync cost becomes approximately:

1. list/read the small set of device heads;
2. download a newer snapshot only when one exists;
3. check or upload newly referenced media;
4. upload one compressed metadata snapshot; and
5. advance this device's head.

A five-year Presently import therefore produces one metadata snapshot rather
than approximately one Drive metadata file per imported entry.

## 3. Decisions frozen only after the v7 design gate

The following are proposed decisions. They become binding only when Phase V7-0
is explicitly approved.

### 3.1 Logical snapshots, not raw SQLite files

Never upload `tackbok.db`, its WAL, or an application database copy.

A raw database contains local paths, device/provider state, migration details,
possibly device-local profile email, and obsolete bytes in unused pages. It is
also tied to one app schema and requires coordinated database replacement to
restore safely.

The cloud snapshot is an explicit portable model built from authoritative
domain tables inside a consistent SQLite read transaction. Restore validates
the snapshot and applies it through transaction-scoped repositories.

### 3.2 Immutable, self-contained snapshots

Each metadata snapshot is a new immutable object. A sync never overwrites the
only known-good snapshot.

Every snapshot contains the complete logical state needed for text restore. A
parent snapshot ID records causality and may identify a merge base, but is not a
restore dependency. Deleting an old parent must not make a retained snapshot
unrestorable. Cleanup still preserves the ancestry path to the common base of
branches that have not yet been merged.

The snapshot ID is the SHA-256 of the canonical uncompressed payload. Transfer
compression must be deterministic or explicitly excluded from identity; gzip
container timestamps and platform-specific headers must never change the
logical snapshot ID.

### 3.3 Separate content-addressed media

Photos, voice memos, and profile photos remain immutable blobs addressed by the
SHA-256 of their bytes:

```text
media/<first-two-hash-characters>/<sha256>
```

The snapshot contains stable asset IDs, metadata, and blob hashes, never local
file URIs. Required new blobs are uploaded and verified before a snapshot that
references them becomes a published device head.

### 3.4 Per-device heads, no mutable global head

Each installation owns one small head record. Devices never overwrite another
device's head.

```text
heads/<device-id>.json
```

The record identifies that device's latest verified snapshot and contains no
journal content. A snapshot is uploaded first; only after verification does the
device advance its head. If two devices publish concurrently, both heads remain
discoverable and a later pass merges them.

Each snapshot also carries a bounded, sorted `observedDeviceHeads` vector. It
records the highest `(deviceSequence, snapshotId)` the publisher had accepted
for every known device. This lets a later snapshot prove that it already
subsumes an old device head even after intermediate snapshots are cleaned up.
Without this carried-forward knowledge, an offline/stale head would be merged
again forever or require retaining the entire parent graph.

Drive does not provide compare-and-swap for files. A single shared mutable
`latest.json` would therefore allow concurrent devices to hide each other's
snapshots and is forbidden.

### 3.5 Retain three verified snapshots initially

Protocol v2 retains at least:

1. the current merged snapshot;
2. the previous known-good snapshot; and
3. one pre-merge or rollback snapshot.

Three is the initial policy, not seven. It gives useful rollback protection
without turning cloud backup into a version-history product.

The numeric limit applies only to an already merged main lineage. The following
are never deleted merely to meet the limit:

- a snapshot currently named by any device head;
- an unresolved concurrent branch;
- the ancestry path and common base still required to merge unresolved
  branches;
- a snapshot involved in an interrupted publication or repair;
- the last verified snapshot;
- a snapshot inside the cleanup grace period.

One physical snapshot is rejected because a bad application-generated snapshot
or accidental replacement would leave no known-good fallback. Seven can be
reconsidered when historical restore is a real product requirement.

### 3.6 Historical restore is deferred

The first v7 release does not show a list of old backups. The screen reports the
current verified backup and sync state.

If historical restore is later added, restoring snapshot B while C is current
creates a new forward snapshot D whose content is based on B and whose parent
includes C. It never rewinds a mutable pointer or destroys C in place.

### 3.7 Conservative remote cleanup

Snapshot cleanup may ship with v7 after its safety gate. Automatic media
garbage collection does not ship in the initial v7 implementation.

Remote storage leakage is recoverable; deleting a user's only photo is not.
Until media GC has a separate mark/sweep design and device evidence, media blobs
remain in Drive unless the user invokes a vault-wide destructive action.

## 4. Remote layout — snapshot protocol v2

Proposed Google Drive `appDataFolder` logical keys:

```text
vault.json
snapshots/<snapshot-id>.json.gz
heads/<device-id>.json
media/<first-two>/<sha256>
revocations/<marker-hash>.json
```

Provider-private metadata may store bounded lookup values and object kind, but
the reversible logical key remains the Drive filename. Drive custom-property
length limits must be tested with maximum-shape keys.

### 4.1 `vault.json`

The immutable or carefully migrated vault marker contains:

```ts
interface SnapshotVaultMarkerV2 {
  magic: 'tackbok-vault';
  formatVersion: 2;
  vaultId: string;
  createdAt: number; // display only
}
```

Protocol-v1 and protocol-v2 vaults must never be silently interpreted as each
other.

### 4.2 Snapshot envelope

The exact schema and numeric caps are fixed in Phase V7-0. The candidate shape
is:

```ts
interface JournalSnapshotPayloadV2 {
  format: 'tackbok-snapshot';
  formatVersion: 2;
  vaultId: string;
  parentSnapshotIds: string[];
  observedDeviceHeads: Array<{
    deviceId: string;
    deviceSequence: number;
    snapshotId: string;
  }>;
  authorDeviceId: string;
  deviceSequence: number;
  createdAt: number;        // display only; never conflict precedence
  entries: SnapshotEntry[];
  tags: SnapshotTag[];
  entryTags: SnapshotEntryTag[];
  prompts: SnapshotPrompt[];
  profile: SnapshotProfile;
  media: SnapshotMedia[];
  tombstones: SnapshotTombstone[];
  conflicts: SnapshotConflictRecord[];
}

interface StoredJournalSnapshotV2 {
  snapshotId: string;       // SHA-256 of canonical payload bytes
  payload: JournalSnapshotPayloadV2;
}
```

The snapshot ID is excluded from the hashed payload to avoid self-reference.
Arrays, including `observedDeviceHeads`, are sorted deterministically before
canonical encoding.

Unknown required fields, unsupported versions, duplicate IDs, invalid
references, invalid hashes, oversized content, excessive collection counts,
or decompression bombs reject the snapshot before domain mutation.

### 4.3 Device head

```ts
interface DeviceHeadV2 {
  format: 'tackbok-device-head';
  formatVersion: 2;
  vaultId: string;
  deviceId: string;
  deviceSequence: number;
  snapshotId: string;
  updatedAt: number; // display/cleanup aid only
}
```

The device sequence is allocated durably once per candidate publication and is
reused after lost responses or process death. Drive can contain duplicate
physical head files after an ambiguous request. Readers select the greatest
valid sequence for that device; equal sequence with different snapshot IDs is
corruption and must pause rather than guess. Every such pause state must map to
the user-visible recovery action required by §18.12 — a wedge whose only exit
is a user-discovered disconnect/reconnect is a design defect.

The implementation must define retry-safe mutable-head update semantics in the
provider adapter. A head update never occurs before its snapshot is verified.

### 4.4 Excluded data

Snapshots must not contain:

- OAuth access or refresh tokens;
- the selected Google account email;
- local media URIs or filesystem paths;
- `cloud_vault`, provider cursors, upload-session URIs, or runtime checkpoints;
- analytics identifiers or diagnostics;
- device settings unrelated to the portable journal;
- v6 ancestry graphs, provisional versions, or conflict-engine internals.

## 5. Local durability model

The normalized domain tables and stable IDs remain useful and should be reused.
The transaction-scoped repositories remain the only production write path.

Every local domain mutation must atomically:

1. update the domain row or tombstone;
2. increment a durable local journal generation; and
3. mark snapshot publication dirty.

The v7 implementation may replace the per-entity v6 outbox with one coalescing
`snapshot_dirty` checkpoint, but it must preserve these properties:

- process death after a domain commit cannot lose publication intent;
- a save made while a snapshot is being constructed remains dirty;
- successful publication clears only the generation it captured;
- failed publication leaves intent and retained media durable;
- imported journals coalesce into snapshot work rather than thousands of
  network objects.

Each device persists its last accepted base snapshot ID and the canonical base
payload, or an equivalent complete base shadow. The base must survive process
death and is required for a three-way merge even when cloud retention has
deleted that historical snapshot object.

The base shadow is a second full copy of the journal that a future app version
must still be able to parse. It carries its own versioned format with an
explicit upgrade rule (§18.13). If a base is unreadable after an app upgrade,
the engine falls back to §7.1's conservative two-way reconciliation; it never
fails sync outright or silently discards either side.

## 6. Sync algorithm

Only one foreground sync transaction runs at a time. Local editing remains
available throughout.

### 6.1 Foreground or manual sync

1. Check readiness, network policy, authorization, and pause state.
2. List the `revocations/` prefix directly. A valid marker ends ordinary sync.
3. List device heads using partial Drive fields and normalize retry-created
   physical duplicates.
4. Download and hash-verify only head snapshots unknown locally. Use their
   `observedDeviceHeads` vectors to remove already-subsumed stale heads from the
   active merge frontier.
5. Validate every remote snapshot before merge or local mutation.
6. Compare remote heads, the persisted local base, and current local state.
7. Produce one deterministic merged logical journal.
8. Compute required media hashes.
9. Download remotely referenced media needed locally; keep missing media in an
   explicit pending state and never invent successful restoration.
10. Hash and upload new local media allowed by network policy.
11. Re-check cloud heads if the pass was long or publication inputs may be
    stale. If new work appeared, merge it before publishing.
12. Build and persist the candidate canonical snapshot and captured local
    generation.
13. Upload the immutable compressed snapshot.
14. Read back or otherwise content-verify the uploaded object.
15. Advance only this device's head to the verified snapshot.
16. Apply the merged domain state with generation compare-and-set protection.
17. Persist the new local base and clear only captured dirty intent.
18. If actionable local or remote work remains, run another bounded foreground
    pass. Stop on no progress, policy blocking, cancellation, or a defined
    foreground time/pass budget.
19. Run eligible snapshot cleanup as separate best-effort work.

Media upload precedes snapshot publication. Domain materialization may expose
text before all remote media has downloaded only if the UI visibly represents
pending/missing media and retry state.

The Wi-Fi-only setting governs media transfer only. Compressed metadata
snapshots may upload on any permitted network (§18.11); this holds only while
the measured decade-journal snapshot stays within the size cap fixed at the
V7-0 gate.

### 6.2 Background sync

An OS background invocation runs one bounded, restart-safe unit and returns. It
does not loop indefinitely, request notification permission, or claim a fixed
schedule. Foreground activation, connectivity restoration, local mutation
debounce, and **Sync now** provide later retries.

### 6.3 Manual **Sync now**

Manual sync skips the debounce and drains actionable work within a foreground
budget. Success copy is truthful:

- **Up to date** only when no actionable work remains;
- **N changes remain safely queued** when work remains locally;
- a specific policy/error state for Wi-Fi-only media, offline, authorization,
  quota, rate limiting, corruption, or transient failure.

Completing one bounded pass is not sufficient to display **Sync completed** if
the queue still contains actionable work.

## 7. Merge model

Snapshots are full-state containers; merging still happens per stable record.
For each record ID compare `base`, `local`, and `remote` values.

### 7.1 General three-way rule

- Neither side changed from base: keep base.
- Only one side changed: keep that side.
- Both changed to byte-equivalent normalized state: keep one deterministic
  representation.
- Both changed differently: apply the entity-specific rule below.
- Base is unavailable or invalid: perform conservative two-way reconciliation
  that preserves both authored alternatives; never silently choose by wall
  clock.

Wall-clock timestamps are display metadata only. Device sequence numbers detect
retry/replay within one device but do not order different devices.

### 7.2 Entries

- Independently changed scalar fields merge field by field.
- Concurrent changes to the same title or body field preserve both authored
  values. One deterministic entry remains primary and the other becomes a
  recovered entry with a stable derived ID and conflict-origin link.
- Tag memberships and assets use stable-ID three-way set merge.
- Concurrent addition of different tags/assets preserves both.
- Removal versus unchanged removes the relation.
- Removal versus concurrent modification/addition is a conflict and preserves
  the authored or newly referenced side with a conflict record.
- Delete versus unchanged deletes.
- Delete versus concurrent edit preserves the edited entry and records the
  deletion conflict; no authored journal text is silently discarded.

### 7.3 Tags and prompts

- Stable IDs define identity; titles do not.
- One-sided rename wins.
- Concurrent different renames choose a deterministic primary title and retain
  the alternate in a conflict record visible to the user.
- Tag deletion cannot leave an entry relation pointing to a missing tag. A
  concurrent entry reference preserves or recovers the referenced tag.

### 7.4 Profile

Display name and profile-photo asset reference merge independently. Concurrent
different scalar values choose a deterministic primary and retain the alternate
in a conflict record. Profile email is device-local and excluded entirely.

### 7.5 Tombstones

Snapshots include durable ordinary-entity tombstones with stable entity ID and
causal/base metadata. Tombstones are retained indefinitely in the initial v7
release; compacting them requires a future proof that no returning device can
resurrect the deleted record.

## 8. Concurrent publication and crash safety

For a base snapshot A:

```text
Device 1: A -> B -> heads/device-1 = B
Device 2: A -> C -> heads/device-2 = C
```

B and C remain independently discoverable. A later pass merges them into D:

```text
D.parents = [B, C]
D.observedDeviceHeads = {
  device-1: sequence(B),
  device-2: sequence(C)
}
heads/merging-device = D
```

Other device heads may remain on B or C until those devices sync. Snapshot D is
self-contained, so restoring it does not require A, B, or C to remain stored.
Its observed-head vector proves that B and C are already included, so their
stale head records do not cause repeated conflict recovery.

Required kill points include:

- after local mutation but before snapshot construction;
- during media hashing/upload;
- after candidate snapshot persistence;
- after snapshot upload but before verification;
- after verification but before head advance;
- after head advance but before local base/dirty settlement;
- during remote snapshot download;
- during merge application;
- during snapshot cleanup.

Every kill point must recover without losing local intent, hiding a concurrent
head, publishing a snapshot with missing required media, or corrupting the last
verified backup.

## 9. Retention and cleanup

### 9.1 Snapshot eligibility

A cleanup run begins only after a new snapshot and head have been verified and
the local base is durable. It lists all current device heads and known snapshot
objects.

A snapshot is eligible only when all are true:

- it is not the current head of any known device;
- it is not an unresolved branch;
- it is not on the retained path to the common base of unresolved branches;
- it is not among the three retained verified lineage snapshots;
- it is not referenced by an interrupted local operation;
- it is older than the cleanup grace period fixed at the v7 design gate;
- at least one other verified restorable snapshot remains.

Deletion is permanent in Drive `appDataFolder`, bounded, resumable, and
idempotent. A failure leaves excess history; it never invalidates sync.

### 9.2 Stale device heads

Do not automatically delete a device head merely because it is old. Without a
coordination server, age does not prove that a device is retired. A future
explicit **Remove old device** action may retire a head after clear user
confirmation.

### 9.3 Media cleanup

Deferred beyond initial v7. A future design must mark every blob referenced by:

- all current device heads;
- all retained snapshots;
- all unresolved branches;
- local pending publication and retained-media obligations.

It must then wait a grace period and repeat the mark before permanent deletion.

## 10. Drive API efficiency

The adapter should minimize requests without weakening correctness:

- query prefixes on the server rather than listing the entire vault and
  filtering locally;
- request only required metadata fields;
- use a saved Drive change cursor after initial discovery;
- use page sizes up to the proven memory-safe limit;
- download a snapshot only when its hash is unknown locally;
- check multiple media hashes in bounded grouped queries;
- remember verified remote media in durable provider state, with periodic
  reconciliation rather than a lookup before every known upload;
- use multipart upload for small compressed snapshots and resumable upload for
  large media;
- cap concurrent transfers and use bounded exponential backoff with jitter and
  `Retry-After`;
- debounce local mutation bursts so an import produces one or a few snapshots,
  not one snapshot per entry;
- record redacted request-count evidence in gates.

Google HTTP batching may reduce connection overhead but does not make inner
requests free and does not support media transfer. It is an optional adapter
optimization, not part of snapshot correctness.

## 11. Authorization, privacy, and analytics invariants

The following verified v6 behavior carries into v7:

- every Google token-minting path uses the platform authorization abstraction;
- tokens and selected account email live only in `expo-secure-store`;
- Disconnect performs local sign-out and never calls Google's global OAuth
  revocation endpoint;
- the account email is deleted with credentials on Disconnect;
- snapshots, SQLite sync state, Zustand persistence, logs, diagnostics,
  analytics, and evidence never contain the Google account email or tokens;
- evidence contains no Drive session URI, file body, media bytes, journal text,
  account identifier, or token;
- cloud sync never requests notification permission;
- analytics uses the documented allowlist and contains only coarse provider,
  trigger, result, duration, and count buckets;
- the disclosure and privacy policy state that v2 is protected in transit and
  by Google Drive but not end-to-end encrypted by Tackbok.

## 12. Destructive actions

### 12.1 Disconnect provider

Stops sync on this device and removes local credentials/account label. Local
journal data and cloud data remain. Other device heads remain valid.

### 12.2 Reset this device only

Disconnect first, then erase this device's local journal and sync state. It
must not publish tombstones or a vault revocation.

### 12.3 Delete cloud backup

Publish a `backup-deleted` revocation marker before physical deletion. Preserve
the marker while deleting snapshots, heads, media, and the vault marker in
bounded resumable batches. Local journal data remains and this device
disconnects after verified purge.

### 12.4 Delete journal everywhere

Publish a `journal-deleted` marker before purge. A device observing it wipes its
local journal and disconnects. Offline stale devices may never publish into the
revoked vault.

The revocation marker protocol is retained because snapshot replacement alone
cannot prevent a long-offline device from recreating deleted cloud data.

## 13. UI scope

Reuse the current **Cloud Backup & Sync** screen structure where practical.

Initial v7 UI includes:

- connected Google account label from SecureStore-backed authorization;
- Up to date / Safely queued / Syncing / Restoring / Paused / Attention needed;
- last verified successful snapshot time;
- honest current-stage and remaining-work presentation;
- **Sync now**;
- Wi-Fi-only media;
- Pause sync;
- Verify backup health;
- Reconnect, Disconnect, Delete backup, Delete journal everywhere, and Reset
  this device only;
- recovered-conflict review.

Initial v7 UI does not include **Restore previous backup**. The three-snapshot
retention policy is first an internal safety mechanism. Historical restore is a
separate reviewed feature after snapshot publication and recovery are proven.

All user-facing strings ship through i18n in English, Arabic, German, Hebrew,
Simplified Chinese, and Traditional Chinese, with RTL and accessibility checks.

## 14. Alpha transition from protocol v1

There are no production users, so v7 should prefer a clean protocol boundary
over a complex compatibility layer.

Proposed transition:

1. Preserve all local normalized journal rows and media files.
2. Stop the v6 runtime before any v7 migration.
3. Clear or archive v6-only local sync state transactionally: entity graphs,
   versions, engine checkpoints, old provider cursors, and provisional state.
4. Keep reusable normalized tables, stable IDs, repositories, retained-media
   safety, authorization, and settings.
5. Require explicit owner handling of disposable protocol-v1 test vaults:
   revoke/purge them with the v1 implementation before removal, or deliberately
   abandon them under an alpha-only written waiver.
6. Create a new format-v2 vault. Never write protocol-v2 objects into a v1
   vault namespace.
7. Mark the complete local journal dirty once and publish its first snapshot.

If any real beta tester data must be preserved, this clean-break decision must
be revisited before implementation.

## 15. Reuse and removal map

Likely reusable:

- normalized domain tables and stable IDs;
- transaction-scoped repositories and import/export normalization;
- media hashing and content-addressed file handling;
- retained-media safety ledger;
- Google authorization and SecureStore account-label handling;
- Drive REST request wrapper, error normalization, retry/backoff, multipart and
  resumable transfer primitives;
- runtime triggers, readiness gate, pause state, background task registration;
- Cloud Backup & Sync UI, translations, accessibility, and analytics surfaces;
- vault revocation and permanent purge concepts.

Replacement candidates after v7 gates pass:

- per-entity canonical version format;
- ancestry graph and N-head resolution engine;
- provisional version construction and recovery dependencies;
- v6 SQLite engine checkpoint representation;
- one-file-per-entity-version Drive publication;
- entity-version change-feed restore logic;
- protocol-v1-specific fixtures and gates from production test commands.

Historical v6 source and evidence should be removed only in a dedicated cleanup
commit after no production path imports it and v7 has equivalent security and
recovery coverage. Dev probe code with still-useful auth/Drive coverage may be
adapted rather than deleted.

## 16. Implementation phases and gates

### Phase V7-0 — design ADR and frozen fixtures

Deliver:

- accepted snapshot-v2 ADR;
- exact schema and validation-cap table;
- deterministic canonicalization/compression decision, explicitly covering
  number serialization, object key ordering, and byte-level handling of
  authored Unicode text across Hermes and host JS engines;
- merge rule table for every field and delete/edit combination;
- the defined user-visible recovery action behind every **Attention needed**
  pause state (§18.12);
- the versioned base-shadow format and its upgrade rule (§18.13);
- Drive request-budget model for quiet sync, one text edit, a 2,000-entry
  import, and restore;
- golden base/local/remote snapshots and expected merges.

Gate:

- owner closes the §18 items deferred to this gate (5, 6, 10) over the
  delivered measurements and rule table;
- fixtures hash identically in Jest, Android, and iOS;
- snapshots containing 2,000 and ~10,000 representative text entries are
  measured for uncompressed/compressed size and encode/decode memory/time,
  and the 10,000-entry compressed size is checked against §18.11;
- no production code is switched to v7 before this gate closes.

### Phase V7-1 — pure snapshot codec and merge engine

Deliver:

- portable snapshot builder/parser;
- deterministic ID/hash and compression;
- validation caps and decompression bounds;
- three-way record merge and recovered entries;
- tombstones and conflict records;
- media-reference calculation.

Gate:

- golden merge catalog passes byte-identically;
- property tests prove idempotence, commutativity where specified, stable
  recovered IDs, and no silent authored-text loss;
- malformed and oversized snapshots never mutate the domain.

### Phase V7-2 — durable local publisher against a fake provider

Deliver:

- coalescing snapshot-dirty generation;
- durable base snapshot;
- immutable snapshot publication and per-device heads;
- media-before-snapshot ordering;
- restart checkpoints;
- three-snapshot retention without media GC;
- v1-to-v2 local transition.

Gate:

- kill injection at every §8 point loses neither local intent nor the previous
  verified backup;
- two- and three-device schedules converge or preserve explicit conflicts;
- a 2,000-entry import produces bounded snapshot publications, not per-entry
  provider writes;
- concurrent heads remain discoverable after simultaneous publication.

### Phase V7-3 — Google Drive adapter

Deliver:

- snapshot/head operations in `appDataFolder`;
- change cursor and prefix-scoped listing;
- grouped media existence checks;
- retry-safe multipart/resumable transfer;
- snapshot cleanup;
- redacted API-call instrumentation.

Gate:

- real Drive probes cover duplicate names, lost upload response, simultaneous
  heads, cursor expiry, cleanup interruption, revocation, and permanent delete;
- measured request counts meet the approved Phase V7-0 budget;
- a representative Presently import publishes and restores successfully;
- no evidence contains user data or credentials.

### Phase V7-4 — runtime and UI replacement

Deliver:

- production v7 runtime wiring;
- truthful drain-until-stable foreground behavior;
- bounded background behavior;
- current screen/status migration;
- restore and conflict presentation;
- all translations/accessibility/analytics/policy updates.

Gate:

- manual sync reaches zero actionable work or displays a specific blocker;
- offline saves remain safely queued across restart;
- onboarding restore works without exposing historical-restore UI;
- no notification permission is requested;
- all six locales and accessibility source/device checks pass.

### Phase V7-5 — device hardening and v6 retirement

Deliver:

- physical Android/iOS multi-device soak;
- large-journal restore and memory measurements;
- background/lock/Doze/Low Power Mode evidence;
- v6 production-code removal after dependency audit;
- archived v6 tests/docs retained or deliberately pruned in a reviewed cleanup;
- rollout and kill switch.

Gate:

- store-release builds pass authorization, restore, interruption, and
  revocation scenarios on physical devices;
- v7 meets numeric performance targets fixed in Phase V7-0;
- rollback pauses network work without deleting local or provider data;
- no v6 engine is reachable from production code.

## 17. Definition of done

- One ordinary text edit publishes one compressed metadata snapshot, not one
  remote object per entity.
- A multi-year import is coalesced and does not generate thousands of metadata
  API calls.
- A new device restores all text from one verified snapshot and downloads its
  referenced media with resumable, hash-verified transfers.
- Two devices publishing concurrently cannot hide or overwrite each other's
  branch.
- Concurrent authored text is retained as a recovered entry.
- Ordinary deletion does not resurrect when an offline device returns.
- A process kill at every publication checkpoint preserves local intent and at
  least one verified cloud backup.
- The latest three eligible snapshots are retained; active heads and unresolved
  branches are never deleted by numeric retention.
- No automatic media GC ships without its separate safety gate.
- OAuth tokens and selected account email remain SecureStore-only.
- Disconnect never globally revokes Google authorization.
- Delete-backup and delete-journal revocations dominate stale devices.
- Quiet sync and normal edits stay within the approved Drive request budget.
- Current UI, privacy copy, translations, accessibility, and analytics match
  actual v7 behavior.

## 18. Owner decisions — resolved 2026-08-14

Items 5, 6, and 10 are approved in principle; their concrete numbers and rule
tables become binding when the owner closes the V7-0 gate over measured
fixtures. Every other item is decided now.

1. **Retention:** approved. Three verified snapshots is the initial policy,
   with the §3.5 never-delete exclusions.
2. **History UI:** approved. **Restore previous backup** stays out of initial
   v7; retention is an internal safety mechanism first.
3. **Alpha vaults:** revoke and purge the owner's disposable protocol-v1 test
   vaults using the reviewed v1 delete path before v6 retirement. Any v1 vault
   created by an alpha build in the meantime is abandoned under the alpha-only
   waiver: local journal data is preserved and republishes as that device's
   first v2 snapshot; the orphaned v1 objects in the user's own Drive are not
   migrated. Revisit only if real beta-tester cloud data must survive.
4. **Cleanup grace:** 30 days minimum snapshot age before permanent cleanup.
   Deliberately conservative for the first release; may be shortened after
   V7-5 device evidence.
5. **Size caps:** fixed at the V7-0 gate from measured fixtures. Measurement
   must cover both the 2,000-entry shape and a ~10,000-entry decade-journal
   shape.
6. **Merge details:** the complete per-field merge rule table and its golden
   fixtures are approved item by item at the V7-0 gate.
7. **Missing media:** text restores immediately. Missing media is shown in an
   explicit pending state with retry, matching current v6 behavior; restore
   never blocks on full media download.
8. **Device retirement:** confirmed. Stale heads remain until an explicit,
   user-confirmed **Remove old device** action, which is out of scope for
   initial v7.
9. **Encryption:** accepted. Protocol v2 is provider-readable plaintext,
   protected in transit and at rest by Google Drive. This is already the
   published product stance in the privacy policy and disclosure copy; carry
   that copy forward unchanged in substance.
10. **Performance/API budget:** numeric device targets and per-scenario Drive
    request budgets are fixed at the V7-0 gate from the request-budget model
    and fixture measurements, then enforced by the V7-3 and V7-5 gates.

Additional owner decisions recorded at approval:

11. **Metadata snapshots and network policy:** the Wi-Fi-only setting governs
    media transfer only. Compressed metadata snapshots may upload on any
    permitted network, provided the V7-0 measurements show the decade-journal
    compressed snapshot stays within the item-5 size cap. If it does not, this
    decision reopens before format freeze.
12. **Wedged-vault exit:** every "pause rather than guess" state (for example
    equal device sequence with different snapshot IDs) must surface as
    **Attention needed** with a defined, user-visible recovery action specified
    in the V7-0 ADR. No state may exist whose only exit is a
    disconnect/reconnect the user has to discover on their own.
13. **Base shadow durability:** the persisted local base carries its own
    versioned format and upgrade rule so a future app version can still parse
    it. An unreadable base degrades to §7.1's conservative two-way
    reconciliation; it never fails sync outright.

Items 5, 6, and 10 remain open until the V7-0 gate; no implementing agent may
treat a recommendation for them as decided before the owner closes that gate.
