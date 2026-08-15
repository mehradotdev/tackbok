# Phase V7-2 — durable publisher against a fake provider

Status: **open — returned at owner review 2026-08-15 with blocking finding
X1** ([gate](./gate.md), [review](./review-2026-08-15.md)). Protocol v2
is not wired into the production runtime, UI, or Google Drive adapter.

This phase makes the snapshot publisher restart-safe without changing the
shipping v6 path. The implementation lives under
`src/lib/cloudSync/v2/sync/` and uses migration `0007` for:

- a coalescing journal generation and settled-generation checkpoint;
- one immutable pending publication per vault/device, including its compressed
  candidate bytes and monotonic step;
- the SQLite half of the versioned base-shadow checkpoint; and
- a best-effort reaper for superseded base-shadow files.

The provider contract and its in-memory implementation exercise immutable
snapshot upload, per-device heads, media-before-snapshot ordering, revocation,
retention, duplicate physical heads, lost responses, and concurrent writers.
The production app-private file adapter uses the additive `AtomicFileModule`
Expo module to fsync the temporary file and parent directory around atomic
rename. It is present and native-build-verified, but remains unwired until the
production integration phase.

[ADR V7-0008](./0008-media-owner-closure.md) records the W1 merge correction.
See [gate.md](./gate.md) and the redacted
[host evidence](./evidence/2026-08-14-host-tests.json) for exact executed
checks and non-claims.

