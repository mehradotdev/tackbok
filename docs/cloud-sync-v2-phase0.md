# Cloud sync v2, Phase 0: go/no-go report

Part of #185. Steps P1 (simulation harness and v1 baseline) and P2 (standalone
v2 model, property tests and measurements). Written 2026-11-17.

Everything below was run on a desktop (Apple M4, Bun 1.4.2). Nothing ran on a
phone, against Drive, or through the app's storage or UI. The v2 model is a
pure module (`apps/mobile/src/lib/cloudSync/v2/`) that nothing imports.

## Verdict: GO with changes

The model holds. Across 240,000 random checks per algebraic property and
26,000 simulated multi-device histories, the v2 join was commutative,
associative and idempotent on canonical bytes, every device converged, and the
oracle found no lost text, no lost entry, no lost "keep" and no replaced value
coming back. Four deliberately broken joins were all caught, so the tests can
fail.

It holds **only after two changes to the design report's model**. As written,
the report's model is not associative; minimal counterexamples are in section
5 and in `v2-scenarios.test.ts`. The changes, which 2.0.0 must adopt:

1. **A version vector per record**, not one per snapshot.
2. **A deleted record keeps its values behind its tombstone**, and whether it
   is shown is decided when reading, not by the join.

Consequences that become requirements for 2.0.0:

3. **Compaction of deleted records must ship with 2.0.0**, not later. Change 2
   keeps deleted text in snapshots until every device has seen the delete.
   That is a privacy regression against v1 (which drops it at once, apart from
   30 days of old snapshots) and a growth cost (about 7% of gzip size at a 5%
   delete rate in the measured journal). The rule is sketched in section 8 and
   needs its own property test before release.
4. **Tag and prompt IDs derived from the title need a display-level merge as
   well**, for the one case they cannot handle: a rename onto a title another
   device creates offline (section 6).

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
add or remove a tag or attachment, create, rename or delete a tag or prompt,
set the profile name or photo, sync, and clock changes (skews of minutes,
hours or years, including backward jumps; 30% of cases use one-day clock
resolution so devices often write the same HLC). Events are intents
resolved when they run, so a failing case shrinks by replaying subsets; a
failure prints its seed and the shrunk event list. After the random events,
every device syncs with every other until nothing changes.

The **oracle** reads only what each device shows. It tracks which events each
device has seen (a set that grows on sync) and checks:

- **converged:** all devices have byte-identical canonical state;
- **lost text:** a title, text or profile name written by an event is still
  shown, unless an event that had seen that write removed it on purpose (an
  edit of it, a delete of its entry, or a "keep" of another version). A value
  a "keep" chose is protected against a concurrent keep or delete, but an
  edit of that value replaces it;
- **lost entry:** an entry with an edit that no delete of it had seen is shown;
- **stale value:** a value that an edit or keep in the same entry replaced,
  having seen every write of it there, does not come back;
- **undone delete:** an entry every edit of which a delete had seen stays
  deleted (a v1 metric; a failure for v2);
- **duplicate titles:** shown tags or prompts with the same normalised title.

**v1 runs through the real engine.** Each device is a `SnapshotSyncEngine`
with its own SQLite sync state, sharing one fake Drive, so merge bases are
found as on a phone. Local edits change the journal the way the repositories
do (tombstones with `deletedStateHash`, tag deletion re-saving tagged entries,
the capture's pruning of recovery IDs, a pristine profile on a fresh install).
Retention cleanup, the ancestor download budget, kill points and Wi-Fi-only
media are not modelled; they only remove merge bases, so **the v1 numbers are
a lower bound**. A v1 "sync" is one engine pass against every head (the real
topology). v2 is run both pairwise and the same Drive-style way.

## 2. v1 baseline

3,000 cases (seeds 1-3,000, `SYNC_SIM_SCALE=10`); CI pins seeds 1-300 in
`fixtures/v1-sim-baseline.json`, so the harness is green on main and any
change in v1 behaviour shows up as a diff.

| Metric (cases with at least one)                         | v1, 3,000 cases | v2, 26,000 cases             |
| -------------------------------------------------------- | --------------- | ---------------------------- |
| Devices disagree after the final round                   | 0               | 0                            |
| Authored text lost                                       | 41 (1.4%)       | 0                            |
| ...of which a version a "keep" chose                     | 41              | 0                            |
| ...both of two concurrently kept versions lost           | 0               | 0                            |
| Entry deleted although an edit was unseen by its deleter | 12 (0.4%)       | 0                            |
| A replaced value shown again                             | 224 (7.5%)      | 0                            |
| A delete undone without an unseen edit                   | 27 (0.9%)       | 0                            |
| Duplicate tag or prompt titles                           | 392 (13%)       | 364 (1.4%), all from renames |
| Sync paused (merge or validation error)                  | 0               | 0                            |

What the shrunk v1 failures are:

- **Lost kept version** (the #182 rule by design): two devices keep different
  versions; `keepOneVersion` brings back exactly one and the other device's
  choice is gone everywhere.
- **Lost entry**: device A edits a title it has not published; device B
  deletes the entry. A's next merge picks B's earlier value as the primary
  (its `updatedAt` is not newer), which then equals the base, so the delete
  wins. A's text survives only as a recovered copy, which has no photos.
- **Stale value**: an edit, then a delete on one device, a mood change on
  another: the entry returns with the text from before the edit.
- **Convergence**: none in this harness. v1's order dependence shows up as
  _which_ version survives, not as devices disagreeing; base-less merges
  (audit N1) are where disagreement and duplicates come from, and they are
  not modelled.

## 3. v2 results

**Algebraic properties** (`v2-properties.test.ts`). States are every state a
device held during random 2-6 device histories; a quarter are "damaged"
copies with random records removed but their context kept. Comparisons are on
canonical bytes.

| Property                                                | CI checks | Local checks (10x) | Failures |
| ------------------------------------------------------- | --------- | ------------------ | -------- |
| `join(a,b) = join(b,a)`                                 | 24,000    | 240,000            | 0        |
| `join(join(a,b),c) = join(a,join(b,c))`                 | 24,000    | 240,000            | 0        |
| `join(a,a) = a`                                         | 24,000    | 240,000            | 0        |
| `join(join(a,b),a) = join(a,b)`                         | 24,000    | 240,000            | 0        |
| result validates, encodes and decodes to the same bytes | 24,000    | 240,000            | 0        |
| a record missing on one side comes through unchanged    | 24,000    | 240,000            | 0        |

Coverage of the CI run (share of sampled joins that exercise a rule): open
conflict 33%, returned entry 41%, hidden (deleted) entry 54%, items replaced
during the join 2.6%, tag kept alive by a concurrent add 1.0%, two different
tombstones joined 3.4%, last-writer-wins tie on equal HLC 0.27%. The test
fails if any of these drops below 0.2%.

**Negative controls**, which must fail and do: absence treated as deletion
(the report's alternative E), a last-writer-wins tie broken by argument order,
tombstones not joined, and replaced values kept as a union. The union is still
a lattice, so only the simulation's stale-value check catches it; the
tie-break mutant first survived, which showed the generator never produced
equal HLCs, and led to the coarse-clock cases.

**N-device simulation** (`v2-simulation.test.ts`): pairwise syncs 2,000
cases in CI and 20,000 locally (848,000 events); Drive-style 600 and 6,000.
No failure of any oracle check, including stale values and undone deletes.

**Scenarios** (`v2-scenarios.test.ts`, 30 tests), each checked in every join
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
  at once makes one new entry;
- clocks: a causally later edit wins although its device is a year behind;
  stamps keep rising when the wall clock jumps back years; a device 30 years
  ahead drags the HLC forward but every order agrees; equal HLCs break ties by
  device ID; the HLC refuses to overflow;
- the envelope rules in section 7.

Not restated, because v2 has no equivalent: recovery IDs and their lineage,
conflict-record IDs, legacy same-blob profile photos (no v1 conversion is
planned), and "a base-less merge adds nothing" (there is no base).

## 4. Invariants, and where each is checked

| Invariant                                                                        | Checked by                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| No authored title or text disappears unless a write that had seen it replaced it | oracle "lost text", 26,000 cases                                                                                         |
| A delete never removes an entry with an edit the deleter had not seen            | oracle "lost entry"; scenario "edit beats delete"                                                                        |
| A delete that saw every edit stays a delete                                      | oracle "undone delete"                                                                                                   |
| A missing record never deletes                                                   | property "missing record comes through unchanged" (240,000); scenario for a missing record next to a third device's edit |
| Two devices keeping different versions never lose both                           | oracle "lost kept version" and "both lost"; #182 scenarios                                                               |
| A replaced value never comes back                                                | oracle "stale value"                                                                                                     |
| All devices byte-identical after the final round                                 | oracle "converged", both topologies                                                                                      |

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
have to stay in the state. **v2 keeps them**: a record and its tombstone are
both kept, the join is a plain product of lattices, and `isLive` decides what
is shown: shown unless a delete had seen every write to the record.

**5.2 One context per snapshot breaks "absence is not deletion".** If b lost a
record (a capture bug, or a wiped journal with a surviving context) while its
context covers device C's newer value `z`, then `(a⊔b)⊔c` keeps a's stale
record with b's context, and meeting c drops both a's `x` (C replaced it) and
c's `z` (b's context covers it): the text is gone. `a⊔(b⊔c)` keeps `z`. This
is the failure the report adds tombstones to prevent. **v2 gives each record
its own version vector**, so a snapshot without the record says nothing
about it. Measured cost: part of the 7% raw size difference below; most
records have one or two devices in their vector.

**5.3 Smaller changes.**

- _Liveness uses the record's version vector_, which includes replaced values
  and last-writer-wins losers. A mood edit that loses a tie to the deleter's
  own earlier mood still counts as an edit the deleter had not seen.
- _Equal values are not collapsed in the state_, only when reading. Collapsing
  during the join is not associative (a dropped duplicate's stamp can be the
  one a third state relies on).
- _An edit replaces only the value it was made from_; other open versions
  stay. "Keep this one" replaces all of them with one new write of the chosen
  value. The new write is what keeps two different keeps from erasing each
  other.
- _Removing a tag or attachment is an edit_ (it adds a stamp), so it beats a
  concurrent delete as in v1. Removing a tag from entries because the tag was
  deleted is not, so a tag deletion never brings back an entry.
- _A tag is shown while it is live or a live entry still has it_: a concurrent
  add beats the tag's delete.
- _"Keep both"_ writes the kept value again and moves the other to a new entry
  whose ID is `hash(entry, field, moved value's stamp)`. The new entry copies
  the shown title or text, mood, date and tags; attachments stay with the
  original because a blob belongs to one entry.
- _`born` and `updatedAt` are gone_: every record has a date register and a
  version vector, which say the same.
- _Media descriptors_ are joined as a set and kept exactly while something
  references them, including a deleted record or an open photo version.
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
normalised title is the app's sanitiser, then NFC, then `toLowerCase()`.
Two devices creating "Work" and " work" offline get one tag.

- _Delete, then re-create_: the same ID; the new write revives the record with
  the new title. Memberships removed by the delete stay removed.
- _Rename_: the ID keeps the title it was created with. Re-creating the old
  title then must not rename the tag back, so creation takes the next derived
  ID (`hash(..., attempt)`) while the first one is held by a live tag with a
  different title. Devices that agree on which tags are live pick the same ID.
- _Real problem_: a rename onto a title another device creates offline gives
  two tags with the same title (a test pins it). In the simulation all 1.4% of
  duplicate cases are this (v1: 13%, from any concurrent creation). So
  deterministic IDs plus the fallback, **merging same-title tags on display**,
  are both needed; the fallback alone would also work but leaves more
  duplicates in the data.

## 7. Envelope

`bytes = canonical header JSON + "\n" + gzip(canonical body JSON)`;
`snapshotId = SHA-256(header bytes)`. The header carries format, `major: 2`,
`features: {required, optional}`, `kind: "full"` (`"delta"` reserved),
`since: null` (reserved), `codec: "gzip"`, `encryption: "none"`, body hash and
size (over the canonical uncompressed body, so identity does not depend on one
gzip implementation), vault, author, sequence, time, roster, context and
`floor` (null until compaction). The header decodes on its own, before the
body.

An unknown major version, required feature, codec, encryption or `kind:
"delta"` throws `SnapshotUpdateRequiredError` ("pause and ask to update; never
write or delete"); unknown optional features are ignored. Decoding is strict:
canonical bytes for header and body, closed shapes, sorted and unique
collections, stamps inside their record's vector, vectors inside the context,
devices on the roster, references to existing records and media, exactly the
referenced media, and the v1 size caps. Tests cover each refusal.

## 8. Size and time

Synthetic journals (assumed shape: 70% titled, text around 400 characters,
80% with a mood, 0-3 of 25 tags, 15% with photos, 5% deleted; three devices,
1-4 writes per entry, 1% open conflicts). A "merge" joins two devices that
each changed 1% of entries; each side is a separate copy, as after two
downloads. `bun scripts/cloud-sync/v2-measure.ts`. **Desktop numbers.**

| Entries | Text    | v1 raw  | v1 gzip | v2 raw  | v2 gzip | v2 gzip without deleted records | v1 encode | v2 encode | v2 decode | v1 merge | v2 join |
| ------- | ------- | ------- | ------- | ------- | ------- | ------------------------------- | --------- | --------- | --------- | -------- | ------- |
| 1,000   | 419 KiB | 868 KiB | 189 KiB | 919 KiB | 212 KiB | 203 KiB                         | 29 ms     | 31 ms     | 29 ms     | 4 ms     | 1 ms    |
| 5,000   | 2.1 MiB | 4.3 MiB | 950 KiB | 4.5 MiB | 1.1 MiB | 1.0 MiB                         | 135 ms    | 148 ms    | 135 ms    | 19 ms    | 8 ms    |
| 10,000  | 4.1 MiB | 8.4 MiB | 1.8 MiB | 9.0 MiB | 2.1 MiB | 2.0 MiB                         | 269 ms    | 293 ms    | 274 ms    | 40 ms    | 18 ms   |

- v2 is **7% larger raw and 15% larger gzipped** at 10,000 entries (8% without
  the retained deleted records). The report estimated 2-3 MB extra raw; the
  measured extra is 0.6 MiB. The 16 MiB compressed cap would be reached near
  75,000 entries of this shape (v1: about 85,000).
- The join is cheaper than the v1 merge. Encoding and decoding (canonical
  JSON, SHA-256 in JavaScript, gzip) dominate in both formats and cost about
  the same.
- **Phones, cautiously:** Hermes has no JIT and a mid-range Android is slower
  again, so expect roughly 10-30x these times: a 10,000-entry encode or
  decode of 3-9 seconds, a join of 0.2-0.5 seconds. That is the same order as
  v1 today, and it argues for moving encode and decode off the JS thread
  (P14). Not measured on a device.

## 9. What remains uncertain

- **Compaction is unproven.** Deleted records, tombstones and the roster all
  need it, and change 2 makes it a 2.0.0 requirement. Sketch: a deleted
  record's values can be dropped (keeping its vector and tombstone) once every
  device on the roster has a context covering the record's vector; a device
  returning with a context below `floor` must not resurrect what was
  compacted. This needs its own property tests, with compaction steps in the
  simulation, before it ships.
- **A known wart:** a "keep" on one device concurrent with an edit of the same
  version on another re-opens a conflict between the kept text and the edit.
  Nothing is lost; the user sees one more choice. Fixing it needs edit lineage
  and was not attempted.
- **A device with a clock years ahead** drags every HLC forward. Correct, but
  "newest" then means causal order, not wall time. A skew warning may be
  worth adding.
- **The oracle is string-based** for text and entry-based for deletes. It
  does not check that a returned entry has every tag and photo (scenarios
  do), and last-writer-wins fields lose concurrent values by design.
- **Engine-level behaviour is untested for v2**: kill points, deferred media,
  stamps for attachments at first publication, the local SQLite schema and
  the context written in the same transaction as the data. Those are P3-P6.
- **Phone timings** are extrapolated, not measured.
- **v1 numbers are a lower bound**: retention and the ancestor budget are not
  modelled.
