# Phase-3 owner waiver — physical devices

Date: 2026-08-09
Decided by: the project owner (mehradotdev)
Drafted by the implementing agent at the owner's explicit direction and adopted
by the owner as recorded here.

[`gate.md`](./gate.md) required that "if no physical devices remain available,
the owner must make and record a new, explicit Phase-3 waiver." This is that
waiver. It is deliberately separate from the [Phase-0 waiver](../phase0/gate.md),
which did **not** cover the Phase-3 account and Drive obligations — those were
executed and are recorded in `gate.md`.

## What is being waived

No physical Android or iOS device is available to this project, and none is
expected in the near term. All Phase-3 probe evidence was produced on an Android
API 36 emulator (Google Play system image) and an iOS 26.5 simulator, in debug
builds served by Metro.

Waived: **the requirement that Phase-3 evidence come from physical hardware.**
Emulator/simulator evidence is accepted in its place, with the residual risks
below carried forward explicitly.

## What is *not* being waived

This waiver relaxes the *hardware* the evidence ran on. It does not excuse any
missing evidence, and it does not retroactively upgrade an emulator number into
a device number.

- Every account and Drive obligation in `gate.md` was actually executed against
  real Google Drive with disposable accounts. None of it is waived, deferred, or
  assumed.
- No timing figure in `evidence/` may be described as physical-device
  performance. Every transfer fact already carries
  `runtime: emulator-or-simulator`; that label stays.
- The two findings stand as written. Finding 0002 is fixed and re-verified;
  finding 0001 remains open and is carried forward below.

## Disposition of the two gate items still open

| Item | Disposition |
| --- | --- |
| **ADR 0003 item 4 — natural resumable-session expiry** | **Waived on trigger, not on behavior.** The adapter distinguishes two recovery paths and both were exercised against real Drive: a locally expired session (`forced-local-expiry`) and a session Drive no longer recognises, which answered a real HTTP 404 and caused a clean restart (`forced-dead-session`). What is synthetic is the *trigger*, not the response. Waiting out Google's ~1-week expiry is a calendar cost with no code path left to discover. Carried forward: if a beta-period upload ever fails after a genuine week-long pause, this is the first suspect. |
| **First release-signed Android and iOS beta builds** | **Deferred, not waived — blocking store submission rather than Phase 4.** This is an EAS artifact, not a probe, and producing it does not require a physical device. It stays merge-blocking for the *first distributed build*: both inline native modules (`GoogleAuthorizationModule`, `StreamingHashModule`) must compile and run under release configuration, and the build identifiers must be recorded here. Phase 4 work does not touch that risk, so it need not wait on it. |

## Obligations carried forward to the first physical device

These are not closed by this waiver. Whenever a physical Android or iOS device
becomes available, run them before store submission:

1. **Finding 0001's post-revocation dead window.** Revoke the grant at
   myaccount.google.com and measure how long Android reconnect stays a no-op,
   and whether `GoogleAuthUtil.clearToken` plus the pinned account shortens it.
   The ~30-minute emulator figure is one data point, not a specification.
2. **Full auth E2E on a release-signed build**, both platforms. Emulator consent
   flows and OEM-skinned device consent flows are not the same UI.
3. **A 200 MiB round trip on real hardware and a real network**, for the first
   throughput numbers that mean anything.
4. **Background and constrained-environment behavior** — Doze, background
   execution limits, cellular metering, network hand-off mid-transfer, low free
   storage. None of it exists on an emulator, and all of it matters for a sync
   feature that moves hundreds of megabytes.

## Residual risks accepted by the owner

1. **No physical-device performance number exists** for upload, download, or
   hashing. Targets are covered by margin, not measurement.
2. **Play services behavior is emulator behavior.** How fast a real device
   notices a revoked grant, and how its account chooser and consent screens
   look, are unmeasured. Finding 0001's window may be longer, shorter, or absent
   on real hardware.
3. **Background and network-transition behavior is entirely untested.** A
   transfer interrupted by Doze or a wifi→cellular hand-off has never been
   observed. The resume machinery is proven against forced interruption, which
   is the same code path, but not the same conditions.
4. **Natural resumable-session expiry has never been observed** — see the table
   above.
5. **Release-signed builds have never compiled the inline native modules.** The
   first EAS beta build is the proof point, as it was in Phase 0.
6. **iOS consent ran in a simulator's `ASWebAuthenticationSession`.** Keychain
   and web-session behavior on a real device under a real Apple ID is assumed,
   not shown.

None of these can silently corrupt a vault. The format itself — canonical bytes,
hash addressing, ancestry rules — is what the collected evidence proves, and it
proves it on the runtime that actually ships (Hermes) against real Drive objects.
The risks above are performance, environment, and authorization-UI risks: they
change code or release ordering if they materialise, not stored data.

## Effect

With this waiver recorded, Phase 3 is **conditionally closed** and Phase 4 may
begin. The production upload path may merge. Store submission may not proceed
until the release-signed builds exist and the carried-forward obligations above
are either satisfied or explicitly re-scoped again.
