# Phase V7-0 — snapshot-v2 design bundle

Status: **closed at owner review 2026-08-14** ([gate](./gate.md),
[review](./review-2026-08-14.md)); obligation V1 (durable device probe)
carries into V7-1.

This phase contains design, frozen synthetic fixtures, and host measurements
only. It does not switch or modify a production cloud-sync path. Existing v6
code and its Phase-0/3 harnesses remain untouched.

Read in order:

1. [`0001-snapshot-v2.md`](./0001-snapshot-v2.md) — exact candidate schema,
   validation caps, sort and reference rules.
2. [`0002-canonicalization-compression.md`](./0002-canonicalization-compression.md)
   — canonical bytes, Unicode, integers, gzip, and cross-runtime proof.
3. [`0003-merge-rules.md`](./0003-merge-rules.md) — every field, relation,
   media, tombstone, and delete/edit rule.
4. [`0004-pause-recovery.md`](./0004-pause-recovery.md) — every
   **Attention needed** reason and its visible exit.
5. [`0005-base-shadow.md`](./0005-base-shadow.md) — versioned local base and
   lossless-upgrade/fallback rule.
6. [`0006-drive-request-budget.md`](./0006-drive-request-budget.md) — expected
   and candidate maximum Drive calls.
7. [`measurements/README.md`](./measurements/README.md) — 2,000/10,000-entry
   host results and their limitations.
8. [`gate.md`](./gate.md) — evidence ledger and the items still requiring the
   owner/platform evidence.

Frozen inputs for V7-1 are under `fixtures/`. Reference/evidence-only tools are
under `tools/`; they are not imported by production code.

Run the host proof:

```sh
cd apps/mobile
bun run v7:phase0:test
```

Plan-v7 §18.5, §18.6, and §18.10 were closed at the 2026-08-14 owner review;
the schema, caps, merge table, and request ceilings are now binding for V7-1.
Fixtures change only through a recorded ADR amendment with owner sign-off.
