# ADR V7-0004: pause states and visible recovery actions

Status: **proposed for the V7-0 owner gate**  
Date: 2026-08-14

No invariant failure may become a silent retry loop or require the user to
discover that Disconnect happens to clear it. Runtime state stores a stable
reason code, non-sensitive context needed for recovery, retry eligibility, and
the last redacted failure class. Copy is implemented through i18n in V7-4; this
ADR defines actions, not final English strings.

## `Attention needed` states

| Stable reason | Trigger | Primary visible action | Other safe action / rule |
| --- | --- | --- | --- |
| `authorization-required` | No usable grant or refresh is rejected | **Reconnect Google Drive** | Local edits stay queued. Never globally revoke. |
| `account-mismatch` | Google returned a different account than the vault's SecureStore account | **Choose the connected account** | **Disconnect this device** is explicit; never attach the wrong vault. |
| `consent-incomplete` | Required Drive permission was not granted | **Finish connection** | Explain the missing storage permission; preserve local queue. |
| `wrong-vault` | Object vault ID differs from the connected vault | **Reconnect to the correct backup** | **Create a new cloud backup from this device** requires destructive-risk confirmation and a new vault ID. |
| `unsupported-format` | Newer/unknown snapshot, head, or vault version | **Update Tackbok** | **Disconnect this device** leaves both copies intact. |
| `invalid-remote-snapshot` | Closed-schema, cap, hash, canonical, gzip, duplicate-key, sort, or reference validation fails | **Retry and verify backup** | If another verified head exists: **Repair from verified backup**. Otherwise offer export, then confirmed **Replace cloud backup from this device**; never auto-delete the bad object. |
| `head-snapshot-missing` | A valid head names a missing snapshot | **Repair from another verified backup** | If none exists, export then confirmed **Replace cloud backup from this device**. The broken head remains evidence until repair commits. |
| `ambiguous-device-head` | Same device sequence maps to different snapshot IDs | **Inspect and repair backup** | Deterministically validate both; auto-select only if one is invalid or one is proven subsumed. Otherwise user chooses **Preserve both and merge**; neither is deleted. |
| `frontier-too-wide` | More than eight unresolved direct parents | **Consolidate backups** | Runs reviewed pairwise/chunked foreground merges, retaining every branch until the final head verifies. Cancel leaves all branches. |
| `derived-id-collision` | Stable recovered/conflict ID already has different bytes | **Export journal and repair backup** | Confirmed repair allocates a fresh vault; do not choose a colliding record. |
| `local-storage-full` | Candidate/base/download cannot be durably staged | **Free device storage and retry** | **Manage downloaded media** may remove only already-cloud-verified local media after confirmation. |
| `provider-quota-full` | Drive storage quota prevents upload | **Manage Google Drive storage** | **Retry**; local work and retained media stay durable. |
| `provider-permission-denied` | `appDataFolder` object is no longer readable/writable despite a token | **Reconnect Google Drive** | Do not convert 403 to global revocation. |
| `missing-media` | Referenced blob is absent remotely and no verified local copy exists | **Retry missing media** | **Keep entry without attachment** is explicit per asset and publishes removal only after confirmation; text remains restored. |
| `local-media-unreadable` | Local referenced bytes cannot be opened or hash-verified | **Locate/retry attachment** | **Remove attachment** requires confirmation; never publish a snapshot that references unverified new bytes. |
| `normalized-model-not-ready` | Migration/backfill cannot complete in session | **Retry journal preparation** | **Export journal** remains available; sync stays disabled. |
| `backup-deleted` | Valid `backup-deleted` marker observed | **Acknowledge and disconnect** | Local journal remains. Reconnecting creates a new vault only through an explicit new-backup flow. |
| `journal-deleted` | Valid `journal-deleted` marker observed | **Review deletion and erase this device** | The device never republishes. If local deletion cannot finish, the action resumes it; no bypass into sync. |
| `purge-incomplete` | Owner-started Delete backup/journal purge stopped | **Resume deletion** | **Keep paused** is allowed; ordinary sync cannot resume in that vault. |
| `cleanup-inconsistent` | Cleanup would remove a protected/current/last snapshot | **Verify backup health** | Cleanup is disabled; ordinary sync may continue only if a verified head and base remain safe. |

The repair actions above are workflows, not blind pointer rewrites. **Replace
cloud backup from this device** always shows that other devices must reconnect,
creates a new vault identity, verifies its first snapshot, and only then offers
cleanup of the old vault. It is never the default action.

## Paused or queued states that are not `Attention needed`

These states already have an automatic exit and therefore do not show a
destructive recovery workflow.

| State | Exit and visible action |
| --- | --- |
| Offline | Automatically retry on connectivity; **Try again** checks now. |
| Rate limited / transient provider failure | Show bounded retry time; **Try again later** becomes enabled after `Retry-After`/backoff. |
| User paused | **Resume sync**. |
| Wi-Fi-only media | Metadata continues. Media resumes on Wi-Fi; **Use mobile data for media** changes the setting explicitly. |
| OS background budget ended | Work remains safely queued; foreground/**Sync now** continues. |
| Foreground pass/time budget ended with progress | The runtime schedules another bounded pass; **Sync now** continues immediately. |
| Missing base shadow but valid snapshots | Do conservative two-way merge. Surface recovered conflicts for review; do not pause solely because the base was unreadable. |

## State machine invariants

- A successful retry clears only the reason it actually repaired.
- Restart reconstructs the same reason and actions from durable non-secret
  state; a pause is not memory-only.
- **Sync now** never reports success while an actionable reason remains.
- Analytics records the coarse reason enum only, never filenames, IDs, bodies,
  email, token, session URI, or Drive response content.
- Disconnect is an offered action only where listed and is always local sign-out.
- No action requests notification permission.

