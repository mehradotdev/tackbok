# Phase V7-3 gate

Status: **CLOSED at owner review 2026-08-15** (see
[`review-2026-08-15.md`](./review-2026-08-15.md)). All host evidence was
re-run and reproduced exactly; the Android real-Drive report was verified for
redaction and internal request/object-ledger consistency and stands as
implementation-agent evidence per the review. ADR V7-0009 is approved. Two
minor findings are recorded: Y1 (unguarded probe-only destructive provider
members) is a V7-4 entry obligation; Y2 (unbounded discovery-rebuild
recursion under pathological cursor rejection) is an adapter note. **V7-4 is
authorized.** Protocol v2 remains disconnected from the production runtime
and user interface until V7-4 wires it deliberately.

## Provider implementation

- [x] Snapshot, head, media, and revocation objects use Drive
  `appDataFolder`, partial response fields, vault/kind metadata, and reversible
  logical filenames.
- [x] Warm head discovery uses a durable change cursor. Initial discovery uses
  two prefix-scoped inventory reads plus a from-token catch-up; cursor rejection
  rebuilds the scoped cache.
- [x] Unknown media hashes are grouped into at most 50 names per query. A
  51-hash query made exactly two real Drive requests.
- [x] Small objects use multipart upload; objects above 5 MiB use restartable
  256 KiB resumable chunks with exact-origin session validation and durable
  session state.
- [x] Ambiguous immutable creates reconcile by exact key, checksum, and size.
  Known-ID mutable head updates are retryable and omit the create-only parent
  field.
- [x] Snapshot cleanup is best-effort and idempotent. Physical duplicate
  snapshots are all deleted; failure leaks history rather than deleting an
  unproven live object.
- [x] Request instrumentation contains only method/result classes, buckets,
  retry counts, and quota estimates. The complete report is rejected before
  write/log if it contains provider IDs, names, hashes, URLs, queries, session
  URIs, credentials, account data, or fixture bodies.

## Fake fidelity and durable state

- [x] The adapter fake covers duplicate physical names, a lost post-commit
  create response, one delayed prefix listing, one delayed change-cursor read,
  rejected cursors, interrupted cleanup, and server retry windows.
- [x] V7-2's entire 34-scenario / 181-assertion matrix passes after the provider
  contract gained metadata verification and grouped media existence checks.
- [x] Migrations `0008` and `0009` add connection/vault-scoped cursor, object,
  retry-window, and resumable-session state and are registered in both Drizzle
  metadata and `migrations.js`.
- [x] Three Bun/SQLite tests prove state survives reconstruction, change pages
  apply atomically, and neither another vault nor another random connection
  epoch can see cached provider state.
- [x] The connection epoch is SecureStore-only, rotates on interactive
  authorization, and is deleted with credentials. It is random and carries no
  account meaning; tokens and the account email remain SecureStore-only.
- [x] The dev-only runner stops the existing v6 production runtime before
  interactive selection changes the shared credential, so ordinary journal
  sync cannot run beside the synthetic evidence pass.

## Real Drive evidence

The durable `__DEV__` route ran on Android emulator API 36 against the
owner-selected disposable OAuth test account. The checked-in report is already
redacted; account and provider identifiers never entered it:
[`evidence/2026-08-15-android-api36-drive.json`](./evidence/2026-08-15-android-api36-drive.json).

- [x] A synthetic 2,000-entry Presently-shaped snapshot published as one
  immutable snapshot and restored 2,000 entries through a fresh provider cache.
- [x] Duplicate physical head names remained visible. Two additional heads
  were issued concurrently; all four logical device heads became visible after
  two bounded discovery passes.
- [x] A response was discarded after Drive committed an immutable create. The
  adapter reconciled the object by checksum and did not issue a second create.
- [x] An intentionally invalid cursor triggered a prefix-scoped rebuild and
  rediscovered all five physical heads.
- [x] An interrupted cleanup exhausted three transport attempts, retained the
  remaining object, and a reconstructed adapter completed cleanup.
- [x] A `backup-deleted` protocol marker was discovered by direct revocation
  listing without downloading its body.
- [x] Snapshot deletion used permanent Drive delete, succeeded when repeated,
  and a subsequent exact-key read found no object.
- [x] Final probe cleanup permanently deleted all eight synthetic remote
  objects and a second scoped listing found zero.
- [x] After cleanup, local `auth.signOut()` removed the throwaway credential
  and account label without calling Google's global revocation endpoint.

## Request budget

| Scenario | Real attempts | Ceiling | Result |
| --- | ---: | ---: | --- |
| Warm quiet sync | 2 | 3 | pass |
| One text edit with one delayed remote head discovered | 6 | 7 | pass |
| Synthetic 2,000-entry import | 7 | 8 | pass |
| Fresh-device text restore | 8 | 8 | pass |
| 51 unknown media hashes | 2 list requests | 2 | pass |

Retries are reported separately and are not hidden from the counts. The lost
response and interrupted cleanup are fault evidence, not folded into the
no-fault budgets.

## Repository verification

- [x] V7-0: 1 suite / 24 tests.
- [x] V7-1: 6 suites / 74 tests.
- [x] V7-2: 34 scenarios / 181 assertions.
- [x] `bun run v7:phase3:test`: V7-2 plus 4 Jest suites / 28 tests and 3
  Bun/SQLite tests / 10 assertions.
- [x] Full Jest: 49 suites / 467 tests.
- [x] TypeScript and Drizzle migration checks passed.
- [x] Lint completed with 0 errors and 18 pre-existing warnings; changed files
  produced no warnings. `git diff --check` passed.
- [x] No diff exists under frozen `src/lib/cloudSync/protocol/`,
  `src/lib/cloudSync/phase0/`, or `src/lib/cloudSync/phase3/`.
- [x] No client secret or global OAuth revocation endpoint exists in the
  touched v2/auth/probe surfaces. Consolidated host evidence:
  [`evidence/2026-08-15-host-tests.json`](./evidence/2026-08-15-host-tests.json).

## Real-service findings folded into the implementation

The first real run found that Drive rejects `parents` in mutable head-update
metadata and that a cursor catch-up can repeat a head already returned by the
bootstrap prefix scan. The adapter now emits `parents` only on create and
reuses an identical cached validated head without downloading it again. A
second run showed simultaneous head creates were not immediately visible; the
final probe needed a second cursor read, and the fake now exercises a delayed
first change read. These are regression-tested behavior, not omitted failed
evidence.

## Non-claims

- This is Android API-36 emulator Debug evidence, not physical-device,
  release-signing, iOS real-Drive, timing, memory, or power-loss evidence.
- Resumable transfer restart is proven against the faithful host transport
  double, not by uploading a large body to the disposable Drive account. Real
  large-media transfer remains a V7-5 physical-device obligation.
- The `revocation` check is the protocol-v2 backup marker. It does not claim an
  external Google grant-revocation E2E; the shared authorization abstraction
  retains the historical Phase-3 evidence and findings.
- Protocol v2 remains disconnected from the production runtime and production
  Cloud Backup & Sync UI. No production user data was read, converted,
  uploaded, restored, or deleted.
- V7-4 still owns the normalized production journal adapter, runtime/UI switch,
  user-facing recovery paths, translations, accessibility, analytics, and
  policy integration. V7-5 owns physical-device hardening and v6 retirement,
  including carried finding X3 (`F_FULLFSYNC`).
