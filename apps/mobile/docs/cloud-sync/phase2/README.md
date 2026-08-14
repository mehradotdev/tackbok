# Cloud sync Phase 2

> **Historical plan-v6 evidence.** The snapshot-v2 proposal lives in
> [`plan-v7.md`](../plan-v7.md). This per-entity engine is a v7 replacement
> candidate, but its reviews remain the audit trail for current production
> code until retirement.

Phase 2 implements the provider-independent sync rules against an in-memory fake
provider. It builds on, but does not modify, the frozen Phase-0 encoder and
fixtures.

The implementation contains canonical entity-version construction, ancestry and
orphan handling, deterministic conflict resolution, provisional/outbox generation
rules, Apply-CAS, initial seeding, revocation handling, and a retry-safe fake
provider. None of this code accesses Google Drive.

See [`gate.md`](./gate.md) for the recorded convergence evidence.

Run it with:

```sh
bun run phase2:test
```
