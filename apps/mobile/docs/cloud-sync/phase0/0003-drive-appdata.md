# Spike 0003: Google Drive `appDataFolder`

- Status: blocked — no authorized Drive access token is available to the workspace
- Date: 2026-08-08

## Decision to verify

The Drive adapter will use direct REST calls and `spaces=appDataFolder`. Logical
objects are identified by app properties containing vault ID, object kind, and
content hash. Physical names are not unique. Immutable puts query candidates,
download and hash-verify them, reuse identical bytes, tolerate identical physical
duplicates, and flag different bytes for the same logical key as corruption.

Drive deletion for revocation uses permanent `files.delete`. Adapter-level deletion
is idempotent: HTTP 404 on a repeated delete is success. A purge lists and deletes
bounded pages while preserving every `revocations/` object.

## Required real-Drive probe

Run against a disposable Phase-0 vault in the provisioned `tackbok` project:

1. Create two files with the same name and identical app properties; prove both
   exist and that the properties query returns both.
2. Create a same-logical-key/different-body candidate; prove the probe reports
   corruption rather than selecting by name or modified time.
3. Start and complete a resumable upload with non-final chunks divisible by
   256 KiB; persist the session URI.
4. Re-check the stored session after its service-side expiry and prove the adapter
   restarts on 404/410 without losing the logical upload.
5. Permanently delete an object, prove it is absent from `appDataFolder`, and prove
   a repeated delete is treated as success.
6. Publish both revocation kinds plus residue, interrupt the purge between pages,
   resume it, and verify a full listing contains revocations only.

Record request counts, status codes, pagination, and object IDs, but never tokens,
account email, file bodies, or journal-derived data.

## Blocking prerequisite

The OAuth consent screen is currently in Testing. A listed test account must grant
`https://www.googleapis.com/auth/drive.appdata` on a physical-device auth run. No
token is committed or passed on a command line. Until that exists, this spike is
not run and protocol v1 is not confirmed.
