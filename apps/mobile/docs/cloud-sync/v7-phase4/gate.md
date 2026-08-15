# Phase V7-4 gate

Status: **HOST CLAIMS VERIFIED at owner review 2026-08-15
([review](./review-2026-08-15.md)); interactive acceptance remains OPEN.**
Every host count reproduced exactly and entry obligations Y1/Y2 are
discharged. The gate closes only when the four interactive checks below are
dispositioned by the owner. Protocol v2 is now wired for new/restored
production connections. Existing protocol-v1 vaults still construct the v1
runtime and no v6 implementation or probe harness was deleted or switched
off.

## Entry obligations

- [x] **Y1:** destructive probe helpers require both `__DEV__` and an explicit
  `enableDevProbeMethods` construction option. The production provider omits
  that option; a regression proves its destructive helpers throw before any
  request.
- [x] **Y2:** discovery permits one cursor rebuild. A fake Drive server that
  rejects both the existing and freshly rebuilt cursor stops with a transient
  result after exactly two start-token and two changes requests.

## Production data path

- [x] Migration `0010_mysterious_eternals.sql` is registered in Drizzle
  metadata and `migrations.js`; the gate applies migrations 0000–0010 to fresh
  SQLite and verifies the v2 tombstone/conflict tables and entry conflict
  provenance column.
- [x] New connections create protocol-v2 state and mark current local journal
  state for one complete v2 publication. They do not import protocol-v1 heads,
  versions, cursors, or cloud objects.
- [x] Every routed local entry/tag/prompt/profile mutation advances the v2
  journal generation in the same transaction. Reconstructing the SQLite state
  after an offline edit retains `journalGeneration=1, settledGeneration=0`.
- [x] Complete snapshot capture excludes the local profile email. Apply uses a
  generation CAS, preserves the local email, writes conflict provenance,
  retains replaced media before normalized rows are removed, and leaves
  deletion to the established retained-media reaper.
- [x] A remote-present attachment may remain visibly pending when its download
  is policy/transient-blocked; validated text still restores and publishes.
  A truly absent blob restores validated text locally, pauses with
  `missing-media`, and publishes no dangling snapshot. Both schedules are in
  the V7-2/V7-4 regression run.
- [x] Explicit device/journal reset removes v2 base shadows and staged media in
  addition to SQLite replica state and ordinary journal media.

## Runtime behavior

- [x] Foreground `SyncRuntime` follows durable work until `hasPendingWork()` is
  false or a specific failure is returned. The gate injects four units and
  observes four passes and zero work.
- [x] The same runtime runs exactly one unit for a background invocation and
  returns with remaining intent durable.
- [x] Normalized-model readiness still guards both runtime families; the
  existing in-session backfill retry remains in the sole runtime constructor.
- [x] Wi-Fi-only policy wraps media upload/download only. Compressed metadata,
  head, listing, and snapshot requests are not network-type gated.
- [x] No cloud runtime, UI, layout, or gate source requests notification
  permission.

## UI, privacy, and recovery

- [x] Setup discovers protocol-v2 vaults from validated heads without exposing
  Drive file IDs. Onboarding offers restore when a vault exists and does not
  add historical-restore UI.
- [x] Queue status includes unsettled journal generations and pending media.
  Manual sync cannot return success after a durable Attention or retry result.
- [x] Exact v2 conflict envelopes are listed with coarse entity/recovery counts
  and local acknowledgement state; no journal text enters the presentation or
  analytics event.
- [x] All 20 ADR V7-0004 reasons map to their stable recovery-action ID and
  localized visible reason/action copy in English, German, Arabic, Hebrew,
  Simplified Chinese, and Traditional Chinese. Translation parity and
  placeholder tests pass.
- [x] The status/recovery panel exposes alert/live-region semantics, progress
  has a non-colour accessible label, and controls use existing native/Uniwind
  wrappers.
- [x] The typed analytics catalog, catalog tests, in-app privacy allowlist, and
  public policy remain synchronized. The policy now plainly explains complete
  compressed snapshots, separately stored media, recent internal history, and
  non-realtime merging without enumerating internal event names.
- [x] Tokens, selected account email, and connection epoch remain
  SecureStore-only. Disconnect uses local `signOut()` and no global Google
  revocation endpoint or client secret was introduced.

## Repository evidence

- [x] `bun run v7:phase4:test`: V7-2 36 scenarios / 188 assertions; adapter/auth
  4 Jest suites / 32 tests; provider-state 3 SQLite tests / 10 assertions;
  integrated v2/analytics/i18n 10 Jest suites / 130 tests; V7-4 6 Bun tests /
  86 assertions.
- [x] Full Jest: 49 suites / 471 tests.
- [x] TypeScript and Drizzle migration checks passed.
- [x] Lint: 0 errors and 18 pre-existing warnings; changed files have no
  warnings. `git diff --check` passed.
- [x] Android API-36 emulator Debug build assembled and installed successfully.
- [x] No diff exists under frozen `src/lib/cloudSync/protocol/`,
  `src/lib/cloudSync/phase0/`, or `src/lib/cloudSync/phase3/`.
- [x] Consolidated redacted host evidence:
  [`evidence/2026-08-15-host-tests.json`](./evidence/2026-08-15-host-tests.json).

## Interactive acceptance — intentionally not claimed

- [ ] With the disposable account, **Sync now** reaches zero actionable work
  or renders the exact durable blocker and recovery control.
- [ ] Save while offline, force-stop/restart, reconnect, and observe the queued
  change publish without loss.
- [ ] On a clean emulator install, onboarding discovers and restores an
  existing v2 snapshot; text becomes usable while Wi-Fi-blocked media remains
  visibly pending.
- [ ] Exercise representative Attention workflows and TalkBack focus/order on
  the installed build.

These are owner-account/manual UI checks, not V7-5 physical-device claims. The
host gate and Android compile do not substitute for them. Do not close V7-4 or
start V7-5 until owner review dispositions these four items.

## Non-claims and carry-forward

- No iOS build or interactive iOS restore was run in this bundle.
- Android evidence is Debug on an API-36 emulator, not release-signed or
  physical-device timing, memory, background reliability, or power-loss proof.
- No real large-media transfer was run. X3 (`F_FULLFSYNC`), physical-device
  evidence, large-media behavior, and protocol-v1 retirement remain V7-5.
- The complex repair actions in ADR V7-0004 are exposed by stable localized
  controls; owner review must verify their concrete UX against synthetic fault
  states before closing the interactive gate.
