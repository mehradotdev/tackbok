# Owner disposition: Wi-Fi-only media evidence

Date: 2026-08-18  
Status: **waived for development and protocol-v1 retirement; blocks store
submission**

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

## Waived evidence

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

## Re-entry condition

Before store submission, run the scenario on a release candidate using
synthetic media: enable **Wi-Fi only for media**, leave Wi-Fi for a metered or
cellular connection, prove text/metadata can progress while media remains
queued, reconnect to Wi-Fi, and prove the same media finishes and verifies.
Any change to media policy or transfer orchestration before that run reopens
the code-review surface as well as the evidence item.

## Owner decision

The owner accepts the physical Debug D1 transport evidence and authorizes
Bundle c1 to proceed. Bundle c2 remains sequenced after c1 and must still land
as a separate, reviewed removal bundle. This decision waives evidence only; it
does not alter the Wi-Fi-only product requirement.
