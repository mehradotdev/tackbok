# Cloud sync Phase 0

This directory is the evidence bundle for Phase 0 of
[`plan-v6.md`](../plan-v6.md). Phase 0 freezes protocol
v1 and its fixtures; it does not create the database, outbox, sync engine, or UI.

## What Phase 0 is

Phase 0 reduces the highest-risk unknowns before cloud-sync implementation starts.
It defines the rules future phases must follow, supplies fixed test inputs and
expected outcomes, and records which assumptions have been demonstrated on real
devices and Google Drive.

Terms used throughout this directory:

- **ADR (Architecture Decision Record):** a written technical decision—what was
  chosen, why it was chosen, alternatives considered, and its consequences. An
  accepted ADR freezes the candidate design; it does not prove that design works
  on every required device or service.
- **Spike:** a small, focused experiment used to answer a risky technical
  question before building the production feature. A spike passes only when its
  stated measurements and environment requirements are satisfied.
- **Golden fixture:** a frozen input and expected result. Future implementations
  must reproduce it byte-identically across Jest, Android, and iOS.
- **Gate:** a mandatory stop point. Phase 1 cannot begin until every blocking
  item in [`gate.md`](./gate.md) has evidence and protocol v1 is explicitly
  approved.

## Why the app currently looks unchanged

This phase intentionally adds no user-facing cloud-backup feature. The native
streaming-hash module is registered by the Android and iOS builds, but no screen
invokes it. The canonical fixture probe is callable code, not an app interface.
Google authorization, Drive probes, restore instrumentation, and production sync
UI have not been implemented.

A successful ordinary Android or iOS build therefore proves compilation and
integration only. It does **not** prove fixture equivalence, physical-device
performance, authorization behavior, real Drive semantics, or restore scale.

The complete iOS simulator build and Android debug Kotlin compile are already
recorded under "Complete locally" in [`gate.md`](./gate.md). The two
release-signed build checkboxes require production-like beta builds; simulator or
ordinary debug builds do not satisfy them.

## Artifacts

- [`0001-protocol-v1.md`](./0001-protocol-v1.md) — format ADR and validation caps.
- [`0002-streaming-sha256.md`](./0002-streaming-sha256.md) — native streaming-hash spike.
- [`0003-drive-appdata.md`](./0003-drive-appdata.md) — Drive behavior spike.
- [`0004-restore-scale.md`](./0004-restore-scale.md) — restore-scale spike.
- [`0005-google-authorization.md`](./0005-google-authorization.md) — per-platform auth ADR.
- [`gate.md`](./gate.md) — authoritative gate checklist and remaining evidence.
- Machine-readable fixtures live in
  [`src/lib/cloudSync/phase0/fixtures`](../../../src/lib/cloudSync/phase0/fixtures).
- `runCanonicalFixtureDeviceProbe()` in
  [`deviceFixtureProbe.ts`](../../../src/lib/cloudSync/phase0/deviceFixtureProbe.ts)
  is the callable Android/iOS byte-round-trip probe.

## How evidence is collected

The development-only diagnostics runner exists: the `dev-diagnostics` route
(`src/screens/devDiagnostics/`), `__DEV__`-gated, auto-runs on mount and is
driven headlessly via the deep link `tackbok-beta://dev-diagnostics`
(`?fixture=quick-32mib` for a fast smoke run). It writes a sanitized JSON report
to the app documents directory and logs it with the `PHASE0_DIAGNOSTICS_RESULT`
tag. Collected reports live in [`results/`](./results/). The full planned scope
was:

1. canonical fixture comparison on Android and iOS;
2. deterministic 200 MiB streaming-hash runs and performance metrics;
3. Google authorization, silent refresh, disconnect, and external-revocation tests;
4. disposable real-Drive duplicate, query, upload-expiry, deletion, and purge tests;
5. a 50,000-object restore run with time, memory, responsiveness, and resume metrics.

Each saved result should identify the commit, build ID, platform, physical device,
OS version, probe name, timestamp, pass/fail result, and non-sensitive metrics.
Never record access or refresh tokens, account email, Drive file bodies, or journal
data.

Emulators and simulators are useful for smoke-testing the runner, but they cannot
satisfy a physical-device checkbox. Likewise, `expo run:android`, `expo run:ios`,
Android Studio Debug, and Xcode Debug builds do not satisfy the release-signed beta
requirements.

Recommended evidence order:

1. implement and smoke-test the development-only diagnostics runner;
2. produce release-signed beta builds from a recorded commit;
3. run canonical and hashing probes on qualifying physical devices;
4. run physical authorization tests;
5. run the disposable real-Drive probes;
6. run the real 50,000-object restore test;
7. attach the sanitized results and check only the demonstrated gate items.

Run the host-side fixture checks with:

```sh
bun run phase0:test
```

Runner items 1–2 are implemented and have recorded emulator/simulator results;
items 3–5 (auth, Drive, on-device restore) become Phase-3 obligations per the
owner re-scope in `gate.md`. No unchecked device/cloud item may be described as
passing. On 2026-08-09 the owner conditionally closed the gate by waiver:
protocol v1 is approved on best-effort evidence, with the residual risks and
Phase-3 obligations recorded in [`gate.md`](./gate.md).
