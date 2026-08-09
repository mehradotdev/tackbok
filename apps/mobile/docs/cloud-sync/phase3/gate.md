# Phase-3 gate

Date: 2026-08-09

Status: **STOPPED AT OWNER HANDOFF — NOT CLOSED AND NOT MERGE-APPROVED.**

The Google Drive adapter and authorization code are implemented, and all
account-independent checks available to the implementing agent are green. No
real Google account was used, no OAuth consent was granted, and no real Drive
object was created or deleted.

## Account-independent evidence

- [x] `bun run phase3:test`: **1 suite passed, 7 tests passed, 0 failed**.
- [x] Immutable writes tolerate a same-content duplicate and reject a same-key,
  different-content collision under the mocked Drive API.
- [x] Downloads are stream-hashed and reject corrupt bytes; a 401 clears the
  cached access token and retries authorization once.
- [x] Resumable uploads use 256 KiB boundaries, replace expired sessions, persist
  session URI/expiry in `sync_remote_objects`, query Drive's accepted offset after
  restart, and continue from that offset.
- [x] Large downloads resume into a durable sink with an HTTP byte range, avoid
  whole-file buffering in the adapter, and verify the completed SHA-256 before
  returning the object as trusted.
- [x] Mocked permanent deletion is idempotent, and a bounded vault purge removes
  ordinary objects while preserving `revocations/` markers.
- [x] Disconnect performs local token/session cleanup without calling Google's
  global revocation endpoint or issuing a Drive request.
- [x] OAuth token storage is isolated to `expo-secure-store`; SQLite, Zustand,
  diagnostics, and logs receive no tokens.
- [x] Android inline Google Authorization module compiles:
  `:app:compileDebugKotlin` → **BUILD SUCCESSFUL**.
- [x] iOS authorization/native-module integration compiles in an arm64 Debug
  simulator build → **BUILD SUCCEEDED**.
- [x] `bun run typecheck` passes.

The two compile results are integration smoke evidence only. They are not
release-signed or physical-device evidence.

## Merge-blocking owner probes — not run

- [ ] Configure/use a disposable Google test account that is listed on the OAuth
  consent screen, then complete interactive consent.
- [ ] Run ADR 0003's real-Drive checklist: duplicate names, `appProperties`
  queries, resumable-session expiry/recovery, and permanent `files.delete`.
- [ ] Interrupt a real revocation purge, restart it, verify residue is removed,
  and verify every `revocations/` marker survives.
- [ ] Run a roughly 200 MiB upload/download fixture on the best available runtime
  and verify byte count, SHA-256, bounded transfer behavior, restart resume, and
  session-expiry recovery. Do not describe simulator timing as physical-device
  performance.
- [ ] Android E2E: connect → grant → account label → silent refresh after expiry →
  external authorization failure/recovery → local Disconnect.
- [ ] iOS E2E: connect → grant → account label → refresh-token renewal after
  expiry → external authorization failure/recovery → local Disconnect.
- [ ] Produce the first release-signed Android and iOS beta builds containing both
  native modules; record their build identifiers.

If no physical devices remain available, the owner must make and record a new,
explicit Phase-3 waiver. The Phase-0 waiver did not close these Phase-3 account
and Drive obligations. Until the evidence above exists (or is explicitly
re-scoped), do not mark Phase 3 complete, merge its production upload path, or
start Phase 4.

## Security rules during the probes

Use only disposable test data. Evidence must contain no access/refresh token,
account email or stable account identifier, journal text, media bytes, or Drive
session URI. Disconnect must remain local sign-out only and must never call
Google's global revocation endpoint.
