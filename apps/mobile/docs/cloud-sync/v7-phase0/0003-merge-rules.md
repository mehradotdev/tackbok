# ADR V7-0003: complete merge rule table

Status: **proposed; plan-v7 §18.6 remains open until owner approval**  
Date: 2026-08-14

## Definitions

`B`, `L`, and `R` are the accepted base, current local, and remote values for a
stable ID. Equality means equality of normalized canonical bytes, not object
identity or wall-clock time.

The generic three-way operator is:

| Condition | Result |
| --- | --- |
| `L = B` and `R = B` | `B` |
| `L != B` and `R = B` | `L` |
| `L = B` and `R != B` | `R` |
| `L = R` | that common value |
| both changed differently | field-specific rule below |

When no readable base shadow exists, equal values collapse. Different authored
values use the field's conflict rule; additions with distinct stable IDs are
both kept; a deletion claim never wins over a live authored record merely
because it is newer. This is conservative two-way reconciliation.

For a deterministic primary where the table says **hash-primary**, encode each
candidate field value as canonical JSON, hash it, and choose the lower
lowercase SHA-256. This is a tie-break, not chronology. The other value is
retained in a conflict record. Timestamps and device IDs never choose authored
content.

## Envelope and system metadata

| Field | Merge/creation rule |
| --- | --- |
| `format`, `formatVersion`, `vaultId` | Must agree exactly; otherwise pause `unsupported-format` or `wrong-vault`. |
| `parentSnapshotIds` | IDs of all frontier snapshots directly consumed by this publication, sorted/deduplicated. More than eight active parents pauses `frontier-too-wide`; it is never truncated silently. |
| `observedDeviceHeads` | Per device, keep greatest sequence. Same device + same sequence + different snapshot IDs pauses `ambiguous-device-head`. Carry forward observations from all consumed snapshots and directly listed heads. |
| `authorDeviceId` | Publishing installation's device ID. |
| `deviceSequence` | Publishing installation's already-durable next sequence; never synthesized from a remote value. |
| `createdAt` | Publication time for display only. It does not affect domain merge or snapshot identity equality tests in golden domain assertions. |
| Collections | Merge by the stable keys in ADR V7-0001, then sort canonically. |

## Entries

| Field/state | Both changed differently | Retention rule |
| --- | --- | --- |
| `entryId` | Not mergeable | Stable key; a record carrying a different ID is a different record. |
| `title` | hash-primary + recovery | Preserve the losing branch's complete authored entry as a recovered entry. |
| `content` | hash-primary + recovery | Same as title; never put journal body text in a conflict record merely as a hash. The recovered entry contains it. |
| `mood` | hash-primary + conflict | Keep the alternate value in the conflict record. |
| `createdAt` | invalid mutation | It is immutable after first accepted appearance. A branch changing it is `invalid-snapshot`, not a conflict winner. |
| `updatedAt` | derived | Maximum `updatedAt` among the field contributors selected by the merge; display only. It never selects them. |
| `conflictOriginId` | derived | Null for ordinary records. A recovered entry points directly to the primary; cycles/chains are invalid. |

If title and body conflict in the same pair of branches, create one recovered
entry for the losing branch, not a Cartesian product. First merge all
non-conflicting fields. Choose the primary branch by the hash of the pair
`[title, content]`; the recovered record receives the losing branch's title and
content plus the merged non-conflicting mood/relations. Its stable ID is:

```text
recovered-<first 32 hex chars of SHA-256(
  canonical([primaryEntryId, baseStateHash|null,
             lowerBranchStateHash, higherBranchStateHash])
)>
```

Re-merging the same conflict therefore produces the same recovery ID. If that
ID already exists with different bytes, pause `derived-id-collision`.

## Tags and entry-tag relations

| Field/state | Both changed differently | Retention rule |
| --- | --- | --- |
| tag `tagId` | Stable key | Never title-based identity. |
| tag `title` | hash-primary + conflict | Alternate title is stored in the conflict record for review. |
| tag `createdAt` | invalid mutation | Immutable. |
| tag `updatedAt` | derived | Maximum contributor time, display only. |
| tag `conflictOriginId` | derived | Same direct-origin invariant as entries. |
| relation `(entryId, tagId)` | Boolean three-way set merge | Add/add keeps one; remove/unchanged removes; add/unchanged adds. The Boolean itself has no divergent both-changed case. |
| relation `createdAt` | minimum accepted value | Display only; a disagreement does not select membership. |

Cross-record rules complete the relation behavior:

- Deleting a tag while the other branch leaves both the tag and all its
  relations unchanged deletes the tag and relations.
- Deleting a tag while the other branch adds a new relation to it preserves the
  tag and relation and writes `referencedDelete`.
- Deleting a tag while the other branch renames it preserves the renamed tag
  and existing relations and writes `deleteEdit`.
- Deleting an entry removes its relations unless the entry itself survives a
  delete/edit conflict.

## Prompts

| Field/state | Both changed differently | Retention rule |
| --- | --- | --- |
| `promptId` | Stable key | Never title-based identity. |
| `title` | hash-primary + conflict | Retain alternate in conflict record. |
| `createdAt` | invalid mutation | Immutable. |
| `updatedAt` | derived | Maximum contributor time, display only. |
| `conflictOriginId` | derived | Direct primary only. |

## Profile

| Field/state | Both changed differently | Retention rule |
| --- | --- | --- |
| `profileId` | Must be `profile` | Any other value is invalid. |
| `displayName` | hash-primary + conflict | Alternate is retained. |
| `photoAssetId` | hash-primary + conflict | Alternate asset reference is retained; both referenced blobs remain protected until conflict resolution. |
| `updatedAt` | derived | Maximum contributor time, display only. |

The selected account email is not a profile field and can never participate in
merge.

## Media descriptors and asset membership

| Field/state | Rule |
| --- | --- |
| `assetId` | Stable key. A newly selected/re-recorded asset gets a new ID. |
| `ownerType`, `ownerId`, `kind`, `blobHash`, `byteSize`, `createdAt` | Immutable after the asset first appears in an accepted base. A different value under the same asset ID is `invalid-snapshot`; never choose between different bytes under one identity. |
| `mimeType`, `width`, `height`, `durationMs` | Observational metadata. Use the generic rule; a divergent both-changed value uses hash-primary and retains the alternate string representation in `assetReference`. It never changes blob identity. |
| `updatedAt` | Display only; take maximum after the other fields merge. |
| add/add same ID | Values must be byte-equivalent or pause as invalid/collision. |
| add/add different IDs | Keep both, subject to the profile's single `photoAssetId` field rule. |
| remove/unchanged | Remove the reference and descriptor. Local retained-media obligations still protect bytes until publication settles. |
| remove/concurrent immutable-field mutation | Mutation is invalid; do not interpret it as a new asset. |
| remove/concurrent observational-metadata edit or new reference | Preserve the reference and descriptor and write `assetReference`. |
| profile-photo replacement | Merge the profile reference first; retain media named by primary and alternate conflict values. |

Missing local bytes do not remove the descriptor. They set local download state
outside the snapshot and expose retry as specified in ADR V7-0004.

## Tombstones and delete/edit combinations

`live` below means a valid entity value; `deleted` means a valid tombstone for
that stable ID.

| Base | Local | Remote | Result |
| --- | --- | --- | --- |
| absent | live X | absent | X |
| absent | live X | live X | X |
| absent | live X | live Y | field merge; conservative recovery/conflicts |
| live B | deleted | live B | deleted |
| live B | live B | deleted | deleted |
| live B | deleted | deleted | one canonical tombstone; preserve greatest causal knowledge, never wall-clock precedence |
| live B | deleted | live edited | keep edited live entity + `deleteEdit` conflict |
| live B | live edited | deleted | keep edited live entity + `deleteEdit` conflict |
| absent/unreadable | deleted | live | keep live + `deleteEdit`; a base-less deletion cannot silently erase authored data |
| tombstone | absent/stale live | tombstone | tombstone, unless the live side proves a post-tombstone edit from an accepted base |

For two tombstones, choose non-null `deletedStateHash`/`baseStateHash` when only
one has it. If both non-null values disagree, retain the lower canonical
tombstone as primary, store a `deleteEdit` conflict, and do not compact either
causal claim. Tombstones are otherwise retained indefinitely in v2's initial
release.

## Conflict records

Conflict IDs are the SHA-256 of canonical
`[entityType, entityId, field, baseValueHash, sortedDistinctCandidateHashes]`.
For cross-record `referencedDelete`, the base hash is canonical `null` when no
base relation exists, while candidates hash the complete tombstone and complete
new relation respectively. For `deleteEdit`, candidates hash the complete
tombstone and live entity. This prevents different causal claims with the same
display scalar from collapsing.
Repeated merge is idempotent. `alternates` contains only the bounded scalar
needed for review; entry title/body alternatives live in recovered entries.
Conflict resolution is a future ordinary edit: it removes the reviewed conflict
record only after the chosen state is durably dirty for publication.

## Golden catalog

[`fixtures/merge-golden-v2.json`](./fixtures/merge-golden-v2.json) is synthetic
and freezes full base/local/remote payloads plus expected merged domain output.
It covers disjoint field edits, authored-text recovery, tag rename, referenced
tag deletion, asset removal/reference, profile conflicts, delete/edit, and
base-shadow loss. V7-1 must implement these outcomes without modifying the
fixtures to make code pass.
