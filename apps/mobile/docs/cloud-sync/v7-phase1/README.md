# Phase V7-1 — pure snapshot codec and merge engine

Status: **closed at owner review 2026-08-14** ([gate](./gate.md),
[review](./review-2026-08-14.md)); obligation W1 (merge must never emit a
domain its own codec rejects) carries into V7-2.

This directory records the evidence for plan-v7 Phase V7-1. The implementation
lives in `src/lib/cloudSync/v2/` and is deliberately disconnected from SQLite,
Google Drive, the sync runtime, and production UI.

Implemented boundaries:

- `codec.ts` normalizes/builds deterministic gzip snapshots with the in-house
  ZIP module's shared DEFLATE/CRC32 core and validates a downloaded snapshot
  completely before returning a domain-eligible value;
- `strictJson.ts` performs strict UTF-8 decoding and duplicate-aware JSON
  parsing with depth/node limits;
- `validation.ts` enforces the closed schema, scalar/aggregate caps, canonical
  collection order, conflict identities, and references;
- `merge.ts` implements the approved three-way domain rules, tombstones,
  recovered entries, conflicts, and media-reference protection;
- `deviceProbe.ts` is the permanent, redaction-checked successor to the
  temporary V7-0 device helper.

The V7-0 fixture inputs remain under `v7-phase0/fixtures/`. ADR V7-0007 records
one corrective amendment discovered during implementation: the committed
line-separator vector retained the approved U+2028/U+2029 hash but omitted
those two characters from its value/canonical fields. The amendment restores
the exact content explicitly described as present in the V7-0 owner review.

## Re-running the device probe

Start the beta development server and load the current development bundle,
then open:

```text
tackbok-beta://dev-diagnostics?suite=v7-canonical
```

The listener is installed before the app bootstrap gate, and the ordinary
dev-diagnostics screen runs the same probe once it mounts. The complete report
is redaction-checked before it is written to
`Paths.document/v7-canonical-report.json` or logged with
`V7_CANONICAL_RESULT`. The report contains counts and runtime/build metadata,
not fixture values, journal data, credentials, account identifiers, or Drive
session information.

See [gate.md](./gate.md) for the executed commands and evidence.
