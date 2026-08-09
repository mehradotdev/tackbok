# Phase-3 owner probe runbook

Date: 2026-08-09

The merge-blocking items in [`gate.md`](./gate.md) need a real Google account,
real Drive objects, and a device. This runbook describes the dev-only harness
that executes them and records redacted evidence.

Nothing here closes a gate item on its own. The harness produces the evidence;
the owner reads it and decides.

## What the harness is

- `src/lib/cloudSync/phase3/` — the probe suite.
- `src/app/dev-cloud-probes.tsx` — a development-only route. It is not linked
  from any production screen and returns immediately outside `__DEV__`.
- Host-runnable guards: `bun run phase3:probe:test`.

The probe screen writes `phase3-probe-report.json` into the app document
directory and prints the same JSON to the log behind `PHASE3_PROBE_RESULT`.

## Before the first run

1. **Create a disposable Google account.** Do not use a personal account. The
   probes permanently delete Drive objects and cannot be undone.
2. **List it as a test user.** Google Cloud console → the `tackbok` project →
   APIs & Services → OAuth consent screen → Audience → Test users → add the
   disposable address. The consent screen stays in Testing.
3. **Confirm the Drive API is enabled** for the project.
4. **Android emulator only:** the device needs Google Play services.
   `adb shell pm list packages | grep com.google.android.gms` must print a
   package. If it does not, create a new AVD from a **Google Play** system image
   — a plain AOSP image cannot complete Google sign-in.
5. **Sign the device into the disposable account** (Android: Settings →
   Accounts; iOS: the consent web flow prompts for it).

## Running

```sh
cd apps/mobile
bun run android      # or: bun run ios
```

Then open the route. Either navigate by deep link:

```sh
# beta variant scheme; use tackbok:// for the production variant
adb shell am start -a android.intent.action.VIEW -d "tackbok-beta://dev-cloud-probes"
xcrun simctl openurl booted "tackbok-beta://dev-cloud-probes"
```

The screen refuses to run anything until the disposable-account switch is on.

### Driving a whole pass from the command line

`?run=all` runs every group that needs nothing staged outside the app, then
writes the report. `?fixture=full-200mib` selects the gate-sized fixture;
the default is `quick-32mib`.

```sh
# Android. The app must be cold-started: a deep link delivered to an already
# mounted route does not update its params, so the run would never begin.
# Quote the whole command for the device shell as well, or the device shell
# eats everything from `&` onward and the fixture silently stays at 32 MiB.
# After any reinstall the dev launcher forgets its last project and swallows
# the deep link, so use the same two-step launch as iOS: bundle URL first
# (10.0.2.2 is the emulator's alias for the host), wait for the bundle, then
# the probe URL.
adb shell am force-stop dev.mehra.tackbok.beta
adb shell "am start -a android.intent.action.VIEW \
  -d 'tackbok-beta://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081'"
adb shell "am start -a android.intent.action.VIEW \
  -d 'tackbok-beta://dev-cloud-probes?run=all&fixture=full-200mib'"

# iOS. A terminated dev-client build hands the scheme URL to the dev launcher
# menu instead of the app, so load the app through the launcher first, wait for
# the bundle, then send the probe URL.
xcrun simctl openurl booted "tackbok-beta://expo-development-client/?url=http%3A%2F%2F<metro-host>%3A8081"
xcrun simctl openurl booted "tackbok-beta://dev-cloud-probes?run=all&fixture=full-200mib"
```

**No pass is fully headless at connect.** On iOS, `connect.authorize` opens
`ASWebAuthenticationSession`, and iOS puts up a *"…Wants to Use
accounts.google.com to Sign In"* alert that only a real tap can dismiss. On
Android, every interactive connect now starts with the device account chooser
(that is the finding-0002 fix, not an inconvenience to engineer away): the
operator must tap the intended test account, and — if that account has not
granted before — walk the two consent screens, including the explicit Drive
checkbox on the second one. Everything after connect proceeds unattended.

Collect the report from the device:

```sh
adb shell run-as dev.mehra.tackbok.beta cat files/phase3-probe-report.json
cat "$(xcrun simctl get_app_container booted dev.mehra.tackbok.beta data)/Documents/phase3-probe-report.json"
```

JS `console.log` goes to Metro rather than logcat, so harvest the file, not the
device log.

### Order

1. **Connect and create probe vault.** Interactive consent. This is the step
   that cannot be automated — grant `drive.appdata` on the device. The screen
   shows the masked account label so you can confirm which account you granted;
   that label is deliberately kept out of the written report.
   Everything afterwards runs inside a fresh `probe-…` vault.
2. **Immutable object identity** — ADR 0003 items 1–2.
3. **Resumable upload and restart resume** — ADR 0003 item 3.
4. **Resumable session expiry recovery** — ADR 0003 item 4, partially; see
   *Known limits*.
5. **Permanent deletion is idempotent** — ADR 0003 item 5.
6. **Interrupted revocation purge** — ADR 0003 item 6 and the gate's
   interrupted-purge item.
7. **Large transfer round trip** — the fixture gate item. Select **200 MiB
   (gate)** before running; the 32 MiB option is for a fast smoke pass and
   cannot satisfy the gate.
8. **Silent token renewal after expiry** — the refresh leg of the E2E items.
9. **External authorization failure.** Before running: revoke the app on the
   test account at myaccount.google.com → Security → Your connections to
   third-party apps. Run the group, then tap **Recover** to re-grant and confirm
   the app returns to a working state.
10. **Remove probe objects.** Deletes everything this run created, markers
    included. Run it before Disconnect, while Drive access still exists.
11. **Local disconnect.** Run last; it ends Drive access for the session.

Finally, **Save redacted report** and attach the JSON to the gate.

Repeat the whole sequence once per platform. Android and iOS are separate gate
items because the authorization implementations are separate: Android uses the
inline native module, iOS uses `expo-auth-session` with a refresh token.

## Evidence hygiene

The report may contain object IDs, byte counts, status codes, request counts,
and timings. It must never contain an access or refresh token, an unmasked
account email or stable account identifier, a resumable session URI, a Drive
file body, media bytes, or journal data.

That is enforced twice, not by care alone:

- Facts are primitives capped at 200 characters, so a token or a body cannot be
  recorded as one.
- `assertReportIsRedacted` scans the serialized report for credential-shaped
  substrings and **throws before the report is written or logged**. If saving
  fails with a redaction error, the report is not written anywhere — treat it as
  a defect in a probe, not an inconvenience to work around.

`bun run phase3:probe:test` covers both mechanisms.

## Known limits — read before recording a result

- **Natural resumable-session expiry is not observed.** Google expires a session
  after roughly a week. The harness forces both recovery paths the adapter
  distinguishes (a locally expired session, and a session Drive no longer
  recognizes) and records them as `forced-local-expiry` and
  `forced-dead-session`. The `session.natural-expiry` step is recorded as
  **skipped** with what is still owed. Do not describe the forced probes as
  natural expiry.
- **Emulator and simulator throughput is not device performance.** Every
  transfer fact carries `runtime`. Numbers from
  `runtime=emulator-or-simulator` cannot satisfy a physical-device gate item.
- **Permanent deletion is verified by absence from `appDataFolder`.** That
  listing excludes trashed files, so it proves the object left the working set.
  `files.delete` is what makes it permanent; the probe does not independently
  prove the object is unrecoverable.
- **Disconnect observation covers JavaScript only.** The harness proves no
  JavaScript request reached a Google revocation endpoint. The native sign-out
  path is outside that observation, so the final check is an operator one:
  confirm on myaccount.google.com that Tackbok is *still listed* after
  Disconnect. If it disappeared, Disconnect revoked the whole account grant and
  the step fails.
- **Duplicate physical files depend on a race.** The probe races two providers
  at the same logical put. If the race serializes, the step is recorded
  **inconclusive** rather than passed; re-run to try to reproduce it.
- **Release-signed beta builds are not covered here.** That gate item is an EAS
  build, not a probe.
- **One test account per device.** `appDataFolder` is scoped to the account, not
  the install, so two devices signed into the same account share one folder.
  Cleanup spares probe vaults younger than two hours precisely so a concurrent
  run is not deleted mid-transfer, and it reports how many it spared as
  `sparedRecentVaults` — but the grace period is a safety net, not a licence to
  share an account. Use a separate disposable account per device.
