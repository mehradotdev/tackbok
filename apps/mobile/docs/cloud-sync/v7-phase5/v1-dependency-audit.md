# Protocol-v1 production dependency audit

Date: 2026-08-15
Status: **retirement result recorded 2026-08-25; awaiting owner review**

The executable audit starts from all 17 non-development Expo Router route
sources, follows local static imports/re-exports, and classifies the v1-only
engine tree. Bundle V7-5(a) baseline result:

- 325 reachable application source files;
- 23 reachable v1-only files;
- the `phase0/` and `phase3/` probe harnesses are excluded from production
  roots and do not appear in the reachable v1 set.

Run `bun run v7:phase5:audit-v1` for the complete sorted list. The baseline is
expected to be non-zero: V7-4 intentionally retained v1 for already-connected
alpha vaults.

## Bundle V7-5(c2) result — 2026-08-25

After the owner confirmed that no protocol-v1-connected installation remains,
the production bridges below were retired without touching provider data,
local journal rows, SecureStore, migration history, or historical verdicts:

- 17 production roots;
- 301 reachable application source files;
- **0 production-reachable protocol-v1 files**;
- `bun run v7:phase5:audit-v1:retired` exits successfully.

The legacy source tree is retained only for archived v6 tests and deferred
store-submission device probes. This is deliberate: moving or deleting that
audit source would add risk without strengthening the production guarantee.
The executable graph, not a renamed directory, is the binding retirement
boundary.

## Current production bridges

| Bridge | Why it is reachable now | Retirement disposition |
| --- | --- | --- |
| `runtime/production.ts` → `engine/`, `providers/`, `storage/engineDomain.ts` | Baseline constructed `SQLiteSyncEngine` for a configured `protocol_version = 1` vault and materialized its result. | **Retired:** runtime queries protocol v2 only and imports only the v2 factory plus shared readiness/orchestration. |
| `storage/engineDomain.ts` → `v2/runtime/mediaHashing.ts` | The retained v1 bridge temporarily re-exports the one helper shared with v2. The v2 production engine imports its owned helper directly. | Remove `engineDomain.ts` with v1; retain `v2/runtime/mediaHashing.ts`. This extraction makes the future `--expect-retired` zero result achievable without breaking v2 media hashing. |
| `ui/production.ts` → v1 engine/provider | Baseline reconnected, reported, and revoked an existing v1 vault through the reviewed delete path. | **Retired:** all provider actions require protocol v2; stale v1 rows are shown as disconnected. |
| `storage/repositories.ts` → v1 queue/state tables | Baseline mutations dual-routed to v1 per-entity outbox rows without an active v2 vault. | **Retired:** active v2 advances snapshot generation/tombstones; local-only journals need no cloud row and are captured when v2 is connected. |
| Drizzle schema/migrations | Historical v1 tables remain in installed databases. | Schema/migration history is not an executable engine. Keep old migrations; a later additive cleanup migration is optional and must not precede code retirement. |
| Shared `auth/`, SecureStore, normalized model, media files/ledger, analytics, and UI primitives | Both protocols use these surfaces. | Retain. They are not v1-only and are intentionally outside the 23-file classification. |

The 23-file conservative set covers `ancestry/`, `codec/`, `conflicts/`,
`domain/`, `engine/`, `outbox/`, `protocol/`, `providers/`, and
`storage/engineDomain.ts`. Barrel imports make test fakes reachable at the
source-graph level even when Metro could tree-shake them; retirement uses the
conservative result.

## Mandatory retirement check

Bundle (c2) may begin only after accepted emulator evidence, dispositioned
store-blocking hardware debt, and recorded v1 test-vault purge. Its own
reviewable diff must:

1. remove the mixed production bridges above;
2. preserve historical docs/gates and migration history;
3. keep any explicitly archived probe source outside production roots only if
   the owner decides it remains useful;
4. run the audit with `--expect-retired` and report zero v1 production files;
5. prove protocol-v2 local mutations, Disconnect, reset, and revocation still
   work; and
6. never delete local journal or provider data as an automatic consequence of
   upgrade/rollback.

This audit is a removal map, not permission to remove anything in Bundle (a).
