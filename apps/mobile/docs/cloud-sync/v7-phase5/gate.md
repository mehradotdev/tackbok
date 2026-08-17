# Phase V7-5 gate

Status: **OPEN — Bundle (a) findings Z1/Z2 are remediated; Bundle b1 returned
blocking finding D1 on 2026-08-15.** The Android virtual-device run proved the
native streaming hash but reproduced a production v2 whole-buffer OOM before
the 200 MiB resumable upload began. The streaming transfer design is reopened;
c1 purge and c2 retirement remain blocked. Bundle b2 hardware evidence remains
blocking for store submission. No v1 test-vault purge or v6 retirement has
been performed.

## Bundle (a): host preparation

- [x] X3 implementation: iOS base-shadow file writes call `F_FULLFSYNC`; the
  parent directory remains fsynced after atomic rename. The main SQLite
  connection enables `synchronous=FULL`, `fullfsync=ON`, and
  `checkpoint_fullfsync=ON` only on iOS. Host source tests pass; physical
  power-loss behavior is not claimed.
- [x] Rollout policy supports `all`, `v1-only`, `v2-only`, and `off`; invalid
  explicit configuration fails closed. Production engine, consent, reconnect,
  revocation, purge, account-label refresh, and background entry points stop
  before provider traffic when their protocol is disabled.
- [x] Rollback policy is data-preserving by construction and documented:
  switching mode performs no journal/provider/SecureStore mutation and never
  downgrades a vault protocol. Device proof remains open below.
- [x] **Z1:** v2 owns `v2/runtime/mediaHashing.ts` and imports it directly;
  `storage/engineDomain.ts` only re-exports the helper for temporary v1
  compatibility. Its future removal cannot remove v2 media hashing, so the
  `--expect-retired` zero gate is satisfiable after the v1 branches are gone.
- [x] Executable dependency audit records 17 production roots, 325 reachable
  source files, and 23 reachable v1-only files. Current non-zero reachability is
  expected; the same tool has an `--expect-retired` zero gate for Bundle (c).
- [x] **Z2:** the 200 MiB seed explicitly stores `blob_hash`/`byte_size` as
  null. Sync must run the production streaming hasher, and verification compares
  the engine-recorded values with the frozen synthetic fixture. The fixture is
  generated on the host and selected on device; v2 production source no longer
  imports the frozen Phase-0/3 harnesses.
- [x] Synthetic preparation includes deterministic 10,000-entry Presently CSV
  and 200 MiB fixture generators plus the evidence-profile screen. Probe enablement
  requires both the beta variant and the dedicated build environment flag.
- [x] Physical and emulator report templates share a closed schema with an
  explicit `evidenceClass`. Finalization rejects templates/not-run scenarios,
  never permits emulator evidence to claim a physical device, requires
  synthetic/disposable attestations, applies Drive-v2 redaction to the exact
  output, and writes atomically. Physical finalization still requires a signed
  release build.
- [x] The owner checklist separates release auth/restore, historical v1
  streaming evidence, real v2 large-media evidence, constrained environments,
  and kill-switch activation. It does not let one substitute for another.
- [x] Host gate: `bun run v7:phase5a:test` — 1 Jest suite / 7 tests and 1 Bun
  suite / 8 tests (50 assertions) passed. Typecheck, lint, full regression, and
  unsigned Release-simulator compile evidence is recorded in
  [`evidence/2026-08-18-host-tests.json`](./evidence/2026-08-18-host-tests.json).

### Reviewer follow-up — 2026-08-18

- [x] Interrupted journal-deletion recovery now uses the same blocking progress,
  React Query/settings cleanup, and onboarding navigation as the original
  destructive action.
- [x] Remote deletion is checkpointed before local credential cleanup;
  `revocation_acknowledged_at` distinguishes completed cleanup from a crash in
  that window, avoiding an authorization retry loop.
- [x] Received and crash-recovered journal deletion uses truthful confirmation
  copy rather than claiming that the cloud backup remains.
- [x] Gate wording and host evidence were refreshed: full Jest is 51 suites / 484
  tests, and the dependency audit is 17 roots / 325 reachable sources / 23 v1
  files. D1 remains open and is not softened by this follow-up.

## Bundle (b1): owner emulator/simulator evidence — partial

- [x] Independent API-36 Debug smoke: the app and Cloud Backup & Sync screen
  rendered an existing `Up to date` connection with the expected controls and
  no launch/runtime error. No account operation or provider mutation was
  performed by the implementing agent. This is not the completed b1 report.
- [x] A finalized redacted Android emulator report records the actual round,
  including passed disposable-account auth preflight, the 200 MiB native hash
  and verification, the failed upload boundary, durable queue survival across
  process death, and explicit blockers for downstream scenarios. See
  [`evidence/2026-08-15-android-emulator.json`](./evidence/2026-08-15-android-emulator.json).
- [x] **D1 reproduced:** native streaming hash/verification completed and the
  production hash/size matched, but publication attempted a ~200 MiB managed
  allocation and failed before resumable upload. See
  [`findings/0001-v2-large-media-whole-buffer-oom.md`](./findings/0001-v2-large-media-whole-buffer-oom.md).
- [x] The queued synthetic generation and its file survived force-stop/relaunch;
  the automatic retry reproduced the failure rather than losing intent.
- [x] iOS simulator manual foreground sync completed and returned to `Up to
  date`. No restore, interruption, network, large-media, or kill-switch claim
  is made from that smoke.
- [ ] A finalized `evidenceClass: emulator` Android report exercises the 200
  MiB production hash/upload/restore boundary, 10,000-entry restore correctness,
  forced Doze, network transitions, revocation recovery, and kill switch.
- [ ] An iOS simulator round exercises the applicable restore, interruption,
  network-transition, and kill-switch behavior, with simulator non-claims.
- [ ] The 200 MiB v2 result is accepted before c2; failure reopens the streaming
  design while the v1 reference implementation remains available.

## Bundle (b2): physical-device remainder — waived for development, blocks store submission

Owner disposition 2026-08-15: physical hardware is unavailable. These items
are not time-boxed and are not converted into emulator claims. They must pass
before store submission:

- [ ] Release-signed Android build passes native-module compilation/runtime,
  auth E2E, restore, interruption, external revocation, and recovery on a
  physical device.
- [ ] Release-signed iOS build passes the same scenarios on a physical device.
- [ ] Android grant-revocation dead-window duration is measured on hardware.
- [ ] Physical Android/iOS multi-device soak retains every authored synthetic
  branch or records an explicit conflict recovery.
- [ ] A 10,000-entry snapshot restores within the V7-0 time/size/memory targets
  on both reference devices; host numbers are not substituted.
- [ ] A real 200 MiB media object traverses the v2 production path in both
  directions, resumes interruption, verifies its frozen hash, and honors the
  Wi-Fi-only-media policy.
- [ ] Android Doze/battery saver/background/lock/network-transition/low-storage
  matrix passes or has reviewed findings.
- [ ] iOS Low Power Mode/background/lock/network-transition/low-storage matrix
  passes or has reviewed findings.
- [ ] Activated `off` update emits zero subsequent cloud-sync network requests,
  preserves queued local intent and provider object count, and later `all`
  resumes the same intent.

## Bundle (c1): disposable v1 test-vault purge — waits for b1 and explicit confirmation

- [ ] Owner disposable v1 test vaults are revoked and purged through the
  retained reviewed v1 delete path, or the owner records that none exist.
- [ ] Disposable OAuth grants are manually removed after device testing/purge.

Owner attestation 2026-08-15: the owner is the only alpha tester; no other
person is expected to hold a protocol-v1 vault. This does not authorize a
destructive purge by itself.

## Bundle (c2): v6 production removal — blocked

- [ ] Bundle b1's real v2 200 MiB boundary passes and is accepted.
- [ ] Bundle c1 is accepted first.
- [ ] A separate reviewable diff removes v1 production code.
- [ ] Dependency audit with `--expect-retired` reports zero production-reachable
  v1 engine files.
- [ ] Historical v6 docs/gates and migration history remain intact unless a
  later, separately reviewed cleanup decision says otherwise.

## Non-claims

- No EAS build was started and no paid build quota was consumed by the
  implementing agent.
- No physical Android or iOS device was used.
- No release-signed build, physical power-loss, real background scheduling,
  Low Power Mode, hardware timing, or hardware memory fact is claimed.
- The 200 MiB v2 production path crosses a whole-`Uint8Array` boundary and
  failed on the API-36 emulator. Upload/download timing, resume, restore, and
  Wi-Fi policy are not claimed; the streaming design is reopened under D1.
- No v1 vault was queried, revoked, purged, or deleted. No OAuth grant was
  revoked. No v1 production/protocol/probe source was removed. The only v1
  production-source modification was the behavior-preserving Z1 extraction:
  `storage/engineDomain.ts` now re-exports the unchanged hashing helper owned by
  `v2/runtime/mediaHashing.ts`. Frozen protocol and probe sources were untouched.
