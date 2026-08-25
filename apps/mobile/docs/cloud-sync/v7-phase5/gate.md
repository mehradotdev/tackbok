# Phase V7-5 gate

Status: **OPEN — Bundle (a) and b1's v2 media retirement boundary are
complete; Bundle c1 is authorized but not performed, c2 remains sequenced
after c1, and b2 blocks store submission.** D1's physical Android Debug
real-Drive upload, forced
interruption/resume, fresh restore, and frozen-hash checks passed. Wi-Fi-only
behavior subsequently passed a focused physical Android Debug cellular-hold
and Wi-Fi-resume round; release-candidate confirmation still blocks store
submission rather than v1 retirement. The earlier Android
virtual-device run proved native hashing but reproduced the whole-buffer OOM.
The replacement transport is bounded and restartable in host tests and has now
crossed the former failure boundary on hardware. Bundle b2 hardware evidence
remains blocking for store submission. No v1 test-vault purge or v6 retirement
has been performed.

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

### D1 implementing-agent remediation — 2026-08-18; awaiting owner review

- [x] Upload uses an 8 MiB random-access file source and Drive's authoritative
  resumable offset; acknowledged offsets persist in SQLite migration 0011.
- [x] Download uses HTTP Range into an fsynced `.partial` file. It never falls
  back to a whole-media `arrayBuffer()`, native-hashes the complete file, and
  atomically promotes it only after verification.
- [x] The host 200 MiB boundary test records maximum upload read/request and
  download append sizes of 8 MiB. V7-2 through V7-4 gates and native compile
  results are recorded in
  [`evidence/2026-08-18-d1-host-tests.json`](./evidence/2026-08-18-d1-host-tests.json).
- [x] A physical Android API-33 beta Debug build repeated the real-Drive 200 MiB
  upload, forced upload interruption/resume, forced download
  interruption/resume, fresh restore, and frozen-hash verification without the
  former whole-buffer failure. See
  [`evidence/2026-08-18-android-physical-debug-d1.json`](./evidence/2026-08-18-android-physical-debug-d1.json).
- [x] Owner accepts the focused physical Debug evidence for D1. The unexecuted
  Wi-Fi-only scenario was initially moved to the store-submission gate by
  [`wifi-only-media-waiver.md`](./wifi-only-media-waiver.md). A later focused
  physical Android Debug round passed the cellular hold and manual Wi-Fi resume;
  see
  [`evidence/2026-08-25-android-physical-debug-wifi-only.json`](./evidence/2026-08-25-android-physical-debug-wifi-only.json).
- [x] The policy hold has its own `wifi-only-media` failure category and
  localized message rather than masquerading as a Drive outage. Any online
  network event now schedules a debounced pass, covering cellular-to-Wi-Fi
  transitions. The Phase-V7-4 runtime gate proves this transition and all six
  locale surfaces (7 tests / 106 assertions); the physical round proves the
  specific hold message and manual Wi-Fi completion, not automatic completion.
- [x] Reviewer regression follow-up: the pull path treats `wifi-only-media` as
  a deferrable media-download policy hold, so a remote compressed snapshot is
  still merged, applied, and safely published while its already-remote blob
  remains pending locally. The V7-2 golden scenario exercises the exact error
  code; authorization, integrity, and missing-media failures remain blocking.

Owner confirmation 2026-08-25: the owner personally ran the ASUS API-33 D1
round and confirms that the recorded upload interruption/resume, download
resume, fresh restore, and frozen-hash verification reflect the observed run.
The owner accepts the Debug evidence for D1, authorizes Bundle c1, and approves
the scoped Wi-Fi-only evidence disposition.

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
- [ ] A finalized `evidenceClass: emulator` Android report exercises the
  remaining 10,000-entry restore, forced Doze, network-transition, revocation-
  recovery, and kill-switch matrix. The 200 MiB portion was instead completed
  on physical Android Debug and dispositioned separately below.
- [ ] An iOS simulator round exercises the applicable restore, interruption,
  network-transition, and kill-switch behavior, with simulator non-claims.
- [x] The physical Android Debug 200 MiB v2 result is owner-accepted before c2.
  See
  [`evidence/2026-08-18-android-physical-debug-d1.json`](./evidence/2026-08-18-android-physical-debug-d1.json)
  and [`wifi-only-media-waiver.md`](./wifi-only-media-waiver.md).
- [x] A focused physical Android Debug run held synthetic media on cellular
  with specific, truthful UI copy and completed after Wi-Fi returned. The owner
  pressed **Sync now**, so automatic resumption remains a release-candidate
  check. See
  [`evidence/2026-08-25-android-physical-debug-wifi-only.json`](./evidence/2026-08-25-android-physical-debug-wifi-only.json).

## Bundle (b2): physical-device remainder — waived for development, blocks store submission

Owner disposition amended 2026-08-18: physical Android hardware became
available for the focused D1 Debug run. That run is recorded above, but the
following release, performance, power, background, and iOS items remain
non-time-boxed and must pass before store submission:

The focused D1 report uses a finding-specific `physical-debug` format and is
redaction-guarded, but it does not satisfy Bundle b2. Final b2 evidence must
still use the strict device-evidence schema and atomic finalization path.

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

## Bundle (c1): disposable v1 test-vault purge — authorized; not performed

- [ ] Owner disposable v1 test vaults are revoked and purged through the
  retained reviewed v1 delete path, or the owner records that none exist.
- [ ] Disposable OAuth grants are manually removed after device testing/purge.

Owner attestation 2026-08-15: the owner is the only alpha tester; no other
person is expected to hold a protocol-v1 vault. This does not authorize a
destructive purge by itself.

## Bundle (c2): v6 production removal — blocked

- [x] Bundle b1's real v2 200 MiB boundary passes and is owner-accepted; the
  focused Wi-Fi-only policy behavior also passes on physical Android Debug.
- [ ] Bundle c1 is accepted first.
- [ ] A separate reviewable diff removes v1 production code.
- [ ] Dependency audit with `--expect-retired` reports zero production-reachable
  v1 engine files.
- [ ] Historical v6 docs/gates and migration history remain intact unless a
  later, separately reviewed cleanup decision says otherwise.

## Non-claims

- No EAS build was started and no paid build quota was consumed by the
  implementing agent.
- A physical Android device was used only for the focused D1 beta Debug
  functional run. No physical iOS device was used.
- No release-signed build, physical power-loss, real background scheduling,
  Low Power Mode, hardware timing, or hardware memory fact is claimed.
- The pre-remediation 200 MiB v2 production path crossed a whole-`Uint8Array`
  boundary and failed on the API-36 emulator. The replacement passed physical
  Android Debug upload/download interruption, resume, restore, and frozen-hash
  verification. A separate synthetic-voice-memo round passed cellular hold and
  manual Wi-Fi resume on physical Android Debug. Automatic Wi-Fi resumption,
  release-signed policy behavior, and trustworthy device timing/memory are not
  claimed.
- No v1 vault was queried, revoked, purged, or deleted. No OAuth grant was
  revoked. No v1 production/protocol/probe source was removed. The only v1
  production-source modification was the behavior-preserving Z1 extraction:
  `storage/engineDomain.ts` now re-exports the unchanged hashing helper owned by
  `v2/runtime/mediaHashing.ts`. Frozen protocol and probe sources were untouched.
