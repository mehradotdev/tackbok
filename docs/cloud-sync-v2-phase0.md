# Cloud sync v2, Phase 0: go/no-go report

Part of #185. Steps P1 (simulation harness and v1 baseline) and P2 (standalone
v2 model, property tests and measurements). Written 2026-11-17.

Everything below ran on a desktop (Apple M4, Bun 1.4.2). Nothing ran on a
phone, against Drive, or through the app's storage or UI. The v2 model is a
pure module (`apps/mobile/src/lib/cloudSync/v2/`) that nothing imports.

## Verdict: GO with changes

The model holds. Across 240,000 random checks per algebraic property and
26,000 simulated multi-device histories, the v2 join was commutative,
associative and idempotent on canonical bytes, every device converged, and the
oracle found no lost text, entry, tag, attachment or "keep", and no replaced
value coming back. Five deliberately broken joins were all caught, so the
tests can fail. Four independent reviewers found no counterexample to the
algebra on well-formed states.

It holds **only after two changes to the design report's model**. As written,
the report's model is not associative; minimal counterexamples are in section
5 and in `v2-scenarios.test.ts`. The changes, which 2.0.0 must adopt:

1. **A version vector per record**, not one per snapshot.
2. **A deleted record keeps its values behind its tombstone**, and whether it
   is shown is decided when reading, not by the join.

Consequences and invariants that become requirements for 2.0.0:

3. **Compaction of deleted records must ship with 2.0.0**, not later. Change 2
   keeps deleted text in snapshots until every device has seen the delete: a
   privacy regression against v1 (which drops it at once, apart from 30 days
   of old snapshots) and a growth cost (6% of gzip size at a 5% delete rate in
   the measured journal). The rule is sketched in section 9 and needs its own
   property test before release.
4. **Tag and prompt IDs derived from the title also need a display-level
   merge**, for the one case they cannot handle: a rename onto a title another
   device creates offline (section 6).
5. **Engine invariants the model relies on** (P3-P6): a new device ID whenever
   local state is lost (wipe, reinstall, OS restore), never a reused one; an
   asset ID belongs to one owner forever (the join refuses two descriptors
   for one ID rather than pick one); the capture is exact at item level (a
   record whose vector covers a tag or attachment it no longer lists reads as
   a removal); and a bound on how far ahead of local time a snapshot's context
   may be, so one bad clock cannot drag every HLC to the cap.

The fallback in #185 (lineage on tombstones, synced resolution records) is not
needed.

## 1. What was built

| Step            | Files                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P1 harness      | `apps/mobile/scripts/cloud-sync/sim/{random,driver,v1Adapter}.ts`, `v1-simulation.test.ts`, `fixtures/v1-sim-baseline.json` |
| P2 model        | `apps/mobile/src/lib/cloudSync/v2/{types,clock,join,ops,view,ids,codec}.ts`                                                 |
| P2 tests        | `scripts/cloud-sync/sim/v2Adapter.ts`, `v2-properties.test.ts`, `v2-simulation.test.ts`, `v2-scenarios.test.ts`             |
| P2 measurements | `scripts/cloud-sync/v2-measure.ts`                                                                                          |

**Harness.** A case is a seeded list of events on 2 to 6 devices: create an
entry, edit title, text, mood or date, delete, "keep this one", "keep both",
"got it" on a returned entry, add or remove a tag or attachment, reorder
attachments, create, rename or delete a tag or prompt, set the profile name
or photo, sync, and clock changes (skews of minutes, hours or years,
including backward jumps; 30% of cases use one-day clock resolution so
devices often write the same HLC). Events are intents resolved when they run,
and each event's time depends only on its original index, so a failing case
shrinks by replaying subsets; a failure prints its seed and the shrunk event
list. After the random events every device syncs with every other until
nothing changes (a case that has not settled after 6 rounds fails).

The **oracle** reads only what each device shows. It tracks which events each
device has seen (a set that grows on sync) and checks:

- **converged:** all devices have byte-identical canonical state;
- **lost text:** a title, text or profile name written by an event is still
  shown, unless an event that had seen that write removed it on purpose (an
  edit of it, a delete of its entry, or a "keep" of another version). A value
  a "keep" chose is protected against a concurrent keep or delete, but an
  edit of that value replaces it;
- **lost membership:** a tag or attachment added to an entry is still on it
  wherever the entry is shown, unless a remove, a tag delete or an entry
  delete that had seen the add took it off;
- **lost entry:** an entry with an edit (a keep included) that no delete of it
  had seen is shown;
- **stale value:** a value that an edit or keep in the same entry replaced,
  having seen every write of it there, does not come back;
- **undone delete:** an entry every edit of which a delete had seen stays
  deleted (a v1 metric; a failure for v2);
- **duplicate titles:** shown tags or prompts with the same normalised title.

Mood and date are last-writer-wins by design and only checked through the
"lost entry" rule; profile photos only through scenarios.

**v1 runs through the real engine.** Each device is a `SnapshotSyncEngine`
with its own SQLite sync state, sharing one fake Drive, so merge bases are
found and retention cleanup runs as on a phone. Local edits change the
journal the way the repositories do (tombstones with `deletedStateHash`, tag
deletion re-saving tagged entries, the capture's pruning of recovery IDs, a
pristine profile on a fresh install, profile stamps that never go backwards).
A case spans days, not the 30-day retention window; kill points, Wi-Fi-only
media, long offline periods and the ancestor download budget are not
modelled. Those only remove merge bases, so **the v1 numbers are a lower
bound**. A v1 "sync" is one engine pass against every head (the real
topology); v2 is run both pairwise and the same Drive-style way.

## 2. v1 baseline

3,000 cases (seeds 1-3,000, `SYNC_SIM_SCALE=10`); CI pins seeds 1-300 in
`fixtures/v1-sim-baseline.json`, so the harness is green on main and any
change in v1 behaviour shows up as a diff of named seeds.

| Metric (cases with at least one)                        | v1, 3,000 cases | v2, 26,000 cases             |
| ------------------------------------------------------- | --------------- | ---------------------------- |
| Devices disagree after the final round                  | 0               | 0                            |
| Final round never settles                               | 0               | 0                            |
| Authored text lost                                      | 41 (1.4%)       | 0                            |
| ...of which a version a "keep" chose                    | 41              | 0                            |
| ...both of two concurrently kept versions lost          | 0               | 0                            |
| Entry deleted although an edit or keep was unseen by it | 57 (1.9%)       | 0                            |
| Tag or attachment lost                                  | 3 (0.1%)        | 0                            |
| A replaced value shown again                            | 221 (7.4%)      | 0                            |
| A delete undone without an unseen edit                  | 16 (0.5%)       | 0                            |
| Duplicate tag or prompt titles                          | 393 (13%)       | 423 (1.6%), all from renames |
| Sync paused (merge or validation error)                 | 0               | 0                            |

What the shrunk v1 failures are:

- **Lost kept version** (the #182 rule by design): two devices keep different
  versions; `keepOneVersion` brings back exactly one and the other device's
  choice is gone everywhere.
- **Lost entry**: either a keep versus a concurrent delete of the kept copy,
  or device A edits a title it has not published while device B deletes the
  entry; A's next merge picks B's earlier value as the primary (its
  `updatedAt` is not newer), which then equals the base, so the delete wins.
  A's text survives only as a recovered copy, which has no photos.
- **Stale value**: an edit, then a delete on one device, a mood change on
  another: the entry returns with the text from before the edit. Also a
  replaced profile name still offered as an alternate.
- **Convergence**: none in this harness. v1's order dependence shows up as
  _which_ version survives, not as devices disagreeing; base-less merges
  (audit N1) are where disagreement and duplicates come from, and they are not
  reached here.

## 3. v2 results

**Algebraic properties** (`v2-properties.test.ts`). States are every state a
device held during random 2-6 device histories, plus a quarter "damaged"
copies with random entries and prompts removed but their context kept, and a
mix focused on last-writer-wins ties. Comparisons are on canonical bytes;
idempotence and absorption join a state with a deep copy of itself.

| Property                                                | CI checks | Local checks (10x) | Failures |
| ------------------------------------------------------- | --------- | ------------------ | -------- |
| `join(a,b) = join(b,a)`                                 | 24,000    | 240,000            | 0        |
| `join(join(a,b),c) = join(a,join(b,c))`                 | 24,000    | 240,000            | 0        |
| `join(a,a) = a`                                         | 24,000    | 240,000            | 0        |
| `join(join(a,b),a) = join(a,b)`                         | 24,000    | 240,000            | 0        |
| result validates, encodes and decodes to the same bytes | 24,000    | 240,000            | 0        |
| a record missing on one side comes through unchanged    | 24,000    | 240,000            | 0        |

Coverage of the 10x run (share of sampled joins that exercise a rule): open
conflict 32%, returned entry 40%, deleted entry 54%, two different tombstones
joined 4.4%, acknowledged return 6.4%, items replaced during the join 2.6%,
tag kept alive by a concurrent add 1.3%, attachment order set 0.7%,
last-writer-wins tie on equal HLC 0.29%. The test fails if any drops below
0.2%.

**Negative controls**, which must fail and do: absence treated as deletion
(the report's alternative E), a last-writer-wins tie broken by argument order,
tombstones not joined, shared versions dropped from open conflicts, and
replaced values kept as a union. The union is still a lattice, so only the
simulation's stale-value check catches it. The tie-break mutant first
survived, which showed the generator never produced equal HLCs, and led to
the coarse-clock and tie-focused cases.

**N-device simulation** (`v2-simulation.test.ts`): pairwise syncs 2,000
cases in CI and 20,000 locally (848,000 events); Drive-style 600 and 6,000. No
failure of any oracle check.

**Scenarios** (`v2-scenarios.test.ts`, 34 tests), each checked in every join
order:

- restated `merge.test.ts` cases: field-by-field merging, concurrent edits as
  versions inside one entry, attachments versus order, delete versus an
  unchanged copy, edit beats delete (returned whole with photos and tags, "Got
  it" syncs), profile adoption, clear versus rename, replaced profile photos;
- #182 limit 1: three devices keeping, keeping and editing different
  versions, with a fourth deleting the entry: nothing lost;
- #182 limit 2: a version dismissed long ago never returns; a device that
  missed the dismissal and keeps it later keeps it;
- two devices keeping the same version resolve it; "Keep both" on two devices
  at once makes one new entry, leaves a third version open, and brings back a
  split entry deleted meanwhile;
- clocks: a causally later edit wins although its device is a year behind;
  stamps keep rising when the wall clock jumps back years; a device 30 years
  ahead drags the HLC forward but every order agrees; equal HLCs break ties by
  device ID; the HLC refuses to pass the timestamp cap;
- tags: same title offline, a concurrent add beats a tag delete, a tag delete
  never revives an entry, delete and re-create, re-creating a title a tag was
  renamed away from, a delete and re-create never undoing a rename seen first;
- the envelope rules in section 7.

Not restated, because v2 has no equivalent: recovery IDs and their lineage,
conflict-record IDs, legacy same-blob profile photos (no v1 conversion is
planned), and "a base-less merge adds nothing" (there is no base).

## 4. Invariants, and where each is checked

| Invariant                                                                        | Checked by                                                                         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| No authored title or text disappears unless a write that had seen it replaced it | oracle "lost text", 26,000 cases                                                   |
| A delete never removes an entry with an edit the deleter had not seen            | oracle "lost entry"; scenario "edit beats delete"                                  |
| A delete that saw every edit stays a delete                                      | oracle "undone delete"                                                             |
| A missing record never deletes                                                   | property "missing record comes through unchanged"; scenario next to a third device |
| Two devices keeping different versions never lose both                           | oracle "lost kept version" and "both lost"; #182 scenarios                         |
| A replaced value never comes back                                                | oracle "stale value"                                                               |
| All devices byte-identical after the final round                                 | oracle "converged", both topologies                                                |

"A missing record never deletes" holds for whole records. Inside a record, a
tag or attachment the record's vector covers but the record no longer lists
reads as removed; that is how removal works, so the capture must be exact.

## 5. Changes to the design report's model, and why

**5.1 Rule 2 as written is not associative.** The report's own suspicion was
right. With one context per snapshot and "one side has the record, the other
only a tombstone: keep it whole if a stamp escapes, drop it otherwise":

- a: the entry with text `x`, plus a mood edit on device A that nobody saw;
- b: device B replaced `x` with `y`;
- c: device C saw `y`, then deleted the entry.

`(a⊔b)⊔c` keeps the entry with `y`. `a⊔(b⊔c)` first drops b's record (all its
stamps are covered), losing `y`; a's record then escapes the tombstone and
comes back whole with `x`, a value B had replaced. Any associative "kept
whole" rule must still know `y` after `b⊔c`, so the deleted record's values
have to stay in the state (this holds with per-record vectors too). **v2
keeps them**: a record and its tombstone are both kept, the join is a plain
product of lattices, and `isLive` decides what is shown: shown unless a delete
had seen every write to the record.

**5.2 One context per snapshot breaks "absence is not deletion".** If b lost a
record (a capture bug, or a wiped journal with a surviving context) while its
context covers device C's newer value `z`, then `(a⊔b)⊔c` keeps a's stale
record with b's context, and meeting c drops both a's `x` (C replaced it) and
c's `z` (b's context covers it): the text is gone. `a⊔(b⊔c)` keeps `z`. This is
the failure the report adds tombstones to prevent. **v2 gives each record its
own version vector**, so a snapshot without the record says nothing about it.
Most records have one or two devices in their vector; the cost is inside the
measured size difference below.

**5.3 Smaller changes.**

- _Liveness uses the record's version vector_, which includes replaced values
  and last-writer-wins losers. A mood edit that loses a tie to the deleter's
  own earlier mood still counts as an edit the deleter had not seen.
- _Equal values are not collapsed in the state_, only when reading. Collapsing
  during the join is not associative (a dropped duplicate's stamp can be the
  one a third state relies on).
- _An edit replaces only the value it was made from_ (and equal copies of it);
  other open versions stay. "Keep this one" replaces all of them with one new
  write of the chosen value. The new write is what keeps two different keeps
  from erasing each other.
- _"Keep both"_ writes the kept value again, moves the other to a new entry
  whose ID is `hash(entry, field, moved value's stamp)`, and leaves any third
  version open. The new entry copies the shown title or text, mood, date and
  tags; attachments stay with the original because a blob belongs to one
  entry. If the new entry exists but was deleted, the moved value is written
  into it again.
- _"Got it"_ stores the deletes it acknowledged (a vector), not a stamp, so a
  later concurrent delete shows its notice again whatever the clocks say.
- _Removing a tag or attachment is an edit_ (it adds a stamp), so it beats a
  concurrent delete as in v1. Removing a tag from entries because the tag was
  deleted is not, so a tag deletion never brings back an entry.
- _A tag is shown while it is live or a live entry still has it_: a concurrent
  add beats the tag's delete. Only a shown tag can be added.
- _`born` and `updatedAt` are gone_: every record has a date register and a
  version vector, which say the same.
- _Media descriptors_ are joined as a set and kept exactly while something
  references them, including a deleted record or an open photo version. Two
  different descriptors for one asset ID are refused (`asset-id-collision`).
- _The HLC_ is capped at the snapshot timestamp cap, so a state that cannot be
  published is never written.
- _Roster `lastSeenAt`_ is the device's HLC at its last write; `markSeen`
  puts a publishing device on the roster.

## 6. Tags and prompts

**What the app does today: both are case-insensitive.** The owner's belief
that prompts are case-sensitive does not match the code:

- prompts: the UI refuses duplicates by `sanitizePromptTitle(...).toLowerCase()`
  (`screens/gratitudeEntry/PromptLibraryModal.tsx:88-93`), the repository
  refuses them with SQL `lower(title) = lower(?)` (`assertUniqueTitle`,
  `lib/cloudSync/storage/repositories.ts:423-441`, used at `:547` and `:571`),
  and import de-duplicates by lowercase (`lib/backupImport/portable.ts:232`,
  `:517`);
- tags: the same SQL check, `normalizeTagTitle` (`TagsModal.tsx:60`) and
  import (`portable.ts:465`).

Two inconsistencies worth knowing: SQLite's `lower()` folds only ASCII while
the UI's `toLowerCase()` folds all of Unicode, so "Äpfel" and "äpfel" pass the
repository check if they bypass the UI (for example through import); and
`sanitizeTagName` does not collapse inner whitespace while
`sanitizePromptTitle` does.

**v2 rule.** `namedId = hash(kind, vault, normalised title)` where the
normalised title is the app's sanitiser, then NFC, then `toLowerCase()`. Two
devices creating "Work" and " work" offline get one tag.

- _Delete, then re-create_: the same ID, if the deleted record still has that
  title; the new write revives it. Memberships removed by the delete stay
  removed.
- _Rename_: the ID keeps the title it was created with. Creating a title must
  never take over a tag renamed away from it, so creation moves to the next
  derived ID (`hash(..., attempt)`) while the ID is held by a record with a
  different title, live or deleted. Devices that agree on the records pick the
  same ID.
- _Real problem_: a rename onto a title another device creates offline gives
  two tags with the same title (a test pins it). Replaying 4,000 simulated
  cases, every case with duplicates contained a rename; none did without. So
  deterministic IDs plus the fallback, **merging same-title tags on display**,
  are both needed. The fallback alone would also work but leaves many more
  duplicates in the data (v1: 13% of cases).

## 7. Envelope

`bytes = canonical header JSON + "\n" + gzip(canonical body JSON)`;
`snapshotId = SHA-256(header bytes)`. The header carries format, `major: 2`,
`features: {required, optional}`, `kind: "full"` (`"delta"` reserved),
`since: null` (reserved), `codec: "gzip"`, `encryption: "none"`, body hash and
size (over the canonical uncompressed body, so identity does not depend on one
gzip implementation), vault, author, sequence, time, roster, context, `floor`
(null until compaction) and `ext`. The header decodes on its own, before the
body.

Format, major version, required features, codec, encryption and `kind:
"delta"` are read **before** the closed shape is checked, so a newer layout
always throws `SnapshotUpdateRequiredError` ("pause and ask to update; never
write or delete") rather than "corrupt". New fields arrive only under `ext`
(in the header and the body), keyed by the feature that defines them; data
under an unknown optional feature is ignored, undeclared keys are refused.
Decoding is otherwise strict: canonical bytes for header and body, closed
shapes, sorted and unique collections, stamps inside their record's vector,
vectors and `floor` inside the context, devices on the roster, references to
existing records and media, exactly the referenced media, and the v1 size
caps. Tests cover each refusal.

## 8. Size and time

Synthetic journals (assumed shape: 70% titled, text around 400 characters,
80% with a mood, 0-3 of 25 tags, 15% with photos, 5% deleted; three devices,
1-4 writes per entry, 1% open conflicts). A "merge" joins two devices that
each changed 1% of entries; each side is a separate copy, as after two
downloads. `bun scripts/cloud-sync/v2-measure.ts`. **Desktop numbers.**

| Entries | Text    | v1 raw  | v1 gzip | v2 raw  | v2 gzip | v2 gzip without deleted records | v1 encode | v2 encode | v2 decode | v1 merge | v2 join |
| ------- | ------- | ------- | ------- | ------- | ------- | ------------------------------- | --------- | --------- | --------- | -------- | ------- |
| 1,000   | 419 KiB | 868 KiB | 189 KiB | 919 KiB | 213 KiB | 203 KiB                         | 28 ms     | 31 ms     | 28 ms     | 4 ms     | 1 ms    |
| 5,000   | 2.1 MiB | 4.3 MiB | 950 KiB | 4.5 MiB | 1.1 MiB | 1.0 MiB                         | 134 ms    | 147 ms    | 132 ms    | 18 ms    | 7 ms    |
| 10,000  | 4.1 MiB | 8.4 MiB | 1.8 MiB | 9.0 MiB | 2.1 MiB | 2.0 MiB                         | 264 ms    | 293 ms    | 262 ms    | 35 ms    | 14 ms   |

- v2 is **7% larger raw and 15% larger gzipped** at 10,000 entries (8%
  without the retained deleted records; that column removes deleted records
  entirely, so real compaction, which keeps each one's vector and tombstone,
  saves somewhat less). The report estimated 2-3 MB extra raw; the measured
  extra is 0.6 MiB. The 16 MiB compressed cap would be reached near 75,000
  entries of this shape (v1: about 85,000).
- The join is cheaper than the v1 merge. Encoding and decoding (canonical
  JSON, SHA-256 in JavaScript, gzip) dominate in both formats and cost about
  the same.
- **Phones, cautiously:** Hermes has no JIT and a mid-range Android is slower
  again, so expect roughly 10-30x these times: a 10,000-entry encode or
  decode of 3-9 seconds, a join of 0.15-0.5 seconds. That is the same order as
  v1 today, and it argues for moving encode and decode off the JS thread
  (P14). Not measured on a device.

## 9. What remains uncertain

- **Compaction is unproven.** Deleted records, tombstones and the roster all
  need it, and change 2 makes it a 2.0.0 requirement. Sketch: a deleted
  record's values can be dropped (keeping its vector and tombstone, which
  needs a "values compacted" record shape the codec does not have yet) once
  every device on the roster has a context covering the record's vector; a
  device returning with a context below `floor` must not resurrect what was
  compacted, and the join does not consult `floor` yet. This needs its own
  property tests, with compaction steps in the simulation, before it ships.
- **A known wart:** a "keep" on one device concurrent with an edit of the same
  version on another re-opens a conflict between the kept text and the edit.
  Nothing is lost; the user sees one more choice. Fixing it needs edit lineage
  and was not attempted.
- **Clock skew**: a device with a clock years ahead drags every HLC forward.
  Correct, but "newest" then means causal order, not wall time, and a clock
  near the cap would stop writes. The engine needs a bound (requirement 5).
- **The oracle** is string-based for text (a value that also lives in a copy
  counts as removed when the copy is deleted; only v1 recovered copies and
  "keep both" make copies) and treats what a device has merged as seen. It
  does not check mood or date beyond the entry rule, or profile photos except
  in scenarios.
- **Engine-level behaviour is untested for v2**: kill points, deferred media,
  stamps for attachments at first publication, the local SQLite schema and the
  context written in the same transaction as the data. Those are P3-P6.
- **Phone timings** are extrapolated, not measured.
- **v1 numbers are a lower bound**: long offline periods and the ancestor
  budget are not modelled.

## 10. Reviews

Four reviewers ran on each step (Claude Opus 5.5, DeepSeek V4.1 Flash, GLM-5.3
Flash, Gemini 3.8 Flash); none found a counterexample to commutativity,
associativity or idempotence on well-formed states. Their findings changed
the model (versioning before the closed shape, `ext`, the HLC cap, asset-ID
collisions refused, rename never undone by a re-create, "Keep both" with a
third version or a deleted split entry, acknowledgements as a vector,
sortedness and `floor` validated, records shown in ID order) and the tests
(idempotence on deep copies, a fifth negative control, generated
acknowledgements and reordering, tag and attachment loss, unsettled rounds,
replay at original times). The PR descriptions list what was not applied.
