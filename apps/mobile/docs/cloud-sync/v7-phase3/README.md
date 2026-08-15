# Phase V7-3 — Google Drive snapshot adapter

Status: **closed at owner review 2026-08-15** ([gate](./gate.md),
[review](./review-2026-08-15.md)); findings Y1 (V7-4 entry obligation) and Y2
(adapter note) are recorded in the review. V7-4 is authorized.

This phase implements the protocol-v2 provider boundary against Google Drive's
hidden `appDataFolder`. It does not connect protocol v2 to the production sync
runtime or user interface; that remains Phase V7-4.

Read in this order:

1. [`0009-drive-adapter-semantics.md`](./0009-drive-adapter-semantics.md) —
   durable discovery, upload, duplicate, retry, and privacy decisions.
2. [`gate.md`](./gate.md) — executable claims and non-claims.
3. [`evidence/`](./evidence/) — synthetic-only host and real-Drive reports.

The permanent real-Drive harness is the `__DEV__`-only
`tackbok-beta://dev-v7-cloud-probes?run=all` route. It requires interactive
selection of a disposable OAuth test account, creates a random synthetic vault,
stops the ordinary production runtime before changing the shared credential,
runs the destructive probes, applies the redaction guard, writes
`v7-phase3-drive-probe-report.json` in the app document directory, and attempts
to permanently delete every probe object before returning.
It then performs local sign-out so the beta runtime cannot later use the
throwaway credential; this does not revoke the Google grant globally.

After the operator has selected the throwaway account once, automation may
reuse that stored credential without opening consent again via
`tackbok-beta://dev-v7-cloud-probes?run=attach`. This still obtains
tokens only through the platform authorization abstraction.

Never run this harness against a personal Google account. A failed cleanup step
must be treated as a real cleanup obligation, not hidden by deleting the local
report.
