# Cloud sync Phase 2

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
