# Protocol-v1 production dependency audit

Date: 2026-08-15
Status: Bundle V7-5(a) baseline; removal is not authorized yet

The executable audit starts from all 17 non-development Expo Router route
sources, follows local static imports/re-exports, and classifies the v1-only
engine tree. Current result:

- 325 reachable application source files;
- 23 reachable v1-only files;
- the `phase0/` and `phase3/` probe harnesses are excluded from production
  roots and do not appear in the reachable v1 set.

Run `bun run v7:phase5:audit-v1` for the complete sorted list. The baseline is
expected to be non-zero: V7-4 intentionally retained v1 for already-connected
alpha vaults.

## Current production bridges

| Bridge | Why it is reachable now | Retirement disposition |
| --- | --- | --- |
| `runtime/production.ts` → `engine/`, `providers/`, `storage/engineDomain.ts` | Constructs `SQLiteSyncEngine` for a configured `protocol_version = 1` vault and materializes its result. | Remove the v1 branch only after purge evidence; retain the v2 engine factory and readiness/runtime orchestration. |
| `storage/engineDomain.ts` → `v2/runtime/mediaHashing.ts` | The retained v1 bridge temporarily re-exports the one helper shared with v2. The v2 production engine imports its owned helper directly. | Remove `engineDomain.ts` with v1; retain `v2/runtime/mediaHashing.ts`. This extraction makes the future `--expect-retired` zero result achievable without breaking v2 media hashing. |
| `ui/production.ts` → v1 engine/provider | Reconnects, reports, and revokes an existing v1 vault through the reviewed delete path. | Keep until the disposable v1 purge is complete, then remove v1 reconnect/revoke/conflict branches. |
| `storage/repositories.ts` → v1 queue/state tables | Local mutations dual-route: v2 advances a snapshot generation; absence of an active v2 vault falls back to v1 per-entity outbox rows. | After v1 purge, remove the fallback queue/state write while retaining the transaction wrapper, v2 generation/tombstones, and retained-media ledger. |
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
