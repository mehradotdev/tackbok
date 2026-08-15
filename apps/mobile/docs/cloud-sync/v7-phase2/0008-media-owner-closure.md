# ADR V7-0008: media owner closure after merge

Status: **implemented; pending V7-2 owner review**  
Date: 2026-08-14  
Amends: ADR V7-0003's delete/edit media rule

## Context

V7-1 review finding W1 found a valid pair whose merge result was invalid. The
base had live entry `E` and entry-owned photo descriptor `A`. Local deleted
unchanged `E` and therefore validly omitted both records. Remote retained `E`
unchanged but changed only observed metadata on `A`, such as decoded width.
The ordinary three-way rules selected the deletion of `E` and the changed
descriptor `A`, leaving media whose owner did not exist. The v2 codec correctly
rejected that result.

Observed media metadata is not authored journal state and cannot resurrect an
entry. The v7 design also defers physical media garbage collection, so removing
an unreachable descriptor does not delete its blob.

## Decision

After entity, relation, tombstone, and conflict merge completes:

1. keep an entry-owned media descriptor only when its `ownerId` names a live
   merged entry;
2. keep a profile-owned descriptor only when the merged profile or a retained
   profile conflict references its `assetId`;
3. remove an `assetReference` conflict for an entry that is not live, because
   that conflict would itself violate the portable domain's entity reference;
4. do not delete media bytes here or in V7-2 cleanup.

The postcondition is stronger than the individual branch rule: every successful
`mergeSnapshotDomainsV2` result must pass `encodeSnapshotV2` validation. A
regression test covers W1 exactly.

## Consequences

- Deletion still wins over an unchanged entry when the other branch changed
  only observational attachment metadata.
- No authored title/body or live attachment reference is discarded.
- Orphaned physical bytes may remain until a future, separately proved media
  garbage collector. This is intentional leakage over unsafe deletion.
- The W2 equal-sequence tombstone tie and W3 empty MIME findings were also
  tightened in the same entry-condition round, without changing frozen
  fixtures.

