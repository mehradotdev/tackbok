# Finding 0002 — Android Disconnect does not remove device access

Date: 2026-08-09
Severity: **merge-blocking for the Android E2E gate item**
Status: **fixed and verified on-device 2026-08-09** (see "The fix" below)
Evidence (defect):
[`../evidence/2026-08-09-android-api36-disconnect-FAILED.json`](../evidence/2026-08-09-android-api36-disconnect-FAILED.json),
[`../evidence/2026-08-09-android-api36-two-account-silent-reattach.json`](../evidence/2026-08-09-android-api36-two-account-silent-reattach.json)
Evidence (fix verified):
[`../evidence/2026-08-09-android-api36-disconnect-fixed.json`](../evidence/2026-08-09-android-api36-disconnect-fixed.json),
[`../evidence/2026-08-09-android-api36-account-switch-fixed.json`](../evidence/2026-08-09-android-api36-account-switch-fixed.json)

## What happens

After a local Disconnect, the very next Drive write **succeeds** on Android. The
same probe on iOS rejects the write as `auth:not-connected`.

```
Android                                          iOS
passed disconnect.local-only                     passed disconnect.local-only
       globalRevocationRequests=0                        globalRevocationRequests=0
       secureStoreCleared=true                           secureStoreCleared=true
failed disconnect.no-access                      passed disconnect.no-access
       writeRejected=false                               writeRejected=true
       "A Drive write succeeded after disconnect."       category=auth:not-connected
```

## Why

Disconnect clears SecureStore and, by design, does not revoke the grant with
Google — per-device sign-out must never call the global revocation endpoint, and
the native `signOut` is deliberately a no-op with exactly that comment. That
policy is correct. The problem is what happens on the next token request.

[`ios.ts`](../../../../src/lib/cloudSync/auth/ios.ts) treats absence of stored
credentials as authoritative:

```ts
const current = await readGoogleTokens();
if (!current) throw new CloudAuthError('not-connected', 'Google Drive is not connected');
```

[`android.ts`](../../../../src/lib/cloudSync/auth/android.ts) has no equivalent
check. `getFreshAccessToken` finds an empty cache and falls straight through to
`nativeModule().authorize(false)` — and because the Play services grant is still
in place (correctly), Play services mints a **brand new valid access token**.
The disconnect is undone by the first operation that follows it.

The asymmetry is structural: on iOS, clearing the refresh token removes the only
means of minting a token, so local cleanup is sufficient. On Android the means
of minting lives in Play services, outside anything the app deletes, so local
cleanup alone cannot express "disconnected".

## Not a probe artifact

The engine's only connection gate is an in-memory flag, and it re-initializes
rather than refusing:

```ts
if (!this.connected) await this.initialize();   // inMemoryEngine.ts:188
```

That flag does not survive a process restart, so a restarted app has no record
that Disconnect ever happened. The probe calls the provider at the same layer
the engine does, and no durable state would have stopped it.

## The interactive path is affected too

The silent re-mint is not limited to background code. With **two** Google
accounts on the device and the app locally disconnected, a fresh interactive
connect (`authorize(true)`) completed headlessly in seconds: no account
chooser, no consent screen, silently reattached to the previously granted
account. The report's `existingVaults: 4` fingerprints the account — those are
the first account's probe vaults; the second account's `appDataFolder` is
empty.

The `AuthorizationRequest` sets scopes only. Nothing selects or offers an
account, so whenever any device account already holds a grant, Play services
reports no resolution and returns that account's token. The standard
"disconnect, then reconnect as a different account" flow is therefore
impossible on current code: the chooser the flow depends on never appears.

## Consequence

A user who taps Disconnect is told the device is disconnected while the app
retains full `drive.appdata` access and will silently resume using it. This is a
user-visible privacy failure: the one control offered for withdrawing a device's
access does not withdraw it.

It also meant the `disconnect.grant-survives` step needed no operator check on
Android — the successful post-disconnect write was itself proof the grant
survived. That step exists to confirm Disconnect is not a global revocation, and
it was confirmed, just not in the intended way. After the fix the write is
refused, so the step reverted to a normal operator check; see the verification
list below.

## The fix (implemented 2026-08-09)

Two pieces, one per symptom:

1. **A durable connection mark** (`tackbok.cloud-sync.google.connected.v1` in
   SecureStore): set by a successful interactive `authorize()`, removed first
   thing in `signOut()`, and consulted by `getFreshAccessToken()` before any
   silent mint. Token presence cannot carry this state on Android, because the
   401-recovery path legitimately deletes the whole stored token set while the
   device is still connected. Nothing touches the global revocation policy,
   which stays as it is.
2. **The device account chooser on every interactive connect**
   (`AccountPicker.newChooseAccountIntent`), with the chosen account pinned
   into the `AuthorizationRequest` via `setAccount`. The chosen email is also
   stored in SecureStore next to the tokens (owner-approved), so **silent
   renewals are pinned too** — a background token request can never drift to a
   different signed-in account's grant. It is deleted with the tokens on
   Disconnect and never reaches SQLite, logs, diagnostics, or evidence; the
   visible label remains the masked in-memory one.

Verified on-device against real Play services, grant intact on Google's side:

- Disconnect → next Drive write rejected `auth:not-connected`
  (`writeRejected: true`) — identical to iOS.
- Reconnect after Disconnect → chooser appears; picking the already-granted
  account connects without consent (correct); picking the second account walks
  through full consent and lands in **its own empty `appDataFolder`**
  (`existingVaults: 0`), proving the pin held and account switching works.
- The owner confirmed on `myaccount.google.com` that Tackbok is **still listed**
  for the Android test account after the fixed Disconnect. That is the check the
  defect had made unnecessary — before the fix, the successful post-disconnect
  write was itself proof the grant survived. Now the write is refused, so the
  operator check is what proves Disconnect stayed local instead of revoking the
  account-wide grant. It did.

Migration note: devices that connected before this fix hold tokens but no
connection mark, so they wake up disconnected and need one reconnect tap. Cloud
sync has never shipped, so no real device is in that state.

Known limits of the connection-mark approach, accepted explicitly:

- It is app discipline, not revocation. The grant survives on Google's side (by
  design), so an uninstall/reinstall wipes the mark while the grant persists.
  A reinstalled app still cannot *silently* reattach — the mark is gone, so
  minting requires an interactive connect — but that connect completes without
  a consent screen for the previously granted account. On Android, Disconnect
  can only ever be a promise the app keeps to itself; truly severing the grant
  is the user's action at myaccount.google.com. iOS is structurally stronger
  only because deleting the refresh token deletes the app's ability to mint.
- Every token-minting call path must go through the mark check; a future code
  path that calls the native module directly bypasses it silently. The native
  `authorize` is reachable only through `AndroidGoogleAuthorization`, which is
  where the check lives.

This finding also does not fix, and is not fixed by,
[findings/0001](./0001-android-revocation-recovery.md): the post-revocation
dead window comes from the Play services grant cache, which neither the marker
nor `setAccount` invalidates.
