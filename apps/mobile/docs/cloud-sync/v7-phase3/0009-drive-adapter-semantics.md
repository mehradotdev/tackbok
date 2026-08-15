# ADR V7-0009: Drive adapter durability and request semantics

Status: **approved at owner review 2026-08-15**
([review](./review-2026-08-15.md))  
Date: 2026-08-15

## Decision

Protocol v2 uses Google Drive's `appDataFolder` through the V7-2
`SnapshotV2Provider` contract. The adapter persists provider metadata in
SQLite, scoped by both vault ID and a random connection epoch. The epoch lives
in `expo-secure-store`, rotates after interactive authorization, and is deleted
on Disconnect. It is not derived from the Google account and is not a stable
account identifier.

SQLite stores only Drive cursors, physical file IDs, bounded logical metadata,
checksums, sizes, validated head envelopes, retry windows, and resumable-session
state. OAuth tokens and the selected account email remain SecureStore-only.
Evidence and instrumentation never contain any of those identifiers, session
URIs, query strings, URLs, bodies, journal text, or media bytes.

## Discovery

- Revocations are listed directly by vault property, kind, and the
  `revocations/` filename prefix before ordinary head discovery.
- Warm discovery consumes `changes.list` from a durable cursor. Initial
  discovery obtains a start token, performs two prefix-scoped head/snapshot
  scans, unions by physical file ID, and then catches up changes from the start
  token. The repeated scan plus catch-up handles both the initial-list visibility
  window and writers racing bootstrap while remaining within the approved
  fresh-restore ceiling.
- A changed head whose physical ID, checksum, and byte count match a validated
  cached envelope is not downloaded again. This matters because real Drive can
  return a head in the catch-up that the prefix scan already observed.
- A rejected cursor (`400`, `404`, or `410`) discards only the scoped discovery
  cache and repeats initial discovery. This is recovery hardening even though
  Google's current documentation says ordinary change page tokens do not
  expire.
- Two head reads in a sync pass are intentional. The second is the plan-v7 §6
  pre-publication recheck and can discover a concurrently published head that
  was not yet visible to the first read.

## Object and duplicate rules

The reversible logical key is the Drive filename. Bounded `appProperties`
record the vault, object kind, content hash, and either that key or a hash of it
when the property-pair limit would be exceeded. All queries include
`'appDataFolder' in parents`, `trashed=false`, the vault property, and the
minimum kind/name condition needed.

Immutable snapshots and media reconcile all exact-name candidates. Equal
checksum/size duplicates are harmless; conflicting immutable duplicates are
invalid data. Mutable head duplicates remain visible to the deterministic V7-2
normalizer. A head create includes `parents: ['appDataFolder']`; a head update
by known physical ID deliberately omits `parents`. The latter rule was learned
from the first real-Drive V7-3 run, where Drive rejected the create-only parent
field on `files.update`; the fake now rejects the same request shape.

## Transfer and retry

- Objects through 5 MiB use multipart transfer. Larger objects use 256 KiB
  resumable chunks with a durable, exact-origin-validated session URI.
- Immutable create is not blindly retried after an ambiguous response. The
  adapter performs bounded exact-key/checksum reconciliation; a later engine
  retry may safely create an equal physical duplicate if visibility still
  lags.
- Chunk PUT and known-ID head update are retryable. A lost final resumable
  response is reconciled against the completed immutable object.
- `401` clears only the invalid access token through the platform authorization
  abstraction. `403` quota/rate reasons, `429`, and `Retry-After` are classified
  separately. The retry-not-before timestamp is durable, so **Sync now** cannot
  bypass it.
- Disconnect remains `auth.signOut()` at the production boundary. No global
  Google OAuth revocation endpoint is called or bundled.

## Request accounting

Instrumentation records only scenario, method/result classes, coarse byte and
duration buckets, retry count, and the V7-0 quota-unit estimate. The redaction
guard runs before log or file output.

The bootstrap's extra consistency reads change the no-fault representative
2,000-entry import to seven attempts and a one-head fresh restore to eight.
Both satisfy the owner-approved ceiling of eight. Warm quiet sync remains two
attempts. Real Drive may make a normal edit use six rather than the five-request
ideal when a previously delayed remote head becomes visible during its
pre-publication recheck; this remains below the ceiling of seven and does not
trade correctness for the idealized count.

## Sources

- [Store application-specific data](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Retrieve changes](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list)
- [Search query terms](https://developers.google.com/workspace/drive/api/guides/ref-search-terms)
- [Upload file data](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Delete files](https://developers.google.com/workspace/drive/api/guides/delete)

