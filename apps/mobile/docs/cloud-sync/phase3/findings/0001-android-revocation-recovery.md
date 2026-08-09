# Finding 0001 — Android reconnect is a silent no-op for a period after revocation

Date: 2026-08-09
Severity: **not merge-blocking** — recovery does work, but silently fails first
Status: open
Evidence:
[`../evidence/2026-08-09-android-api36-recovery-FAILED.json`](../evidence/2026-08-09-android-api36-recovery-FAILED.json),
[`../evidence/2026-08-09-android-api36-reconnect-4th-FAILED.json`](../evidence/2026-08-09-android-api36-reconnect-4th-FAILED.json),
[`../evidence/2026-08-09-android-api36-reconnect-recovered.json`](../evidence/2026-08-09-android-api36-reconnect-recovered.json)

> **Correction.** An earlier version of this finding claimed Android *never*
> recovers from external revocation. That was wrong, and it was wrong because it
> generalised from a 27-minute observation window. Android does recover. What
> follows is the corrected, narrower finding.

## What happens

For roughly the first half hour after the grant is revoked at
myaccount.google.com, reconnecting on Android does nothing and reports success.
After that, consent is offered normally and recovery completes.

Observed timeline, revocation at approximately 17:32 local:

| time | reconnect attempt | result |
|---|---|---|
| 17:35, 17:38, 17:43, 17:59 | `authorize(true)` | no consent UI; cached revoked token returned; Drive 401 |
| ~18:12 | `authorize(true)` | **consent screen shown**, both scopes offered and granted |
| 18:15 | full connect group | all three steps pass, masked label, appDataFolder reachable |

The recovered run:

```
passed connect.authorize      accountLabelIsFallback=false, accountLabelIsMasked=true
passed connect.appdata-scope  existingVaults=4
passed connect.vault-marker   firstWasDuplicate=false, repeatWasDuplicate=true
```

The `drive.appdata` scope is offered on a second consent screen ("see, edit,
create and delete its own configuration data in your Google Drive") and is
granted explicitly. The first screen covers only the email address, which is why
it looked scope-incomplete in isolation.

## Why the dead window exists

`Identity.getAuthorizationClient(activity).authorize(request)` returns
`hasResolution() == false` while Play services still believes the scopes are
granted.
[`GoogleAuthorizationModule.kt`](../../../../src/inlineModules/GoogleAuthorizationModule.kt)
therefore takes the `else` branch of the resolution check and resolves with the
cached access token — one Google has already revoked. Because there is no
resolution, the `PendingIntent` that shows consent is unreachable, so
`authorize(true)` is interactive in name only. Once Play services notices the
revocation, `hasResolution()` becomes true and the normal consent path runs.

Two app-side choices turn a stale cache into a silent success:

1. `resolveAuthorization` stamps `expiresAt` as `System.currentTimeMillis() +
   55 min` regardless of the token's real state, so
   [`android.ts`](../../../../src/lib/cloudSync/auth/android.ts) sees a token
   that looks fresh and short-circuits in `getFreshAccessToken`.
2. A connect whose userinfo call fails still resolves as connected, with the
   account label falling back to `Google Drive`. Nothing surfaces the failure.

Note that reconnecting is a genuine interactive authorization, not a cached
shortcut: `GoogleDriveProvider.connect()` calls `auth.authorize()`, which calls
native `authorize(true)` with no cache check in front of it. A user tapping a
"Connect Google account" button executes exactly this path, so there is no
operator action that would have avoided the dead window.

## Consequence

For up to about half an hour after revoking access, an Android user sees an app
that presents itself as connected — account label present, no error at connect
time — whose every sync returns 401, and pressing Connect again changes nothing
and reports success. The state resolves itself, but the app gives no indication
that waiting is the remedy.

## The fix (partially implemented 2026-08-09)

The app-side lying is fixed:

- `resolveAuthorization` no longer fabricates `expiresAt`; it reports 0, and
  `getFreshAccessToken` treats Play services as the cache of record — every
  use revalidates through a local IPC call instead of trusting a stored expiry
  that was never real.
- `fetchGoogleAccountLabel` now throws an auth error on 401/403 instead of
  swallowing the rejection into the `Google Drive` fallback label, so a
  connect whose token is rejected **fails loudly** instead of presenting as
  connected. Network failures still fall back — offline says nothing about the
  token.
- `clearInvalidAccessToken()` now calls `GoogleAuthUtil.clearToken` (best
  effort, off the main thread) before clearing SecureStore, so the 401-retry
  path can mint a genuinely fresh token rather than re-reading the same dead
  one.

What remains open is the window itself: whether `clearToken` invalidates the
cache behind the newer `AuthorizationClient` API — and therefore whether the
dead window shrinks — **has not been verified**; that needs another real
revocation cycle. Until then, the fixed behavior during the window is a
visible auth failure instead of a silent fake success. The interactive connect
now also pins an explicitly chosen account (see finding 0002), which may
change how Play services evaluates the revoked grant; that too is unmeasured.

## Caveat

Observed on an emulator (API 36, Google Play system image). How quickly Play
services notices a revoked grant is exactly the kind of thing that can differ on
a physical device, so the ~30-minute figure should be treated as one data point,
not a specification.
