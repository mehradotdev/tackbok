# Cloud sync audit

## Deep audit — 2026-11-06

### Method

Two independent read-only reviews, given identical briefs and kept apart:

- **Opus**: Claude Opus 5.5 at medium effort.
- **Astra**: GPT-6-Astra at medium reasoning effort.

Both reviewed commit `120529e`. Both briefs included the two findings from the
earlier feedback investigation (A: profile conflicts; B: Disconnect does nothing
while a sync is stuck) for re-verification. The reports were merged by hand:

- duplicates were removed;
- every single-source and disputed finding was checked against the code;
- both agents' scratch repros were re-run, and each produced the output quoted
  below.

Each repro uses the existing fakes: the fake provider and the in-memory journal
with bun:sqlite. No device, network or real Drive was used. The scratch tests
live in `/tmp/tackbok-audit/{opus,astra}/` and are temporary. Each fix PR below
should turn its repro into a committed regression test.

Paths are relative to `apps/mobile/src/` unless they start with
`apps/website/`. Severity: **S1** data loss or silent overwrite > **S2** stuck or
unrecoverable > **S3** wrong or misleading UI > **S4** polish.

**Scope notes:**

- **No iCloud provider exists.** Both agents confirmed it. iOS also uses Google
  Drive (`auth/ios.ts`), and `runtime/production.ts:89` accepts only
  `google-drive`. Copy must not mention iCloud.
- **Checks already in place.** Both agents re-checked these and found them sound
  in the code:
  - publication quiescence
  - transactional apply
  - retention
  - Android SQLite handle reachability: `db/index.ts` and `lib/kvStorage.ts`
    keep their handles reachable, and no orphaned `openDatabase` was found
  - wrapping the biometric lock around Google auth (`withExternalAuthentication`)
  - 401, 403 and 5xx classification

### Findings, ranked

| ID  | Sev   | Finding                                                                                        | Found by                       | Verified                    |
| --- | ----- | ---------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------- |
| N1  | S1    | No merge base after concurrent publishes: edits reverted, entries duplicated, deletions undone | Both (known A)                 | Repro, both                 |
| N2  | S1    | A device that skipped naming erases the name everywhere on first join                          | Both (known A)                 | Repro, both                 |
| N3  | S1    | A resumed, already-planned candidate is published against stale heads                          | Opus                           | Repro + code                |
| N4  | S1/S3 | Same profile photo gets different asset IDs per device, causing frivolous photo conflicts      | Astra                          | Repro + code                |
| N5  | S2    | Disconnect and Pause wait for the whole running pass; nothing can be cancelled                 | Both (known B)                 | Repro, both                 |
| N6  | S2    | Media download writes beyond the declared size before rejecting it                             | Astra                          | Repro                       |
| N7  | S3    | Retry-After is shortened to 30 s inside a request                                              | Astra                          | Repro                       |
| N8  | S2/S3 | With Wi-Fi-only media on, a new photo blocks _text_ sync on mobile data                        | Both                           | Repro, both                 |
| N9  | S3    | First restore from onboarding is blocking, mislabelled and fragile when the user leaves        | Both                           | Code + D1 repro             |
| N10 | S3    | "Recovered conflicts" card: identical rows, false "alternative saved", local-only dismissal    | Both                           | Code                        |
| N11 | S3    | Progress UI: 4-step bar goes backwards, photo downloads counted as "changes"                   | Both                           | Code                        |
| N12 | S3    | Misleading error and recovery labels                                                           | Opus + Astra (different items) | Code                        |
| N13 | S3    | Importing a Tackbok zip overwrites the profile even in merge mode                              | Opus                           | Code                        |
| N14 | S3    | Discovery can't tell "no backup" from "unreadable backup"                                      | Astra                          | Code (medium confidence)    |
| N15 | S4    | Privacy copy never says the developer can't see the journal                                    | Both                           | Code                        |
| N16 | S4?   | iOS token is readable only while unlocked, which may break background sync                     | Opus (Astra noted the setting) | Speculative; needs a device |

#### N1: Concurrent publishes merge with no base (S1)

**Mechanism:**

- `snapshot/sync/engine.ts:213-225` passes the base only when
  `remoteContainsBase`. Otherwise the base is `null`, even though both branches
  share an older ancestor. `sync/frontier.ts:119-142` keeps only the latest base.
- With no base:
  - `scalarMerge` (`snapshot/merge.ts:98-114`) treats every difference as a
    conflict and picks a winner by hash.
  - A content difference creates a `recovered-…` duplicate entry
    (`merge.ts:130-266`).
  - Delete versus live is resolved as "keep live" (`merge.ts:446-467`), so
    deletions come back.

**Evidence:**

- Opus `a-profile.test.ts` A4: A edits only e1 and B edits only e2. Both get
  `entry:content` conflicts, and A's edit ends up in a recovered duplicate.
- Opus `f-delete.test.ts`: in F1 a deleted entry comes back. F2 runs the same
  edits one after another and gets the correct result.
- Opus `b-fuzz.test.ts`: in random concurrent passes where no entry is shared,
  15–17 duplicates appear.
- Astra `profile-conflict2.test.ts`: the concurrent rename `A0` reverts to
  "Mehra". After six rounds there are six distinct `displayName` conflicts plus
  spurious `entry:content` conflicts.

**Refinement of known A:** identical conflicts collapse into one; the conflict
ID hashes field, base and values (`merge.ts:45-58`). Quiet rounds add nothing;
both agents confirmed this. Repeated rows require _new_ value pairs under a
missing base.

**Fix direction:** merge against the real common ancestor.

1. Walk `parentSnapshotIds` from the local base, using retained snapshots.
   Retention already keeps the heads, the 3 newest snapshots and a 30-day grace
   period.
2. Alternatively, keep a few recent base shadows locally.
3. Fall back to no base only when no ancestor is provable.

Don't pass the latest local base unconditionally; that is wrong too (Astra).
This is client-only with no format change, but older clients keep producing the
bug until they update.

#### N2: The unnamed joiner wins the name (S1)

**Mechanism:**

- A Drive restore from onboarding skips the name step
  (`screens/onboarding/WelcomeScreen.tsx:192-197`), so the local profile has
  `displayName: null`.
- The first join has no base. If `hash(null)` is lower, `null` wins, and the
  original device then adopts it as a plain remote change.

**Evidence:**

- Opus A1 wiped 4 of 6 names (Manu, Mehra, Sam, Anna).
- Astra `additional.test.ts`: "blank join: both names null; alternate = Mehra".

**Fix direction:**

- On the first join, a local profile the user never edited (pristine) adopts the
  remote profile.
- Simpler guard: with no base, a set name or photo beats an unset one without
  raising a conflict.

Astra cautions against making `null` lose _globally_: after a real base, `null`
can be a deliberate clear. Both directions agree on the first-join case.

Also trim names in `storage/backfill.ts:130-138` and
`backupImport/import/tackbok.ts:139-147`, as `store.ts:165` does. Only trim
values on new writes; normalizing old cloud values changes their hashes and
creates new conflicts.

#### N3: A stale planned candidate is resumed blindly (S1, Opus)

**Mechanism:**

- `engine.ts:122-174`: if `loadPending` returns a candidate, it is passed
  straight to `publisher.resume()` without re-planning against the current
  heads.
- iOS backgrounding starts a pass, so a candidate planned before suspension can
  be published minutes later. That candidate silently overwrites the other
  device's work.

**Evidence:** Opus `e-stale.test.ts` E1. A is killed after persisting its
candidate. B renames and changes a mood. A resumes, and B's rename and mood
change are reverted, with 2 profile conflicts from a single rename.

**Fix direction:** before uploading a pending candidate that hasn't been
uploaded yet, compare the observed heads. If they changed, drop the candidate and
re-plan; its data is still in the local journal. This is the smallest and
safest data-loss fix, and it should land first.

#### N4: Profile photo asset IDs differ per device (S1/S3, Astra)

**Mechanism:**

- The legacy backfill calls `updateProfileInTransaction` with only `photoUri`
  (`storage/backfill.ts:130-138`).
- `storage/repositories.ts:648` then assigns `randomUUID()`.
- Each device that migrates the same photo therefore gets a different
  `photoAssetId`.
- With no base, that produces a `photoAssetId` conflict, plus related asset
  conflicts labelled "Profile", even though the user never changed the photo.

**Evidence:** Astra `additional.test.ts`: "same photo bytes + different IDs:
["photoAssetId"]".

**Fix direction:**

- In `mergeProfile`, treat two photo IDs whose descriptors have the same content
  hash as equal: keep one, raise no conflict.
- Optionally, derive the backfilled ID from the content hash.

This is the most likely explanation for the user's "I didn't change my photo"
report, together with N1 and N2. It is unconfirmed, because the seven records
weren't available. To confirm on the device, run:

```sql
SELECT json_extract(conflict_json,'$.field'),
       json_extract(conflict_json,'$.baseValueHash') IS NULL,
       json_extract(conflict_json,'$.alternates')
FROM cloud_conflicts
WHERE json_extract(conflict_json,'$.entityType')='profile';
```

#### N5: Disconnect and Pause can't interrupt a pass (S2, known B confirmed)

**Mechanism:**

- **The wait:** `runtime/connectionLifecycle.ts:37-56` waits for every tracked
  pass, and `SyncRuntime.ts:137-156` `stop()` cancels nothing.
- **No cancellation anywhere:** the Drive transport (`snapshot/drive/transport.ts:34-37`,
  `:204-211`) and body reads (`googleDriveSnapshotProvider.ts:1110-1125`,
  `:1192-1209`) have no abort signal or deadline. Backoff sleeps can't be
  cancelled (`transport.ts:186-256`). `lib/cloudSync` has no `AbortController`.
- **The UI:** `screens/cloudBackup/index.tsx:344-372` closes the dialog first,
  shows no "Disconnecting…" state and adds no duplicate-press guard. On failure
  it shows the generic "Cloud backup could not be updated".

**Refinement:**

- A single request is probably bounded by native timeouts (Opus; unverified).
- The real wait is a _whole pass_, which includes every photo it transfers
  (`engine.ts:397-447`), and that wait is unbounded while iOS has the app
  suspended.
- Astra adds that an unresolved promise blocks the barrier indefinitely.

**Evidence:** both agents' disconnect repros: "disconnect still pending after
2s: true, operation ran: false". The operation runs only after the pass is
released.

**Fix direction:**

- Give each pass an `AbortController`. Pass its signal to fetch, body reads,
  backoff sleeps, the auth refresh and the media loops.
- Add a per-request inactivity timeout.
- Stop, Pause and Disconnect abort the pass and drain it _before_ credentials are
  cleared. Racing a timer is not enough, because authenticated writes would
  continue (Astra).
- The staged publish already survives interruption at any point.

#### N6: Download size is enforced only at EOF (S2, conditional; Astra)

`googleDriveSnapshotProvider.ts:1149-1208` and `media/fileTransfer.ts:75-92`
flush to the partial file every 8 MiB and compare sizes only at EOF. A
malformed or endless response therefore uses disk until it ends. The
hash check still blocks promotion of bad content.

**Evidence:** a 1-byte declared download wrote 1,024 bytes before it was
rejected.

**Fix direction:** check `offset + pending` against the expected size before
each write, abort the reader and reset the partial file. This pairs naturally
with N5.

#### N7: Retry-After is cut short (S3, Astra)

`transport.ts:175-249` checks `retryNotBefore` once, then sleeps
`min(Retry-After, 30 s)` and retries early.

**Evidence:** request timestamps `[0, 30000]` against a server deadline of 120000.

**Fix direction:** if the remaining delay is longer than the pass can wait,
return `rate-limited` immediately. Never shorten the server's delay.

#### N8: Wi-Fi-only blocks text sync (S2/S3, both)

**Mechanism:**

- `snapshot/runtime/productionEngine.ts:84-120` refuses media uploads on
  cellular.
- `engine.ts:407-412` and `sync/publication.ts:250-266` don't catch that refusal
  on the _upload_ path; only downloads tolerate it (`engine.ts:425-435`).
- The whole pass therefore aborts, which contradicts `en.ts:813` "Journal text
  still syncs on mobile data."

**Evidence:**

- Opus G1: the pass returns `retry wifi-only-media`, and the other device never
  sees a later text-only entry.
- Astra: "remote entries: 0".

**Fix direction:** fix the copy now. If text sync on mobile data is required,
publish a valid subset that leaves out not-yet-uploaded new media, so it isn't
treated as deleted. That needs focused tests and should be its own PR.

#### N9: First restore from onboarding (S3, both)

**Mechanism:**

- **The setup screen waits for everything:** `completeGoogleDriveConnection`
  (`ui/production.ts:750-761`) awaits `runtime.start()`, which awaits the first
  pass and keeps looping while work is pending (`SyncRuntime.ts:284-293`). Media
  hydrates 2 files per pass. The setup screen therefore stays on "working" until
  the whole restore, photos included, finishes.
- **The toast is wrong:** the toast says "Cloud restore started" (`en.ts:768`,
  `index.tsx:198-202`) after the restore has _finished_. Runtime errors become
  null results, so a failed first pass shows the same success toast (Astra).
- **Leaving early:**
  - The restore keeps running, but `setHasCompletedOnboarding` sits behind the
    mounted guard (`index.tsx:196-204`). The user stays in onboarding with no
    completion signal.
  - On relaunch, the restore resumes behind onboarding.
- **Starting over:** choosing Google Drive again calls
  `prepareGoogleDriveConnectionImpl`. That disables the vault being restored
  _before_ auth (`ui/production.ts:244-250`), and a cancelled sign-in also signs
  out (`:275`), so the restore is silently dropped.
- **Possible leak (Opus; speculative, each step present in code):** if the
  database is still empty, "Get started" can seed sample entries
  (`FinishScreen.tsx:116`). A name typed in onboarding is also a local edit, and
  both would merge with no base into the shared backup.
- **Not a risk:** a half-applied journal is never published. Apply is
  transactional and generation-checked (both agents).

**Fix direction:**

- Mark onboarding complete as soon as the connection is committed.
- Show a persistent restore card on Home, driven by a durable
  "journal restored / N attachments remaining" milestone, rather than by the
  setup promise.
- Use an honest toast.
- Disable the old vault only after auth succeeds.
- Skip seeding sample entries while a restore is in progress.

#### N10: The "Recovered conflicts" card (S3, both)

**What a row holds** (`merge.ts:534-674`, `ui/production.ts:670-699`):

- **`displayName`:** the losing string, or `null`.
- **`photoAssetId`:** an asset ID only, which isn't viewable by itself.
- **Profile photo asset-record conflicts and `deleteEdit`:** no restorable
  alternate at all, yet the row still says "1 alternative version saved"
  (`translations/plurals.ts:24-27`).
- **The summary API:** it drops `field` and the values, so every row reads
  "Profile: …".

**Mark as reviewed:**

- It writes a local `acknowledged_at` only
  (`snapshot/storage/productionJournal.ts:412-419`, `:595-605`). It isn't synced,
  so rows reappear after a reinstall or reset and on other devices.
- Nothing ever removes conflicts from the snapshot (`merge.ts:679-715`). The set
  only grows, toward the 50,000 cap (`caps.ts:11`).
- Nothing outside `cloudSync` reads `conflict_origin_id`, so recovered entries
  look like unexplained duplicates in the timeline.

**Answer to "should we drop Mark as reviewed?"** Yes, in its current form. Most
rows are artifacts of N1–N4, and the remaining ones offer no way to act. The
recommendation, which both agents converge on:

1. **Fix N1–N4 first.** This stops the frivolous rows from being created.
2. **Hide non-actionable records:** photo asset metadata, same-blob
   `photoAssetId` and `deleteEdit`.
3. **Show name conflicts with both values** and two actions, **Use "{other}"**
   and **Keep current**. Either action dismisses the row.
4. **Group entry conflicts:** "N entries were edited on two devices. Both versions
   are in your journal." with a **Show them** action, and label the recovered
   entries in the timeline.
5. **Drop the global button.** Each row has its own action. Until the redesign
   ships, rename the button to "Dismiss" (Astra).

Syncing dismissals needs a snapshot format change, because the validator rejects
unknown fields. Defer it. In the meantime, hide records older than this device's
join time.

#### N11: Progress UI (S3, both)

- **"Step {current} of {total} in this batch"** (`en.ts:855`, `index.tsx:836`):
  the four phases come from hooks that fire after work completes, so they can go
  backwards, and they restart on every follow-up pass.
- **Wrong labels:** downloads are labelled as uploading or "updating Google
  Drive" (`en.ts:822`).
- **"{count} changes remaining"** (`en.ts:891`, `ui/production.ts:193-196`) adds
  pending attachments to the count of local changes.
- **No completion signal:** the UI never says the restore is done.

The proposed copy is listed under UI/UX recommendations.

#### N12: Misleading errors and labels (S3)

- **Opus:**
  - `local-media-unreadable` is classified `corrupt`
    (`failureClassification.ts:37-46`), so a missing _local_ photo shows "This
    cloud backup contains data Tackbok cannot read."
  - A dropped connection mid-download shows "could not finish" instead of an
    offline message.
  - "Backup from {date}" uses `updatedAt` (`ui/production.ts:266`).
- **Astra:** "Inspect and repair backup", "Combine backups" and "Locate or retry
  attachment" (`en.ts:938-945`) all just retry (`index.tsx:318-334`). Rename
  them to what they actually do.

#### N13: A Tackbok zip import overwrites the profile (S3, Opus)

`backupImport/import/tackbok.ts:139-147` always writes the name and photo,
whatever the import `mode`. The overwrite then reaches every device.

**Fix direction:** in merge mode, only fill in empty profile fields.

#### N14: Discovery can't tell absence from unreadable (S3, Astra; medium confidence)

Account discovery (`googleDriveSnapshotProvider.ts:246-269`, `:570`) only
considers `tb_kind=head` objects and silently skips invalid metadata. An
unreadable or older-layout backup therefore shows "No Tackbok backup found" and
offers to create a _separate_ backup. Neither agent had a historical fixture, so
the impact on backups that actually shipped is unknown.

**Fix direction:** add an "unreadable/unsupported backup found" state distinct
from "no backup found".

#### N15: Privacy wording (S4, both)

**The claim holds in code** (both agents):

- **Scope:** `drive.appdata` + `openid` + `email` only (`auth/types.ts:1-3`).
  This is the hidden app folder, not the whole Drive.
- **Direct to Google:** all Drive, OAuth and userinfo calls go straight to
  Google. There is no Tackbok server or proxy, and iOS uses PKCE with no client
  secret.
- **Tokens:** kept in SecureStore, never logged.
- **Snapshot contents:** snapshots exclude emails.

**Limits on the claim:**

- Optional, opt-in PostHog analytics exist. They carry counts, ranges and
  categories, never content (`analytics/events.ts:129-138`). Promise "Tackbok's
  developer never receives _your journal_", not "never receives any data".
- Backups are not end-to-end encrypted. Keep saying so, in plain language.

Proposed copy is under Privacy wording. Update all locale catalogs (there are 9).

#### N16: iOS keychain accessibility (speculative, Opus)

`auth/secureTokenStore.ts:44-50` uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Background
sync while the phone is locked will either fail quietly or, if the read returns
empty, show a false "Reconnect Google Drive". This needs a device test before any
change, which would be to use `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.

### UI/UX recommendations

**First restore.** Close setup as soon as the backup is chosen, then:

- **Home card:** "Restoring your journal from Google Drive…", then "Your journal
  is ready. Downloading photos and voice memos: 37 of 300."
- **Finish:** a "Restore complete" toast.
- **Waiting for Wi-Fi:** "{n} photos and voice memos are waiting for Wi-Fi."
- **Interrupted:** "Restore paused. It continues when Tackbok is open and
  online."
- **Leaving:** "You can keep using Tackbok while it restores."

**Ongoing sync:**

- **Status lines:** replace the step bar with a single line: "Saving your
  changes to Google Drive…", "Getting changes from your other devices…" or
  "Downloading photos: 12 of 40".
- **Counts:** keep them separate, as in "2 changes waiting · 40 photos
  downloading".
- **Disabled Sync now:** explain why when it's disabled: "Resume sync to sync
  now."
- **Wi-Fi-only copy until N8 ships:** "Photos and voice memos upload and download
  only on Wi-Fi. Entries with new photos also wait for Wi-Fi."

**Disconnect and Pause:**

- **Disconnect:** keep the dialog open while it runs and show "Disconnecting…".
  On success: "Disconnected. Your journal stays on this phone and your backup
  stays in your Google Drive." On failure: "Couldn't disconnect. Try again."
- **Pause:** show "Pausing…" until the pass is drained.

### Privacy wording (proposed, plain-language)

**In the app** (`lib/i18n/translations/en.ts`, then all locales):

| Key / line                | Current                                                                                           | Proposed                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `:749` overview           | "Back up and sync your journal with your own Google Drive. No Tackbok account is created."        | "Back up and sync your journal with your own Google Drive. It goes straight from your phone to your Drive. Tackbok's developer never sees it."                                                                                                         |
| `:766` before you connect | "Backups are encrypted in transit and at rest by Google Drive, but are not end-to-end encrypted." | "Your backup is stored in a private Tackbok folder in your Google Drive. Tackbok can't see your other Drive files, and your backup is never sent to Tackbok's developer. Google protects it like your other files, but it isn't end-to-end encrypted." |
| `:810` permission hint    | "If Google shows a Drive access checkbox, select it…"                                             | "Google will ask to let Tackbok use its own private folder in your Drive. Tick that box, or backup can't connect."                                                                                                                                     |
| `:876` email              | long technical text                                                                               | "Your Google email is kept only on this phone, to show which account is connected. It's removed when you disconnect and is never sent to Tackbok."                                                                                                     |
| `:888` onboarding         | "Your journal stays on your device. Cloud backup is optional."                                    | "Your journal stays on your phone. If you turn on backup, a copy goes only to your own Google Drive."                                                                                                                                                  |
| `:844`                    | "Restore from your cloud backup"                                                                  | "Restore from your Google Drive backup"                                                                                                                                                                                                                |

**On the website** (`apps/website/src/pages/`):

| Where                  | Change                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `faq.astro:54-57`      | Add: "If you turn on Google Drive backup, a copy goes straight from your device to a private folder in your own Drive. We never receive it." |
| `faq.astro:69-72`      | Mention Drive backup and sync between phones.                                                                                                |
| `index.astro:430-441`  | "personal cloud" → "your own Google Drive" (only Drive exists).                                                                              |
| `privacy.astro:66-69`  | Say access is limited to Tackbok's own private app folder.                                                                                   |
| `privacy.astro:83-104` | Replace the technical email and snapshot paragraphs with plain language. Per the existing preference, `privacy.astro` stays non-technical.   |
| `privacy.astro:114`    | "nothing is sent from your device" → "No usage analytics are sent unless you opt in."                                                        |

**Store listing:** the store listing isn't in the repo. Update the privacy and
data-safety text by hand to match.

### Not verified

- **Not tested on a device or on Drive:**
  - native request timeouts
  - iOS suspension mid-pass
  - keychain access while locked (N16)
  - the biometric lock during the native account chooser
  - Android token refresh
- **Which records made the user's seven profile rows:** unknown. Use the query in
  N4.
- **Test suites:**
  - `bun test scripts/cloud-sync scripts/db`: 69 pass.
  - `production-journal.test.ts` and `db/queries.test.ts` could not load:
    `drizzle-orm/bun-sqlite` isn't installed in this worktree.
  - Jest did not run: `jest: command not found`. No dependencies were installed.
- **Old backups:** no v6 or older-layout backup fixtures were tested (N14).

### Proposed PR series

Each PR is small, can be reviewed on its own, and adds a regression test made
from its repro.

**1. Merge correctness / data loss**

| PR                                                      | Scope                                                                                                                 | Risk                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1a `fix(sync): re-plan stale pending candidates`        | N3: before the first upload, compare observed heads and re-plan if they changed.                                      | Low. Local only; the data stays in the journal.                                   |
| 1b `fix(sync): first join adopts remote profile`        | N2: a pristine local profile, or set-beats-unset with no base, for name and photo. Trim names in backfill and import. | Low–medium. Behaviour change only when there is no base.                          |
| 1c `fix(sync): treat same-blob profile photos as equal` | N4: in the merge, and optionally hash-derived backfill IDs.                                                           | Low.                                                                              |
| 1d `fix(sync): merge against common ancestor`           | N1: walk retained parents or keep a few local base shadows, falling back to no base.                                  | **Medium–high.** Core merge path; needs the fuzz test and retention coordination. |
| 1e `fix(import): don't overwrite profile in merge mode` | N13.                                                                                                                  | Low.                                                                              |

**2. Disconnect and cancellation**

| PR                                                    | Scope                                                                                                                                                                                          | Risk                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2a `fix(sync): abortable passes and request timeouts` | N5: an AbortController per pass, signals in transport, body reads, sleeps and auth refresh, and a drain before credentials are cleared. N6: a bound on streamed bytes. N7: honour Retry-After. | Medium. It touches every request; cancellation must leave resumable state. |
| 2b `fix(cloud-backup): disconnect and pause feedback` | Pending state, guard and specific errors.                                                                                                                                                      | Low.                                                                       |

**3. Sync status UI**

| PR                                                      | Scope                                                                                                                                                                                                         | Risk                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 3a `feat(cloud-backup): first-restore lifecycle`        | N9: complete onboarding when the connection is committed, a durable restore milestone, a Home restore card, an honest toast, disabling the vault only after auth, and no sample seeding while a restore runs. | Medium. Onboarding flow and local state. |
| 3b `feat(cloud-backup): honest progress copy`           | N11, N12 labels and classification, and the N8 copy.                                                                                                                                                          | Low.                                     |
| 3c `feat(cloud-backup): actionable conflicts card`      | N10: per-field rows with values, hidden non-actionable records, Use or Keep for names, entry grouping and timeline labels, no global "Mark as reviewed", and hiding records older than the join.              | Low–medium.                              |
| 3d (later) `feat(sync): text-first publish on cellular` | N8 behaviour.                                                                                                                                                                                                 | Medium–high. Publication rules.          |

**4. Privacy wording**

| PR                                                            | Scope                                                                     | Risk |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| 4a `docs(cloud-backup): clarify developer never sees journal` | App strings in all locale catalogs.                                       | Low. |
| 4b `docs(website): Drive backup privacy wording`              | `faq`, `index` and `privacy.astro`. The store listing is updated by hand. | Low. |

**Deferred:**

- N14: discovery states.
- N16: after a device test.
- Synced conflict dismissal: format change.
- Cleanup of existing duplicate `recovered-…` entries.

Older clients keep producing N1–N3 until updated, so ship 1a–1d to both
platforms together.

### Draft tracking issue

> **Title:** Cloud sync: merge correctness, cancellation, status UI and privacy wording
>
> The 2026-11-06 deep audit (`apps/mobile/src/lib/cloudSync/AUDIT.md`, section
> "Deep audit — 2026-11-06") found the following problems with Google Drive sync.
>
> **Data loss (S1)**
>
> - Concurrent passes merge with no common base. Edits are reverted, entries are
>   duplicated and deletions are undone (N1).
> - A device restored during onboarding can erase the profile name on every
>   device (N2).
> - A candidate planned before iOS suspended the app is published later and
>   overwrites other devices' work (N3).
> - Per-device photo IDs create frivolous "Profile" conflicts (N4).
>
> **Stuck states (S2)**
>
> - Disconnect and Pause wait for the whole running pass, and nothing can be
>   cancelled (N5).
> - Media downloads have no streaming size bound (N6).
> - Retry-After is shortened (N7).
> - Wi-Fi-only blocks text sync (N8).
>
> **UI (S3)**
>
> - First restore from onboarding: blocking, wrong toast, fragile when the user
>   leaves (N9).
> - Conflicts card is unactionable and repeats rows (N10).
> - Progress copy (N11).
> - Error labels (N12).
> - Zip import overwrites the profile (N13).
>
> **Privacy copy (S4):** state plainly that the journal goes straight to the
> user's own Drive and the developer never sees it (N15).
>
> **PRs**
>
> - [ ] 1a re-plan stale pending candidates
> - [ ] 1b first join adopts remote profile
> - [ ] 1c same-blob profile photos are equal
> - [ ] 1d merge against common ancestor
> - [ ] 1e zip import keeps profile in merge mode
> - [ ] 2a abortable passes, timeouts, size bound, Retry-After
> - [ ] 2b disconnect and pause feedback
> - [ ] 3a first-restore lifecycle and Home restore card
> - [ ] 3b honest progress and error copy
> - [ ] 3c actionable conflicts card
> - [ ] 4a in-app privacy wording (all locales)
> - [ ] 4b website privacy wording, plus a manual store-listing update
>
> **Deferred:** text-first cellular publish (3d), discovery states (N14), iOS
> keychain accessibility (N16, needs a device test), synced conflict dismissal,
> and cleanup of existing duplicates.
>
> **Not covered:** testing on a device or on real Drive.

## Earlier audits — 2026-09 (summary)

The full text of the September audits is in git history: `git log -p -- apps/mobile/src/lib/cloudSync/AUDIT.md`.
All of these items are fixed. Keep them in mind when changing merge, storage or retention.

**Design decision**

- Keep the complete-snapshot design for alpha. An operation log or CRDT is not justified yet.
- Theme preferences stay local.

**Fixed, by area**

- **Publication**
  - **Heartbeat publication loop.** If a verified frontier snapshot already contains the merged result, the engine adopts it (`pulled`) instead of publishing.
  - **Base filenames.** Base files include their full content hash.
- **Merge**
  - **Entry dates are editable.** `createdAt` takes part in the 3-way merge. Concurrent date changes keep both versions as recovered entries.
  - **Reversed conflict labels.** Equivalent conflicts with reversed labels converge to one deterministic representation.
  - **Recovery lineage.** Recovery origins are immutable links. Repeated recoveries are valid; cycles and missing ancestors are rejected.
  - **Attachment order.** An optional `attachmentOrder` on entries carries attachment order. Order merge never deletes or revives media.
- **Local storage**
  - **Bulk applies.** They use 50-row batches inside one transaction, under SQLite's bind limit.
  - **Unchanged applies.** These skip materialization, with a second generation check.
- **Retention**
  - **What cleanup keeps:** heads, the 3 newest snapshots and a 30-day grace window.
  - **What cleanup deletes:** a snapshot only when one covering frontier covers it.
  - **Per-pass limits:** at most 10 candidates per pass, on a rotating cursor.
  - **Not covered:** remote media garbage collection.
- **Error classification**
  - **Local versus backup failures.** Local merge and candidate failures map to journal preparation, not "backup corrupt".
  - **HTTP 400** maps to `invalid-request`.
- **Performance**
  - **Single verification.** One verified-source resolver avoids hashing the same file several times.
  - **No repeat downloads.** Decoded snapshots are reused within one planning operation.

**Compatibility note.** Older clients reject these newer snapshot shapes:

- `createdAt` conflicts
- lineage chains
- `attachmentOrder`

Update iOS and Android together whenever the snapshot shape changes; the validator rejects unknown fields.
The `provider-request-rejected` pause reason is local state only, not snapshot data.

**Safeguards worth retaining**

- Durable publication stages, with upload verification before a head advances.
- Generation-checked local application, and reconciliation of edits made during sync.
- Hash verification, bounded decoding, strict shape checks and rejection of duplicate keys.
- Connection lifecycle coordination and revocation checks before publication.
- Retained media and conservative deletion.

**Last full validation (September 2026).**

- **Automated:** 236 Jest tests and 56 Bun tests passed.
- **Not yet done:** live cross-device verification on Google Drive.
