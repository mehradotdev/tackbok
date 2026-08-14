# ADR V7-0006: Google Drive request budget

Status: **candidate numbers; plan-v7 §18.10 remains open**  
Date: 2026-08-14

This is a correctness-preserving request model, not a promise that Drive will
never throttle. It counts HTTP attempts and current Google quota units
separately. Retries are visible as attempts and never hidden by a batch request.

Google's current documentation measures quota by method class: reads cost 5
units, lists 100, downloads 200, and edits 50. It documents 325,000 units per
minute per user/project and requires exponential backoff after 403/429. Projects
that used the API during Google's stated transition window may retain previous
quotas, so Tackbok must use the limits returned for its project rather than
assuming the published ceiling. Sources: [Drive usage limits](https://developers.google.com/workspace/drive/api/guides/limits),
[partial responses](https://developers.google.com/workspace/drive/api/guides/performance),
and [blob downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

## Adapter assumptions to prove in V7-3

- Warm installations keep a durable Drive changes cursor. A quiet check lists
  revocations directly and consumes one `changes.list`; it does not list all
  heads or snapshots.
- `fields` requests only IDs, names, checksums, sizes, app properties, change
  token, and pagination fields actually needed.
- A small snapshot uses one multipart `files.create`. The response requests
  Drive's checksum and size; matching the locally computed compressed-object
  checksum is content verification without a second download.
- Existing per-device heads are updated by known file ID. Duplicate-name
  recovery may list only that logical head key.
- A pass rechecks changes once immediately before publication if its captured
  cursor may be stale.
- Verified remote media existence is cached durably. Unknown hashes are grouped
  in queries of at most 50 names; V7-3 must measure the actual safe query length.
- HTTP batch is not assumed. If later used, every inner operation still counts
  as one logical request and its quota units.

## Scenario model

The table assumes no HTTP retry, one current device head, one remote head on a
fresh restore, no concurrent writer, and a text-only journal unless `M` is
shown. `L` is additional list pages, `H` physical head candidates downloaded,
`S` unknown frontier snapshots downloaded, and `M` missing media blobs.

| Scenario | Logical operations | Expected requests | Candidate gate ceiling | Approx. quota units |
| --- | --- | ---: | ---: | ---: |
| Warm quiet sync | revocation list + `changes.list` | 2 | 3 | 200 |
| One text edit | quiet check + pre-publish changes recheck + snapshot create + head update | 5 | 7 | 400 |
| 2,000-entry text import | same as one edit; debounce/coalescing makes one snapshot | 5 | 8 | 400 |
| Fresh-device text restore | revocation list + head list + head download + snapshot download + local head create + start-page-token read | 6 | 8 | 655 |
| Fresh-device restore with media | text restore + grouped media lookup pages + media downloads | `6 + ceil(M/50) + M + L + (H-1) + (S-1)` | `8 + ceil(M/50) + M + L + (H-1) + (S-1)` | `655 + 100*ceil(M/50) + 200*M + page/head/frontier units` |

If the device already has a current change cursor but sees a remote change, the
cursor response replaces the initial head list where possible. If a lost
response or duplicate physical name requires reconciliation, those requests
are retry/recovery evidence and reported separately from the no-fault budget.

## Why one large snapshot is cheaper

The 2,000-entry import budget is constant in entry count: encode locally and
upload one metadata object. It must not perform 2,000 existence checks or
creates. Media remains proportional to the number of distinct new blobs because
Drive media upload/download is not batchable, but known hashes avoid repeated
lookups and metadata changes do not re-upload media.

## Instrumentation contract

V7-3 records a redacted counter by `{scenario, methodClass, resultClass}` plus
coarse byte and duration buckets. It never records file IDs/names, query text,
snapshot/media hashes, account information, bodies, tokens, or session URIs.
For each gate scenario report:

- logical operations and raw HTTP attempts;
- list pages, downloaded objects, uploaded objects, and retries;
- estimated quota units using the then-current official method table;
- whether the request and quota ceilings passed.

Retries use `Retry-After` where supplied and bounded exponential backoff with
jitter. A manual **Sync now** does not bypass a current server retry window.

These ceilings become binding only when the owner closes §18.10. A future Drive
quota change updates the quota-unit estimate and may reopen the gate; it does
not relax the logical request ceilings silently.

