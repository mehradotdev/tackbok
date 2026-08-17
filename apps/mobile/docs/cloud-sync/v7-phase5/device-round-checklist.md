# Owner emulator and physical-device evidence checklist

Status: runnable preparation only; no device result is claimed
Owner action required after Bundle V7-5(a) review

Use disposable OAuth test accounts and synthetic data only. Bundle b1 records
emulator/simulator results with `evidenceClass: emulator`; Bundle b2 records
physical release results with `evidenceClass: physical`. Neither class may be
presented as the other. Record a failure as a failure; do not discard it merely
because a later retry passes.

## Evidence classes

- **b1 emulator/simulator:** may establish functional correctness, virtualized
  memory survival, forced Doze, network transitions, and the 200 MiB v2 design
  boundary. It does not establish hardware scheduling, power-loss durability,
  or store-release behavior.
- **b2 physical:** remains mandatory before store submission for release-signed
  native behavior, real performance/memory targets, power loss, background
  scheduling, and iOS Low Power Mode.

## 1. Build and evidence setup

The `device-evidence` EAS profile is an internally distributed, release-mode
beta build. It enables the synthetic V7-5 media screen; store production builds
leave that harness disabled. EAS builds consume service quota and are owner-run:

```sh
cd apps/mobile
npx eas-cli@latest build --platform android --profile device-evidence
npx eas-cli@latest build --platform ios --profile device-evidence
```

For b2, download each artifact, record its SHA-256, install it on physical
hardware, and copy the matching physical template to a working location
outside `evidence/`. For b1, start from
`android-emulator-evidence.example.json` and record the installed debug APK
hash without claiming it is release-signed.
Set `evidenceState` to `captured` only when executing the run. A completed
report can contain failed/blocked scenarios, but no `not-run` scenario.

Generate the synthetic 10,000-entry Presently fixture without checking it into
the repository:

```sh
bun run v7:phase5:generate-journal-fixture -- 10000 /tmp/tackbok-v7-10k.csv
bun run v7:phase5:generate-media-fixture -- /tmp/tackbok-v7-200mib.bin
```

Transfer both files to the target through the normal Files/document path.
Never use an actual journal export or media attachment.

## 2. Release-native and authorization round

Run first on the Android emulator/iOS simulator for b1, then repeat on physical
release builds for b2 when hardware is available:

1. Confirm the installed artifact is the release-mode artifact whose SHA-256
   is in the working report. Successful launch plus v2 Sync now exercises
   `GoogleAuthorizationModule` (Android), `StreamingHashModule`, and
   `AtomicFileModule`; record `release-native-modules` only after the run.
2. Connect a disposable consent-screen test account from the ordinary Cloud
   Backup & Sync screen. Create a disposable v2 backup, sync synthetic text,
   disconnect locally, reconnect, and restore on the second physical device.
3. Confirm Disconnect performs local sign-out only. Do not remove the Google
   grant yet—the same disposable credentials may still be needed for the v1
   purge, which is sequenced after all device evidence.
4. In Google Account → Security → third-party connections, manually remove the
   Tackbok grant. Confirm sync shows an authorization blocker and reconnect can
   recover after consent. On Android, time every retry from external removal to
   the first genuinely successful reconnect and record
   `grantRevocationDeadWindowMs`; do not substitute the old emulator number.

## 3. Large-journal restore and multi-device soak

1. On device A with a clean disposable v2 vault, import
   `/tmp/tackbok-v7-10k.csv` through the Presently importer.
2. Press Sync now and wait for zero actionable work or a specific blocker.
   Record compressed snapshot bytes and elapsed time from redacted
   instrumentation, plus peak process memory from Android Studio Profiler or
   Xcode Instruments. Do not infer memory from the host fixture tool.
3. On a clean device B, discover and restore that vault. Record time to usable
   text, total completion time, entry count, and peak memory. Compare with the
   V7-0 targets cited in the gate; do not relax a target in the report.
4. Edit different synthetic entries on A and B while offline, reconnect them in
   both orders, and keep alternating edits/restarts for the soak period. The
   final snapshots on both devices must retain both authored branches or an
   explicit conflict recovery—never silent loss.

## 4. Real v2 200 MiB media path

This is separate from the historical v1 Phase-3 streaming probe. A v1 result
does not satisfy this v2 item.

1. Connect device A to a disposable v2 vault. Open
   `tackbok-beta://dev-v7-cloud-probes`, attest that the account is disposable,
   press **Seed v2 200 MiB production-path probe**, and select the generated
   `tackbok-v7-200mib.bin`. The helper rejects any file that does not match the
   frozen fixture, then commits it with a null hash/size through the ordinary
   journal repository; it performs no Drive operation itself. Sync must fill
   both fields through `v2/runtime/mediaHashing.ts` before publication.
2. Enable **Wi-Fi only for media**, switch to metered/cellular, press Sync now,
   and confirm the metadata can progress while the 200 MiB media remains
   queued. Record `wifi-only-media` and `wifiOnlyHeldOnMetered`.
3. Return to Wi-Fi and press Sync now. During resumable upload, force-stop once;
   reopen and press Sync now. Record upload time and whether the persisted
   session resumed rather than silently losing intent.
4. On clean device B, restore the vault, interrupt the download/network once,
   then resume. Open the same evidence screen and press
   **Verify restored v2 200 MiB media**. Record byte-count/hash booleans and the
   native streaming verification time; never record the digest or bytes.
5. If the app is killed for memory, record the failure. The production v2 path
   currently has a known whole-`Uint8Array` boundary, so the b1 virtual-device
   run is the first design decision point and the later physical run is
   the decision point for the previously deferred heap obligation, not a result
   to assume away.

The 2026-08-15 API-36 run reached this decision point and failed before upload
with a whole-buffer allocation. Do not repeat steps 2–4 as if they could pass
until [`finding 0001`](./findings/0001-v2-large-media-whole-buffer-oom.md) is
remediated; the failed report is retained as evidence rather than overwritten.

## 5. Background and constrained-environment matrix

With a queued synthetic change and again with pending synthetic media, exercise
and separately record:

- foreground → background → locked screen → foreground;
- force-stop/relaunch;
- Wi-Fi loss and Wi-Fi ↔ cellular hand-off during transfer;
- low free storage during download and base-shadow replacement;
- Android Doze/app standby and battery saver; and
- iOS Low Power Mode and background execution limits.

The pass/fail invariant is durable intent and a later safe resume. OS scheduling
is allowed to defer work; it is not allowed to report success, lose the queue,
or publish a dangling media reference.

## 6. Rollback/kill-switch round

1. Leave at least one synthetic local generation queued and record the remote
   snapshot/object count from the disposable vault.
2. Publish/install an update for the same evidence channel with
   `EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT=off`, then fully reload the JS bundle.
   This EAS action is owner-authorized and is not performed by the implementing
   agent.
3. After activation, use platform network inspection to confirm zero cloud-sync
   requests while app-active, manual, reconnect, and background triggers are
   attempted. Confirm the local queue survives restart unchanged.
4. Restore the `all` update, confirm the same queued generation publishes, and
   confirm the provider snapshot/object count did not decrease during `off`.

## 7. Finalize without leaking data

Replace prose observations with short slug note codes and keep detailed bugs in
a separate redacted finding. Finalize only through:

```sh
bun run v7:phase5:validate-device-evidence -- finalize \
  /path/to/completed-report.json \
  docs/cloud-sync/v7-phase5/evidence/YYYY-MM-DD-PLATFORM-device.json
```

Do not revoke the disposable OAuth grant until the v1 purge checklist either
uses that account or records that no v1 test vault exists. Then remove the grant
manually in Google Account settings; the app never calls a global revocation
endpoint.
