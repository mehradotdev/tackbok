# Cloud sync Phase 1

Phase 1 adds the local durability foundation for cloud sync. It does not contact
a cloud provider and it adds no user-facing backup controls.

The schema migration creates the normalized domain tables, sync state, outbox,
retained-media ledger, provider state, and migration checkpoints. Application
repositories then keep the legacy rows, normalized rows, generation counter,
outbox intent, and retained-media obligations in one SQLite transaction.

The application-level backfill runs only after those dual-write repositories are
live. It processes stable IDs in checkpointed batches, skips records already
written through the new path, and performs a final reconciliation before marking
the migration complete. ZIP export/import preserves additive stable IDs while
remaining `backupVersion: 1` compatible.

See [`gate.md`](./gate.md) for the evidence and exact limits of the Phase-1 gate.

Run it with:

```sh
bun run phase1:test
```
