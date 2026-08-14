# ADR V7-0007: restore the signed-off line-separator vector

Status: **accepted as a corrective amendment**  
Date: 2026-08-14  
Amends: ADR V7-0002 and `fixtures/canonical-v2.json`

## Context

The owner review states that U+2028 and U+2029 are present in the frozen
canonical fixture and records an independent byte/hash verification. The
committed `controls-and-line-separators` vector retained the SHA-256 for that
signed-off value (`acecb51c…`) but accidentally omitted the two final Unicode
scalars from both `value.text` and `canonical`.

Consequently the frozen V7-0 suite did not reproduce after the V7-1 production
canonicalizer was introduced: both Node's SHA-256 and the production portable
implementation calculated `3b7167e7…` for the truncated canonical bytes.

## Amendment

Restore U+2028 followed by U+2029 at the end of the vector's authored text and
canonical bytes. Its already-recorded SHA-256 is unchanged and now derives from
those bytes. No canonicalization rule, protocol field, cap, merge result, or
other fixture changes.

This corrective amendment makes the repository match the content explicitly
accepted in [the V7-0 owner review](./review-2026-08-14.md). Future fixture
changes still require a separate recorded amendment and owner sign-off.

