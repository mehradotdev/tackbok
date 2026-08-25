# Owner disposition: Wi-Fi-only media evidence

Date: 2026-08-18  
Status: **superseded in part by physical Android Debug evidence on 2026-08-25;
release-candidate evidence still blocks store submission**

## Evidence already obtained

The remediated v2 media path passed a physical Android API-33 beta Debug run
against real Drive with a synthetic 200 MiB fixture:

- production streaming hash;
- resumable upload across a force-stop;
- resumable download across a force-stop;
- atomic promotion after download;
- fresh restore without a captured runtime crash; and
- frozen-fixture hash and byte-size verification.

The redacted report is
[`evidence/2026-08-18-android-physical-debug-d1.json`](./evidence/2026-08-18-android-physical-debug-d1.json).

## Original waived evidence

The owner cannot complete the non-Wi-Fi network round within the current
development window. The app was therefore **not** proven to hold media while
off Wi-Fi and resume it after Wi-Fi returns. No document may represent this
policy behavior as tested or passing.

This waiver moves the unexecuted `wifi-only-media` scenario from the D1/v1
retirement dependency to the store-submission gate. It does not waive or imply:

- release-signed runtime behavior;
- physical-device performance or peak memory;
- Android background, Doze, power-loss, or network-transition behavior;
- any physical iOS behavior; or
- the remaining Bundle b2 store-submission obligations.

## Physical Android Debug follow-up — 2026-08-25

The owner subsequently ran the focused policy scenario on the physical
API-33 Android device with a synthetic voice memo and a disposable identity:

- with Wi-Fi disabled and cellular active, manual sync showed the specific
  Wi-Fi-media hold message and retained the queued changes;
- after Wi-Fi was enabled, a manual sync completed in the 10–60 second bucket;
  and
- the implementing agent independently observed the final `up-to-date` UI
  state and a validated Wi-Fi transport through ADB.

The redacted focused report is
[`evidence/2026-08-25-android-physical-debug-wifi-only.json`](./evidence/2026-08-25-android-physical-debug-wifi-only.json).
This discharges the development/v1-retirement policy check. It does not replace
the strict Bundle-b2 release-signed run, and automatic resume was not observed
on the device because the owner pressed **Sync now** after enabling Wi-Fi.

## Re-entry condition

Before store submission, run the scenario on a release candidate using
synthetic media: enable **Wi-Fi only for media**, leave Wi-Fi for a metered or
cellular connection, prove text-only work can progress while a change carrying
new media remains queued, reconnect to Wi-Fi, prove automatic retry occurs,
and prove the same media finishes and verifies.
Any change to media policy or transfer orchestration before that run reopens
the code-review surface as well as the evidence item.

## Owner decision

The owner accepts the physical Debug D1 transport evidence and authorizes
Bundle c1 to proceed. Bundle c2 remains sequenced after c1 and must still land
as a separate, reviewed removal bundle. This decision waives evidence only; it
does not alter the Wi-Fi-only product requirement.

The owner explicitly reconfirmed this disposition on 2026-08-25 and attested
that the physical ASUS API-33 observations in the focused D1 report reflect the
round the owner personally executed.
