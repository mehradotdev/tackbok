# Phase-0 gate

Date: 2026-08-08 (original) · 2026-08-09 (owner re-scope)

Status: **CONDITIONALLY CLOSED — Phase 1 may begin under the owner waiver below.**

Protocol v1 is approved as the implementation target. The physical-device and
real-Drive items originally listed as blocking were re-scoped by the project
owner on 2026-08-09: no physical Android or iOS device is available to this
project, and the owner directed best-effort evidence plus documented residual
risk instead. Nothing below claims a physical-device or real-Drive result that
was not produced.

## Complete locally

- [x] Format ADR covers every frozen protocol decision.
- [x] Numeric validation caps and their boundary expectations are frozen.
- [x] All required semantic scenarios exist once in the machine-readable catalog.
- [x] Jest canonical round-trip and golden-hash verification passes.
- [x] Native streaming-hash prototype exists for Kotlin and Swift.
- [x] Android debug Kotlin compilation succeeds with the inline module included.
- [x] Complete iOS Debug simulator build succeeds with the inline module included.
- [x] A callable on-device canonical byte-round-trip probe exists for both runtimes.
- [x] The 50,000-version host sizing harness passes (539 ms, 105.6 MiB observed heap, one-page replay on the recorded run; independently reproduced 2026-08-09 at 448 ms / 101.5 MiB).
- [x] Written decisions/results exist for all four spikes, with unavailable evidence marked blocked.
- [x] The development-only diagnostics runner exists (`dev-diagnostics` route, `__DEV__`-gated, auto-runs via deep link) and exports sanitized JSON reports.

## Best-effort evidence collected 2026-08-09 (emulator/simulator)

Reports in [`results/`](./results/): `android-emulator-2026-08-09.json`,
`ios-simulator-2026-08-09.json`. Produced by the diagnostics runner in a debug
build served by Metro from the staged Phase-0 tree, driven headlessly via
`tackbok-beta://dev-diagnostics`.

- [x] Canonical fixtures round-trip byte-identically on Android (Hermes, API 36 emulator) — all four golden vectors byte-identical.
- [x] Canonical fixtures round-trip byte-identically on iOS (Hermes, iOS 26.5 simulator) — all four golden vectors byte-identical.
- [x] Streaming hash **correctness** on Android: the 200 MiB deterministic fixture hashed twice to the host-frozen SHA-256 (`502bfded…3868`), reads bounded at 1 MiB, no whole-file JS buffer (729–1145 MiB/s observed; emulator numbers are not performance evidence).
- [x] Streaming hash **correctness** on iOS: same fixture, same frozen hash twice, reads bounded at 1 MiB (2203–2391 MiB/s observed; simulator numbers are not performance evidence).
- [x] Android release-build delta reviewed: `enableMinifyInReleaseBuilds` defaults to false and local release signing uses the debug keystore, so a local release build exercises no meaningful code path beyond the proven debug install. First real proof lands with the first EAS beta build.

## Re-scoped items (owner waiver, 2026-08-09)

Each original blocking item, its disposition, and where its risk now lives:

| Original item | Disposition |
| --- | --- |
| Android/iOS release-signed native-module compile | **Deferred to the first EAS beta build.** Risk low: minification is off, debug compile+install proven on both platforms. If the beta build fails to compile the inline modules, fix before distributing — not a protocol risk. |
| Canonical fixtures on physical Android/iOS | **Satisfied by emulator/simulator under waiver.** Byte determinism is a property of the JS runtime (Hermes) and the encoder, not of hardware; the runtime actually shipped is the runtime tested. |
| 200 MiB streaming-hash physical benchmarks | **Correctness satisfied; throughput target waived.** The 25 MiB/s target has a ~29× margin on emulated hardware; `MessageDigest`/`CryptoKit` are hardware-accelerated on real devices. Re-measure on the first physical device that becomes available; the frozen chunk-manifest fallback in ADR 0002 remains the escape hatch. |
| Real Drive duplicate/appProperties/resumable-expiry/permanent-delete probe | **Moved into Phase 3 as a merge-blocking exit requirement.** The probe checklist in ADR 0003 must run against a disposable real vault before the first production upload path merges. It could never have run in Phase 0: it needs the auth implementation Phase 3 builds. |
| Real Drive interrupted revocation purge / marker-preservation probe | **Moved into Phase 3 exit requirements**, same reasoning as above. |
| 50,000-file restore on physical reference devices | **Waived; host harness numbers stand** (539 ms / 105.6 MiB heap host-side; targets are 5 s interactive / 250 MiB heap on device — wide margin, but not device evidence). If a real restore misses targets, the §12 additive checkpoint/index extension is the planned remedy; it does not break protocol v1. |
| Android/iOS auth E2E, silent refresh, account label, revocation recovery | **Moved into Phase 3 (auth implementation) testing.** Run on the Play-services emulator image with a listed test account during Phase 3, and on release-signed beta builds before store submission. ADR 0005's architecture decision stands. |

## Residual risks accepted by the owner

1. No physical-device performance number exists for hashing or restore; targets are covered by margin, not measurement.
2. Drive `appDataFolder` behavioral assumptions (duplicate tolerance, permanent delete, resumable expiry) remain verified against documentation only until the Phase-3 probes run.
3. Release-signed builds have not compiled the inline native modules; first EAS beta build is the proof point.
4. Google authorization has never been exercised end-to-end; ADR 0005 is architecture, not evidence.

Any of these failing later changes implementation code or Phase-3 ordering — none
of them can silently corrupt a vault, because the format itself (canonical bytes,
hash addressing, ancestry rules) is what the collected evidence proves.

## Environment finding

At original implementation time (2026-08-08), `adb` exposed only
`emulator-5554`; Xcode exposed no physical iPhone. No Drive access token was
present. On 2026-08-09 the owner confirmed no physical device exists or is
expected, and authorized this re-scope rather than substituting simulator
measurements for physical checkboxes.
