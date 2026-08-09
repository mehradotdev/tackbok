# ADR 0005: Google authorization by platform

- Status: architecture accepted; physical end-to-end proof blocked
- Date: 2026-08-08

## Android decision

Prototype a small inline Expo module over Google Identity Services
`AuthorizationClient` (`com.google.android.gms:play-services-auth:21.6.0` or the
current compatible version at implementation time). This is the official current
Android authorization surface, is free, and avoids both the paid Universal module
of `@react-native-google-signin/google-signin` and its free Original module's
legacy/deprecation runway.

The Android OAuth identity is selected by package name plus signing SHA-1:

- beta: `dev.mehra.tackbok.beta`, client
  `771958263851-rtbv0o1v10lnpiag8q1lrvbdkrajjbpj.apps.googleusercontent.com`;
- production: `dev.mehra.tackbok`, client
  `771958263851-3oat281bkoaf37a6998t5n5cg2v6fofe.apps.googleusercontent.com`.

No redirect URI, Web application client ID, server auth code, client secret, or
backend is used. Request these scopes only when the user connects backup:

- `https://www.googleapis.com/auth/drive.appdata`
- `openid`
- `email`

`AuthorizationClient.authorize()` returns a short-lived access token. Calling the
same authorization request after expiry is the silent-refresh path: an existing
grant should return without UI; required resolution becomes `paused_auth`. Fetch
the account label from the OIDC userinfo endpoint with that token and keep it only
on-device. If label retrieval fails, use “Google Drive” and continue.

On HTTP 401, clear only the invalid cached access token and authorize again. The
ordinary Disconnect action discards Tackbok's token reference and local account
label; it must never call `revokeAccess()` or Google's OAuth revocation endpoint.

## iOS decision

Use `expo-auth-session` plus `expo-web-browser` with PKCE and the variant's reversed
iOS client scheme. Request offline access so the returned refresh token can be
stored in SecureStore and refreshed directly at Google's token endpoint.

- beta client:
  `771958263851-87ehodu2jreg8t57kgcmnd7fsn7ess8o.apps.googleusercontent.com`
- beta redirect:
  `com.googleusercontent.apps.771958263851-87ehodu2jreg8t57kgcmnd7fsn7ess8o:/oauthredirect`
- production client:
  `771958263851-dvits2qk2kbvinc4un2n172msnotten2.apps.googleusercontent.com`
- production redirect:
  `com.googleusercontent.apps.771958263851-dvits2qk2kbvinc4un2n172msnotten2:/oauthredirect`

Use the same three scopes as Android. No client secret exists or is bundled.
Disconnect deletes SecureStore tokens locally and dismisses the auth browser
session; it does not revoke the project-wide Google grant. `invalid_grant` or a
refresh 401 becomes `paused_auth` and requires an explicit reconnect.

## Required physical proof

For beta and production-like release-signed builds, record on physical Android and
iOS: connect, consent, Drive call, account label, access-token expiry/silent
refresh, locally disconnect/reconnect, and recovery after externally revoking the
grant. Confirm Android never launches a custom-scheme redirect and iOS returns only
to the registered variant scheme. Expo Go and simulators do not satisfy this gate.

No physical iOS device is connected to this workspace; only an Android emulator is
available. Therefore this ADR does not claim the required end-to-end result.
