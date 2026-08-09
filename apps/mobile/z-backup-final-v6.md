# Tackbok Cloud Backup & Sync — implementation plan v6 (FROZEN)

Status: **frozen for implementation.** Supersedes all earlier `z-backup*.md` documents, including v5. This document is the authoritative implementation contract. The remote format ("protocol v1") **will be confirmed at the Phase-0 gate** by the spikes and fixtures — if a spike fails, its named fallback applies; prose redesign does not reopen.
Target: Tackbok mobile (Expo / React Native)
v1 provider: Google Drive (`appDataFolder`). Dropbox is a fast-follow, not a launch requirement.
Coordination server: none.

**For the implementing agent:** implement **Phase 0 only**, produce the written ADRs, spike results, and golden fixtures, and **stop at the Phase-0 gate for review**. Do not begin Phase 1 until the gate is explicitly approved. Thereafter work phases strictly in order (§12); every phase has a hard gate. The pure packages (`codec/`, `ancestry/`, `conflicts/`) must be built test-first against the golden fixtures. Where this document says "deterministic," it means byte-identical output across devices and runs — treat any nondeterminism as a bug.

## 1. Summary and core decisions

Build a provider-neutral, incremental **per-entity sync engine**: each synced entity carries its own small append-only version history in the user's cloud storage, and conflicts resolve deterministically with conflict copies instead of text merging. Inspired by Joplin's item-level synchronizer and provider abstraction; Tackbok's version-ancestry protocol is its own design and carries its own property/chaos test obligations.

Core decisions:

- **Track A only.** No Tackbok server of any kind. Discovery = provider change cursor + periodic full listing. A coordinator could be added in a future protocol version; nothing in the vault format depends on one.
- **One writable provider per vault, Google Drive first.** Dropbox ships later against the same `CloudProvider` contract.
- **Per-entity version DAG, not a global commit graph.** Each entity's history is a hash-addressed, multi-parent micro-DAG of tiny immutable JSON files. Ancestry — never counters, sequences, or wall-clock time — determines causality, heads, and conflict detection (§5.1). No cross-entity commit object, no refs, no global publish ordering.
- **Dirty local state becomes a causal branch before remote state is applied** (§6.1). A pending outbox edit is materialized as a provisional local version and participates in head-set computation; remote versions are never applied over a dirty entity as a "fast-forward."
- **Remote apply never overwrites a newer local save** (§6.1 step 6): materializing a resolved state into domain tables is guarded by a compare-and-swap on `local_generation`. A save that lands mid-pass always wins locally and is merged on the next pass via the provisional-chain rule (§4.1).
- **System-generated versions are device-neutral and byte-deterministic** (§5.2). Resolutions, recovered-copy initials, and identical-state joins carry no device metadata, so every device resolving the same head set produces the identical file and hash.
- **Resolutions declare their recovery dependencies** (§5.2, §5.5): recovered-copy versions (and recovered tags/prompts) are published **before** the resolution that references them, and a pulled resolution with missing recovery objects is incomplete, like a version with a missing parent.
- **Conflict copies, not diff3.** Sets (tags, assets) merge by stable ID; concurrent title/content conflicts produce deterministic recovered copies. Named scalar fields (mood, profile fields) resolve to a deterministic primary with alternates recorded in the conflict record — an explicitly narrower promise, stated and tested as such (§6.2). Rules are defined for **N heads**.
- **Whole-file content-addressed media blobs.** No 8 MiB chunk-manifest layer. Media is written once and never edited; transfer resumability comes from Google Drive resumable upload sessions. The streaming-hash implementation is a Phase-0 spike with an explicit fallback (§5.4).
- **No app-managed E2E encryption in v1**, with plaintext-at-provider disclosure in the connect flow and privacy policy. Rationale: with no server, an E2E key must move between devices via passphrase or manual transfer; a forgotten passphrase permanently destroys the backup — the wrong failure mode for a disaster-recovery feature. `drive.appdata` is hidden, TLS-protected, and gated by the user's Google account. The codec boundary accepts plaintext bytes today and can emit encrypted bytes under a future format version (one-time re-upload; the format states this honestly).
- **Transactional outbox** written in the same SQLite transaction as every domain change, with a **local generation counter** so a save during an in-flight sync is never lost (§4.1), and a **provisional-chain rule** so sequential same-device edits never manufacture a false conflict.
- **Tombstones for ordinary sync deletion, hard deletes for domain tables**, with a durable retained-media ledger bridging the gap (§6.4, §7.1). **"Delete journal everywhere" and "Delete cloud backup" are NOT tombstone operations** — they use the vault revocation protocol (§6.6), which dominates stale offline writes and physically purges the vault.
- **Provider-side file deletion is corruption, not a journal edit.** It never deletes local data. One detection blind spot is unavoidable and documented (§7.3).
- **Profile display data (user name, profile photo) is a synced singleton entity** with a real domain table, transactional outbox writes, and the scalar conflict rules (§4, §6.2). Profile email stays device-local and is never written to the vault.
- **No automatic remote garbage collection in v1.** The only remote deletions are the explicit revocation purges of §6.6.
- **No notification permission dependency, no push.** Existing `expo-notifications` reminders stay untouched.
- **Manual ZIP export/import retained** as an independent disaster-recovery path. The exporter keeps **`backupVersion: 1`** and adds purely additive optional stable-ID fields — tag IDs, **custom-prompt IDs**, asset IDs, blob hashes (§3, §4.2). The shipped importer hard-rejects `backupVersion !== 1` but parses payloads with plain lenient JSON, so *keeping* version 1 with extra optional fields is the only contract old app versions actually honor. Archives without the new fields import indefinitely.

Explicit non-goals for v1: Dropbox at launch, any coordination server, E2E encryption, multi-provider mirroring, shared/collaborative journals, web editor, iCloud/CloudKit, WebDAV, automatic GC, native background-transfer module (decided in Phase 6), silent push.

## 2. Data scope

Synced: journal entries (title, content, mood, timestamps), photos and voice memos, tags and entry↔tag associations, custom prompts, deletion tombstones, conflict-recovery records, and profile display data (user name, profile photo — the photo is a media blob; §4 defines the domain table).

Device-local: provider credentials and choice, **profile email** (kept in the ZIP format for compatibility, never written to the vault — §16), app lock/biometrics/PIN, notification and reminder state, theme/language/font/accessibility, analytics consent/IDs, onboarding state, sync queues/cursors/errors, connected-account label (§3.3).

Achievements are re-evaluated from restored journal data; they are not synced as authoritative records.

## 3. Current codebase impact

- `src/lib/backupExport/tackbok.ts` (monolithic ZIP) stays as manual export only — never the cloud transport. It is updated to serialize the normalized model **under the existing `backupVersion: 1`** with additive optional fields carrying `tag_id`s, `prompt_id`s, `asset_id`s, and `blob_hash`es, so a ZIP round-trip preserves stable identities for **every syncable entity type** (entries already carry `noteId`; tags and prompts are currently title-only) and a subsequent cloud merge does not manufacture new identities. The version stays 1 because the shipped importer (`src/lib/backupImport/import/tackbok.ts`) rejects any other value while ignoring unknown JSON fields — verified, not assumed. Old archives without the new fields import indefinitely; such an import necessarily mints fresh tag/prompt/asset IDs, and that consequence is documented. The round-trip fixture verifies entry, tag, custom-prompt, asset, and profile identity.
- `entries.note_id`, `tags.tag_id`, `customPrompts.prompt_id` are stable IDs — retained.
- `entries.assets` JSON is normalized into `media_assets` rows with stable IDs and hashes; `entries.tags` denormalized text gains an `entry_tags` relation.
- Mutations currently write directly through `src/db/queries.ts`; they must route through transaction-scoped repositories that also write the outbox. A UI hook is not sufficient — imports, sample data, and tag deletion would bypass it.
- **Profile state currently lives in a persisted Zustand store** (name, email, image URI) and ZIP import applies it outside the main SQLite transaction. It migrates into the `user_profile` domain table (§4) with a transaction-scoped repository; the Zustand store becomes a read-side cache hydrated from SQLite. Email stays a device-local column, excluded from sync serialization.
- `src/lib/entryDeletion.ts` hard-deletes rows then media; it keeps the domain hard delete but adds the sync tombstone and the retained-media ledger write (§6.4, §7.1). **Edit-time media removal** (removing a photo/memo while saving an entry, replacing/removing the profile photo) currently deletes files immediately after save — every such path is rerouted through the ledger (§7.1); no code path may delete media bytes directly.
- Tags and custom prompts currently enforce unique titles at the database level; that constraint moves to the application layer (§6.3).
- Mock fields/UI to replace: `googleDriveBackupEnabled`, `backupFrequency`, `BackupRestoreSection.tsx`, `SettingsBackupFrequencyModal.tsx` (the disabled "Google Drive Backup" toggle and "Backup Frequency" row visible in the current Settings → Backup & Restore section).
- Sync runtime starts from `src/app/_layout.tsx` after migrations and settings hydration.
- Home-header status button goes in the currently empty space between the centred "Tackbok" title and the avatar in `src/screens/home/Header.tsx`.

### 3.1 Module layout

```text
src/lib/cloudSync/
  domain/            canonical record types and validation
  codec/             canonical JSON, SHA-256 hashing, future encryption seam
  outbox/            coalescing, generations, provisional-version construction
  engine/            sync state machine and orchestration
  ancestry/          per-entity DAG: parents, head sets, descends-from, merge bases, orphan staging
  conflicts/         N-head set-merge + conflict-copy rules (pure, fully tested)
  storage/           SQLite repositories and migrations
  media/             blob staging, streaming hash, retained-media ledger, verification,
                     content-addressed local blob store
  providers/
    types.ts         CloudProvider interface + contract test suite
    googleDrive.ts
    fake.ts          deterministic in-memory provider for tests
  auth/              per-platform Google authorization (native path on Android; §3.3)
                     + SecureStore token handling
  runtime/           AppState, network, background-task integration
  telemetry/         content-free diagnostics
```

UI under `src/screens/settings/cloudSync/` plus the home-header status component.

### 3.2 CloudProvider contract

```ts
interface ProviderCapabilities {
  maxObjectSize: number | null; // bytes; null = effectively unbounded for Tackbok's purposes
  supportsResumableUpload: boolean;
  deletionIsPermanent: boolean; // Drive appDataFolder: true — no trash, no undo
}

interface CloudProvider {
  readonly kind: 'google-drive' | 'dropbox';
  readonly capabilities: ProviderCapabilities;

  connect(): Promise<ProviderConnection>;
  refreshConnection(): Promise<ProviderConnection>;
  disconnect(): Promise<void>;

  listVaults(): Promise<RemoteVaultSummary[]>;
  createVaultMarker(vaultId: string, body: Uint8Array): Promise<VaultMarkerResult>;

  read(vault: VaultRef, key: LogicalKey): Promise<RemoteObject | null>;
  exists(vault: VaultRef, keys: LogicalKey[]): Promise<Set<LogicalKey>>;
  putImmutable(
    vault: VaultRef,
    key: LogicalKey,
    body: ByteSource,
  ): Promise<RemoteObjectRef>;
  list(vault: VaultRef, prefix: LogicalKey, cursor?: string): Promise<ListPage>;
  getChanges(vault: VaultRef, cursor?: string): Promise<ChangePage>;
  getQuota(): Promise<ProviderQuota | null>;

  // Revocation purge only (§6.6). Never called by ordinary sync passes.
  deleteObject(vault: VaultRef, ref: RemoteObjectRef): Promise<void>; // permanent; idempotent (deleting a missing object succeeds)
  deleteVaultResidue(vault: VaultRef): Promise<DeleteSweepPage>;      // bounded batch delete of everything except the revocations/ prefix; resumable
}
```

`deleteObject`/`deleteVaultResidue` exist solely for the vault revocation protocol (§6.6): Drive `appDataFolder` files cannot be trashed — deletion is an explicit permanent `files.delete` — and the contract test suite covers idempotent re-delete, partial-failure resume, and the invariant that the `revocations/` prefix survives every sweep.

**`putImmutable` is idempotent at the content level, not the physical-file level.** Google Drive permits duplicate names and has no atomic create-if-absent by logical path, so writes are at-least-once:

- the adapter queries by an app property carrying object kind + hash;
- any existing candidate is hash-verified before being reused;
- duplicate physical files with identical verified bytes are tolerated (cleanup deferred with GC);
- the selected Drive file ID is returned and stored in `sync_remote_objects`;
- a same-key candidate with _different_ content is flagged as corruption, never silently overwritten.

**`createVaultMarker` is best-effort bootstrap, not atomic create-if-absent** (Drive cannot guarantee that by logical name):

- creating the same vault ID/body twice may produce duplicate physical marker files; identical markers are one logical vault;
- different vault IDs created concurrently remain separate discoverable vaults and go through the explicit selection/merge flow (§8);
- different valid bodies claiming the same vault ID are a bootstrap-conflict/corruption state, surfaced to the user, never silently overwritten.

Whole-file blobs are a deliberate portability trade-off: they suit Drive and Dropbox but not a hypothetical provider with a small object limit. A future constrained provider needs either provider-private multipart storage behind the adapter or a new vault-format chunk manifest — a real cost, recorded so "another adapter is cheap" is not overstated.

Prefer direct REST calls over browser-oriented SDKs **for the Drive data plane**; only authorization is native/provider-aware (§3.3). The adapter normalizes pagination, retries, rate limits, and error categories (`auth`, `quota`, `not-found`, `rate-limit`, `transient`, `corrupt`).

### 3.3 Authorization and new dependencies

**Google no longer supports custom URI-scheme redirects on Android** ([native-app doc](https://developers.google.com/identity/protocols/oauth2/native-app): "Custom URI schemes are no longer supported on Android"), so `expo-auth-session` PKCE cannot be used on both platforms. Authorization is per-platform behind one `auth/` interface (`authorize()`, `getFreshAccessToken()`, `signOut()`, `getAccountLabel()`); the Drive data plane stays direct REST regardless.

- **Android — native authorization path (Phase-0 spike d decides the exact binding).** Candidates: [`@react-native-google-signin/google-signin`](https://react-native-google-signin.github.io/) — **with the licensing caveat that its modern "Universal" (Credential Manager/`AuthorizationClient`) module is a paid, private-registry product, while the free "Original" module rides the legacy, deprecated Play Services path** — or a small inline Expo native module over [Android `AuthorizationClient`](https://developer.android.com/identity/authorization) (free, more work, no third-party dependency). The spike-d ADR must record, explicitly: the exact package **and module** chosen, its **license/cost decision** (paying for Universal vs. accepting the legacy module's deprecation runway vs. building the inline module), every OAuth client type used (including whether a **Web application client ID** is required — Universal requires one; if so it is provisioned in the same console project and its client secret is never bundled or used), the exact scopes, redirect/return behavior, and a successful end-to-end run on a **production-like Android build** (release-signed beta variant) — not merely "use RN Google Sign-In."
- **iOS — reversed-client-ID PKCE remains supported.** Keep `expo-auth-session` + `expo-web-browser` with the reversed iOS client ID scheme (`com.googleusercontent.apps.<id>:/oauthredirect`, per-variant, §3.4), or adopt the same native library on both platforms if the spike shows it strictly simpler — spike d records the choice. The spike must prove code exchange and refresh on a physical device.
- **Connected-account label.** `drive.appdata` alone conveys no identity. The account label shown in §11 comes from the sign-in layer's basic profile (`openid email` — the default identity scopes of Google sign-in), is stored only in `cloud_vault.account_label` on-device, never enters the vault or analytics, and is disclosed in §10. If the chosen iOS path cannot supply it without extra scopes, request `email` explicitly there too; if the user-agent flow makes that awkward, the label falls back to "Google Drive" — the label is cosmetic and must never block connection.
- **Disconnect is local-only.** The per-device **Disconnect** action performs local sign-out and SecureStore token deletion only — it must **never** call Google's global OAuth revocation endpoint, which can invalidate the user's grant across all devices and clients in the same Google Cloud project. v1 ships no global-revoke action at all; if one is ever added, it gets its own explicitly labeled UI, distinct from Disconnect.
- The existing `tackbok://` scheme is _not_ used for Google — reserve it for Dropbox later. Verify auth in a dev-client/release build; Expo Go is not an adequate OAuth environment.

Expo-SDK-compatible dependencies: the Android auth binding chosen by spike d, `expo-auth-session` + `expo-web-browser` (iOS, unless spike d unifies), `expo-secure-store` (tokens), `expo-crypto` (UUIDs/random material — **not** file hashing, see §5.4), `expo-background-task` + `expo-task-manager`, `expo-network`, plus the streaming-hash dependency selected in Phase 0.

Client IDs are public configuration; no client secret is bundled (iOS/Android OAuth clients have none). Verify Android auto-backup exclusions for SecureStore. `ITSAppUsesNonExemptEncryption` stays as-is.

### 3.4 Google Cloud setup (one-time, manual)

Prerequisite work in [Google Cloud Console](https://console.cloud.google.com) — no server, no billing required:

1. Create a project (e.g. `tackbok`).
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: user type **External**; app name, support email, developer contact. Add the scope `https://www.googleapis.com/auth/drive.appdata` (a non-restricted scope — no security assessment required, unlike full Drive access).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, once per platform **per app variant** (four total):
   - **iOS** clients: bundle identifier from `app.config.ts` (per variant). Note each generated client ID and its reversed-scheme form.
   - **Android** clients: package name from `app.config.ts` (per variant) + SHA-1 fingerprint — debug keystore SHA-1 for the beta client, and for prod (with Play App Signing) the SHA-1 from Play Console → App integrity, not the local keystore.
5. While the consent screen is in **Testing** status, only listed test users can connect and **refresh tokens expire after 7 days** — fine for development, unacceptable for release. Move to **In production** before launch (non-restricted scopes normally pass without manual review).
6. No client secret exists for iOS/Android clients; the client IDs go in app config. If Phase-0 spike d shows the Android library requires a Web application client ID, create one in the same project (its secret is never bundled).

**Done 2026-08-08 — provisioned credentials** (project `tackbok`; client IDs are public configuration, safe to commit). One client per platform **per app variant** (`z-package-name.md`): production identity `dev.mehra.tackbok`, beta identity `dev.mehra.tackbok.beta`. These bindings are the credentials the native Android authorization path must use.

| Client | Identity | Client ID |
| --- | --- | --- |
| iOS prod | bundle `dev.mehra.tackbok` | `771958263851-dvits2qk2kbvinc4un2n172msnotten2.apps.googleusercontent.com` |
| iOS beta | bundle `dev.mehra.tackbok.beta` | `771958263851-87ehodu2jreg8t57kgcmnd7fsn7ess8o.apps.googleusercontent.com` |
| Android prod | package `dev.mehra.tackbok` + Play app-signing SHA-1 | `771958263851-3oat281bkoaf37a6998t5n5cg2v6fofe.apps.googleusercontent.com` |
| Android beta | package `dev.mehra.tackbok.beta` + standard debug-keystore SHA-1 | `771958263851-rtbv0o1v10lnpiag8q1lrvbdkrajjbpj.apps.googleusercontent.com` |

iOS reversed redirect schemes (registered in `infoPlist` URL types via `app.config.ts`, **selected by variant**):

- prod: `com.googleusercontent.apps.771958263851-dvits2qk2kbvinc4un2n172msnotten2`
- beta: `com.googleusercontent.apps.771958263851-87ehodu2jreg8t57kgcmnd7fsn7ess8o`

Android needs no registered scheme (package + SHA-1 binding; the native authorization path returns results in-process). **The cloud-sync auth module must select client ID and iOS redirect scheme by variant** — from `app.config.ts` extra fields or `Application.applicationId` — never a single hardcoded pair. Google Drive API is enabled; consent screen is External and currently in **Testing** — remember step 5 before release. Note for open-source contributors: the debug keystore is the standard public RN/Expo one, so any contributor's local beta build matches the Android beta client — but while the consent screen is in Testing, only listed test users can complete sign-in.

## 4. Local database changes

**Two-part migration: a schema-only Drizzle migration, then an application-level checkpointed backfill** (§4.2). The Drizzle migration (update `schema.ts`, `migrations.js`, journal, snapshots) creates tables, columns, indexes, and foreign keys only — it moves no data and completes in one transaction. The backfill is resumable application code, never a blocking SQL migration.

Domain tables:

- **`media_assets`** — `asset_id` (UUID or deterministic recovered ID, PK), `owner_type` (`entry`|`profile`), `owner_id` (note ID or the profile singleton ID), `kind` (photo|voice|profile-photo), `local_uri` (**nullable** — null while a restored blob is not yet downloaded and verified), `download_state` (`n/a`|`pending`|`downloading`|`verified`|`missing`) persisted, `mime_type`, `byte_size`, `width`/`height`/`duration_ms`, `blob_hash` (SHA-256 of file bytes = remote blob ID; null until hashed), `created_at`, `updated_at`, `pending_local_delete_at`. Index on (`owner_type`, `owner_id`); index on `blob_hash`.
- **`entry_tags`** — composite PK (`note_id`, `tag_id`), FKs to entries and tags. Timestamps for diagnostics only; never for conflict ordering.
- **`user_profile`** — singleton row (`profile_id` fixed constant `'self'`; the synced entity ID is the fixed constant `'profile'`, one per vault): `display_name`, `photo_asset_id` (nullable FK → `media_assets`), `email` (**device-local, never serialized into vault versions**), `updated_at`. Migrated from the persisted Zustand profile fields; the Zustand store becomes a cache over this row.
- **Tags / custom prompts**: drop the database unique-title constraint; ordinary user-created duplicates are prevented at the application layer, so recovered conflict duplicates can share a display title. Add nullable `conflict_origin_id` for UI disambiguation. The "Recovered conflict" label is **presentation metadata only** — localized strings never enter canonical synced state.

No `deleted_at` columns on domain tables: deletion removes the domain row (§6.4).

Sync tables (foreign-key/index/uniqueness expectations are part of the Phase-1 schema gate, not left implicit):

- **`cloud_vault`** — single row: `vault_id`, provider kind, remote root ID, account label, `device_id`, **`next_edit_sequence`** (the per-device edit sequence of §5.1 — bumped atomically inside the provisional-construction transaction; this is its persistent storage), status timestamps, seeding checkpoint (§8), format/protocol versions, revocation acknowledgement state (§6.6). No OAuth tokens.
- **`sync_change_queue`** (outbox) — `change_id`, entity type, entity ID, action (`upsert`|`delete`), base head hashes at first dirty (advanced per the provisional-chain rule, §4.1), batch ID for imports/seeding. Unique on (entity type, entity ID): repeated unsynced edits coalesce, preserving the base per §4.1 while updating the desired result. **The generation counter does NOT live here** — clearing an outbox row must never reset or orphan it; the row references the entity's persistent `local_generation` in `sync_entity_state`.
- **`sync_versions`** — locally known version DAG: version hash, vault ID, entity type/ID, sorted parent hashes, kind (`edit`|`resolution`|`recovery-init`|`join`), author device (edits only), state (`provisional`|`incomplete`|`complete`), applied/published flags, cached body or body path. Rebuildable from the vault. Indexed by (entity type, entity ID) and by version hash.
- **`sync_entity_state`** — per entity: **current head hash set**, last remote-applied head set, tombstone flag, and **`local_generation`** — a truly monotonic per-entity clock, incremented in the same transaction as **every** local mutation of the entity, never reset, and independent of whether an outbox row currently exists. It exists for the Apply CAS rule (§4.1) and survives clean↔dirty transitions and outbox coalescing/clearing.
- **`sync_retained_media`** (ledger, §7.1) — one row per retained byte-source: `asset_id`, original owner type/ID, original URI, nullable staged URI, kind, MIME type, byte size, nullable `blob_hash`, state (`recorded`|`staged`|`uploaded`|`safe_to_delete`|`missing`|`failed`), attempt/error data, delete-after timestamp.
- **`sync_media_obligations`** — the **one-to-many** side of retention: one row per (blob hash or ledger row) × obligation — the outbox row, provisional version, resolution, recovery, pending upload, or repair that still needs the bytes; each row names its obligation identity and completion state. One blob may be needed by several entities, versions, and operations at once; a single required-version column cannot express that.
- **`sync_remote_objects`** — logical key/content hash, provider file ID, upload/verification status, byte count, resumable session URI + expiry.
- **`sync_provider_state`** — change cursor, last attempt/success/verify/full-listing times, normalized pause/error code.
- **`sync_conflicts`** — deterministic conflict ID (entity ID + sorted conflicting head hashes), resolution type, recovered entity IDs (one row per recovered result), **alternate scalar values** (small canonical-JSON snapshots of each non-primary candidate's conflicting scalar fields — so the UI can show what the alternates were, §6.2), acknowledged timestamp. **This table is local UI state, rebuildable from resolution/recovery metadata plus retained superseded versions in the remote graph** — losing it never loses journal data.

### 4.1 Outbox rules

Every meaningful mutation updates domain state and `sync_change_queue` in one SQLite transaction: entry/tag/prompt create-update-delete (including tag deletion's effect on relations), **profile updates**, ZIP/third-party import as one batch, initial-vault seeding (§8). Each save increments the entity's persistent `local_generation` in `sync_entity_state` (§4) in the same transaction. Remote application runs with `origin: 'remote'` and must not re-enqueue. React Query uses effectively infinite staleness, so remote apply explicitly invalidates entry/tag/prompt/profile/timeline query keys after commit.

An entity version is **publishable only when every referenced `blob_hash` is non-null and verified**. Entries whose media is still awaiting lazy hashing stay queued locally — deferring only that entity, never the whole pass.

**Generation rule (settle):** sync captures the entity's generation when it constructs the provisional version (§6.1). The outbox row is cleared only if its generation still equals the captured one; if the user saved meanwhile, the newer desired state stays dirty and another pass is scheduled. Network success for generation N must never clear generation N+1. (The sync mutex serializes sync passes — it does not and must not block the user from editing.)

**Apply CAS rule:** the pass captures `local_generation` (from `sync_entity_state`, §4) for **every entity whose staged remote changes may be materialized during Apply — including entities that are clean at pull time**, not only the dirty entities that went through Branch. The capture happens when the entity's staged changes are resolved (step 5 at the latest). The Apply step (§6.1 step 6) then re-reads `local_generation` inside each per-entity apply transaction and **skips domain materialization if it no longer equals the captured value** — covering both the dirty-entity race (save between Branch and Apply) and the clean-to-dirty race (entity clean at pull start, edited locally before Apply; the edit's new outbox row then merges through the normal provisional-branch path on the follow-up pass). The resolved remote state is not lost — it remains in `sync_versions` as a head and merges on the follow-up pass. The domain tables therefore always hold either the resolved state (no interleaved save) or the user's newest save (interleaved save) — never a resolved older state on top of a newer save. An immutable desired-state snapshot in the outbox is an acceptable alternative implementation for the dirty case, but the CAS guarantee over the persistent per-entity counter is the requirement.

**Provisional-chain rule:** when a provisional version for generation N was **successfully published** (directly, or as a parent of a published resolution) but the entity is still dirty at settle (generation advanced to N+1), settle atomically advances the outbox row's base head set to **`{provisional-N}`** — the previous provisional version, which is N+1's true causal parent (N+1 was authored on top of N's local state). It is deliberately **not** advanced to the resolution head: the N+1 edit never observed the resolution's merged remote content, and claiming that ancestry would silently discard remotely-merged changes (e.g. a tag added on another device) as if the user had removed them. Parenting N+1 on provisional-N makes N+1 a legitimate sibling of the resolution; §6.2 then merges them with the unambiguous base provisional-N — remote set-changes survive, N+1's text wins as the only candidate that changed it, and **no recovered copy is created for two sequential edits from the same device**. If the provisional was never published, it is discarded and the row keeps its original base — the generations coalesce as if the pass never ran.

### 4.2 Migration of existing installs

1. **Schema-only Drizzle migration**: create new tables/columns/indexes without changing current UI reads; moves no data.
2. **Transaction-scoped repositories/dual-write behavior are installed and live BEFORE the backfill starts**: from this point, every ordinary save/delete/tag/asset/profile mutation writes both the legacy fields and the normalized tables in one transaction. The backfill therefore only converts rows the app is *not* concurrently rewriting into normalized form — a row it reaches that was already dual-written is skipped as done.
3. **Checkpointed application-level backfill** assigns asset IDs and populates `media_assets`, `entry_tags`, and `user_profile`. It processes bounded batches; each batch commits its assigned IDs **and** its progress checkpoint in the same transaction, so a crash and retry resumes after the last committed batch and **can never re-assign a different ID to an already-processed row**. IDs are ordinary UUIDs — determinism is not required because assignment and checkpoint are atomic; uniqueness across retries is the invariant, and it is tested by killing the backfill mid-run. A row mutated by the user *after* being scanned is not a hazard: the mutation went through the repositories and rewrote the normalized form itself.
4. **A final reconciliation pass** compares legacy fields against the normalized tables and repairs any divergence **before migration is declared complete and before cloud publication is enabled**. Tests cover concurrent edit, delete, tag-membership change, asset replacement/removal, profile change, and app restart during backfill.
5. Never hash all media at startup — hashing is queued lazily and surfaces as initial-backup progress.
6. Dual-read legacy `entries.assets`/`entries.tags` until all queries and the ZIP importer/exporter use the normalized model; drop legacy columns only in a later release.
7. Continue accepting old ZIP archives indefinitely; write the additive stable-ID fields (still `backupVersion: 1` — §3) once the normalized model is live.

## 5. Remote vault format (protocol v1)

Provider-independent, versioned, namespaced by vault ID (multiple vaults are discoverable and must not collide):

```text
tackbok-vaults/<vault-id>/
  vault.json                                  # magic, format version, vault_id, hash algo,
                                              # codec (canonical-json-v1), encryption: "none",
                                              # min compatible protocol version
  revocations/<content-hash>.json             # ABSENT in a live vault; §6.6. Any valid marker
                                              # here dominates everything else in the vault.
  entities/<type>/<entity-id>/<version-hash>.json   # immutable entity versions (hash-named)
  blobs/<first-2>/<sha256>                    # whole-file immutable media blobs
```

Provider methods take a resolved vault root; the Drive adapter maps logical keys through folders/appProperties without assuming path atomicity. An unsupported newer format version pauses sync without touching local or remote data. Never silently reinterpret a version.

### 5.1 Entity version files — hash-addressed, multi-parent

Each save publishes one small **immutable** JSON file whose **filename is the SHA-256 hash of its canonical body**.

Body:

- `formatVersion`, **`vaultId`** (validated against the resolved vault root before acceptance — path placement is not the only cross-vault boundary), `entityType`, `entityId`;
- `kind`: `edit` | `resolution` | `recovery-init` | `join`;
- **`parents: string[]`** — sorted version hashes this state was derived from: creation → `[]`; normal edit → one parent; resolution/join → **every resolved head**;
- full canonical entity state **or** `deleted: true` tombstone;
- `edit` versions only: author device ID (full), per-device sequence (persisted in `cloud_vault.next_edit_sequence`, §4), optional `batchId` — all diagnostics, never causality — and a wall-clock timestamp (display only). System versions carry none of these (§5.2).
- `resolution` versions additionally: sorted **`recoveries`** list (§5.2).

Canonical JSON (defined key order, Unicode, null/absent, integer rules) is hashed with SHA-256. Entry state references tags by sorted IDs and assets by sorted stable descriptors (`asset_id`, kind, metadata, `blob_hash`) — never device-local URIs. Profile state (`entityType: 'profile'`, fixed `entityId`) carries `displayName` and an optional photo asset descriptor — never the email.

**Head resolution is ancestry-based:** a head is a **causally valid** known version (complete, verified ancestry — §6.3) that no other valid known version references as a parent. One head = current state. Multiple heads = concurrency and invoke §6.2. "X descends from Y" means Y is reachable from X via parent links. No counter, sequence, or timestamp ever selects a winner.

Validation caps apply before any version enters the database: maximum JSON size, parent count, ancestry depth, entities per pass, recovery-dependency count, total dependency bytes, and decoded string/metadata sizes. Concrete cap values are fixed in the Phase-0 ADR and enforced by fixtures.

Superseded versions remain in place in v1 (no GC); journal edit volume keeps this cheap. A future "compact vault" can prune with checkpoint semantics.

### 5.2 System versions — device-neutral, byte-deterministic, dependency-declaring

`resolution`, `recovery-init`, and `join` versions are **system-generated** and must be reproducible bit-for-bit by any device observing the same head set:

- no author device ID, no per-device sequence, no `batchId`;
- no wall-clock timestamp — any needed timestamp is derived deterministically (maximum of parent timestamps);
- sorted parents; resolved state produced by the deterministic rules of §6.2;
- conflict/recovery metadata derived only from the entity ID and sorted head hashes.

Two devices racing to resolve the same fork therefore produce the **same file, name, and hash** — the race collapses under content-level idempotency instead of forking again.

**Recovery dependencies.** A resolution that creates recovered entities declares them in its canonical body:

```json
{
  "kind": "resolution",
  "parents": ["<sorted head hashes>"],
  "recoveries": [
    {
      "entityType": "entry",
      "entityId": "<deterministic recovered id>",
      "versionHash": "<recovery-init hash>"
    }
  ],
  "state": {}
}
```

`recoveries` is sorted before canonical hashing. A pulled resolution whose recovery objects are missing is **incomplete** (§6.3) — fetched directly, verified against the declared deterministic IDs/hashes, and not materialized until present. If a device crashes before publishing the resolution, the original fork remains visible and any device safely recomputes the identical recovery. The same rule covers recovered tags/prompts and any entry rewrites they require.

**Identical-state heads:** if multiple heads carry identical canonical domain state, any device may publish one deterministic `join` whose parents are all identical-state heads, restoring the single-head invariant. A recovered-copy entity's first version is a `recovery-init` with parents `[]` and fully deterministic content, so all devices mint the identical initial version for the same recovered ID.

### 5.3 Media blobs

`blob_hash` = SHA-256 of the file bytes; identical media dedupes naturally. Upload via Drive resumable sessions: transfer chunks must be multiples of 256 KiB (except the final chunk); session URIs are persisted with their expiry (≈ one week) and an expired or missing session starts a new one rather than failing the blob. Limit concurrency to 2–3 uploads. Downloaded blobs are hash-verified before being trusted.

**Local blob storage is content-addressed** (`media/blobs/<hash>` inside app storage) for all downloaded, staged, and recovered bytes; multiple logical assets (an original entry, its recovered copy, the profile photo) may reference the same file. Legacy picker-imported files remain at their original URIs until first staged. **Reference-safe deletion:** a local blob file is deleted only when no `media_assets` row and no `sync_retained_media` obligation references its hash (§7.1).

### 5.4 Streaming hash — Phase-0 spike (blocking)

`expo-crypto.digest()` hashes one complete `BufferSource` and exposes no incremental `update()`; hashing chunks independently does not produce the file's SHA-256. Loading a long voice memo fully into JS memory is forbidden. Phase 0 selects, on physical devices, one of:

1. `react-native-quick-crypto` (JSI) streaming `createHash('sha256')`;
2. `hash-wasm` incremental SHA-256;
3. `@noble/hashes` incremental SHA-256 (pure JS, slowest — acceptable only if benchmarks pass);
4. a small inline Expo native module (Swift `CryptoKit` / Kotlin `MessageDigest`);
5. **fallback:** reinstate the chunk-manifest blob format if no whole-file streaming hash is viable.

Benchmark against the largest supported media file (§13 numeric targets) on both platforms, reading bounded byte ranges via `expo-file-system` handles. Decision recorded in the Phase-0 ADR before adapter work begins.

### 5.5 Publish ordering (dependency-complete)

For any outgoing change set, publish in this order:

1. every blob referenced by primary **or recovered** states;
2. every provisional local `edit`/tombstone version used as a parent by a resolution (§6.1);
3. every recovered entity's `recovery-init` version (recovered tags/prompts before entries that reference them);
4. the original entity's `resolution` (or the plain `edit`) version **last**.

A crash between any two steps leaves only harmless unreachable objects or a still-visible fork — never a resolution that references unpublished dependencies. A version file must never be published before everything it references is uploaded and verified.

## 6. Sync algorithm and conflict rules

One process-wide sync mutex (serializes sync passes only — user editing is never blocked); the database, not component state, is the source of truth.

States: `disabled → connecting → initializing → idle`; `idle → dirty → pulling → resolving → pushing → verifying → idle`; any active state → `paused_auth | paused_quota | paused_corrupt | deferred_offline | revoked` (§6.6).

### 6.1 One pass — provisional local branches before remote apply

1. Acquire mutex, recover abandoned upload sessions (restart expired ones).
2. Check network policy (Wi-Fi-only media if enabled), refresh credentials. **Check the `revocations/` prefix (direct listing).** Any valid revocation marker ends the pass immediately and hands off to §6.6 — nothing is pushed, ever, into a revoked vault.
3. **Pull:** fetch change page(s) via cursor; download new entity version files; validate caps, schema, `vaultId`, and filename↔body-hash match. Stage the entire fetched page; **do not materialize remote state over any dirty entity yet.** **A pass whose pull step did not complete must not push** — pull-before-push is a hard ordering invariant (it is also what makes revocation dominate stale offline writes).
4. **Branch:** for every dirty entity, in a short transaction: read the desired domain state, the outbox base head set (as maintained by the provisional-chain rule, §4.1), and the current `local_generation`; skip (defer) the entity if a referenced blob hash is not yet ready; otherwise construct a **provisional local `edit` version** (or provisional tombstone for a pending delete) with `parents = outbox base heads`, insert it into `sync_versions` as `provisional`, and record the captured generation.
5. **Resolve:** complete ancestry (§6.3), compute head sets **including provisional local versions**, and resolve per §6.2. A remote version is a fast-forward only if it descends from the entity's _actual_ current state — which now includes the provisional branch.
6. **Apply:** materialize only the _resolved_ result into domain tables in bounded `origin:'remote'` transactions, ordered per §6.5 — **guarded per entity by the Apply CAS rule (§4.1): re-read `local_generation` inside the transaction and skip the domain write if it advanced past the captured value.** Invalidate query keys after commit.
7. **Push:** upload per §5.5 (blobs → provisional parents → recovery-inits → resolutions/edits). Content-level idempotent throughout.
8. **Settle:** clear each outbox row only if its `local_generation` still equals the captured value; otherwise leave the entity dirty and **advance its base head set per the provisional-chain rule (§4.1)**. Persist cursor and status; advance the retained-media ledger and delete files whose obligations and grace period are satisfied.
9. Short second change check; if raced, schedule one immediate follow-up pass (no infinite loop).

All HTTP: bounded exponential backoff with jitter, timeouts, cancellation, normalized errors, persisted resumable state. A process kill at any line is safe to retry — a surviving `provisional` version is either re-verified against the current outbox state or discarded and rebuilt. Periodic full listing (e.g. weekly or on verify) reconciles against cursor bugs or externally deleted files, and re-checks for a revocation marker.

### 6.2 Conflict resolution — defined for N heads

Concurrency is a **head set** of two or more versions (provisional local branches included); the rules never assume exactly two.

Merge base: compute the **maximal common-ancestor set** of the heads. Exactly one → it is the base. Several (criss-cross) or none usable → **fail safe**: skip any rule that requires causal ordering (in particular causal set-removals) and fall back to preservation-first behavior — never pick an ancestor by traversal order.

Resolution over head set `H`:

- Group heads by identical canonical domain state; each distinct state is one **candidate**, represented deterministically by the **lowest head hash** in its group (this representative hash is what derives recovered IDs).
- **Single candidate:** publish a deterministic `join` (§5.2).
- **Sets (tags/assets on an entry):** merge across all candidates against the base by stable ID. Concurrent adds survive; a removal wins only if it causally follows an observed add _and_ the base is unambiguous; otherwise the item is retained.
- **Named scalar fields (mood; profile display name and photo descriptor):** if exactly one candidate differs from base, take it. Otherwise deterministic primary (ordered by representative hash), with **each non-primary candidate's scalar values stored in the `sync_conflicts` alternates column** (§4) and surfaced in the conflict UI. **This is an explicitly narrower promise than full no-loss** (see property list below): alternates survive as inspectable conflict records and as retained superseded versions in the vault's ancestry, not as live domain rows. Producing recovered copies for a mood or profile-name conflict was judged worse UX than a visible "kept X, the other device had Y" record.
- **Title/content edited in ≥2 candidates:** no text merging. The deterministic primary stays on the original entity ID; **every other distinct authored state becomes its own recovered copy**, ID derived from (original ID + sorted conflicting head hashes + candidate representative hash), created via a deterministic `recovery-init`, labeled locally, original timestamps preserved.
- **Recovered-copy assets:** `asset_id` is a global PK owned by one entry, so recovered entries must not reuse the original's asset IDs. Derive `recoveredAssetId = SHA-256("tackbok-recovered-asset-v1" + recoveredEntryId + originalAssetId)`; the recovered descriptor keeps the original `blob_hash`, MIME type, and dimensions/duration, so bytes stay content-deduplicated while logical identity is unique. This remapping is part of deterministic recovery-state construction.
- **Delete vs edit:** a delete that descends from every observed edit wins; a delete concurrent with any edit preserves that edit (recovered if necessary); delete-only candidates converge on one tombstone. (This rule governs ordinary per-entity deletion only — vault revocation, §6.6, is not a merge participant and dominates unconditionally.)
- **Tag/prompt renames:** deterministic primary, recovered duplicates for alternates (which may share display titles — §4 dropped the DB unique constraint; `conflict_origin_id` disambiguates in UI); entry references rewritten in the same transaction, with recovered tags published before referencing entries (§5.5).

The resolution lists **every resolved head** as a parent and declares its `recoveries` (§5.2), collapsing the entity to one head everywhere. Raced resolutions are byte-identical and deduplicate at the provider.

Required properties of `ancestry/` + `conflicts/` (pure packages): determinism, convergence, idempotence, stable conflict IDs, N-head and criss-cross safety, provisional-branch participation, and **no loss, precisely defined as**: every authored *title/content* state remains reachable as live data (original or recovered copy); every authored *named-scalar* state remains reachable as a stored conflict alternate plus retained ancestry; every authored *set element* addition survives unless causally removed. The property tests assert exactly this contract — the scalar carve-out is tested, not hand-waved.

### 6.3 Missing parents and dependencies: a version is not valid until its ancestry is

A downloaded version whose parents — or, for resolutions, declared recovery objects — are unknown is **not a head and not applicable**. Causes: later listing page, out-of-order change delivery, incomplete local cache, external deletion/corruption, malformed/malicious references.

Policy:

1. Store as `incomplete` — never materialized, never treated as a creation or head.
2. Attempt direct reads at `entities/<type>/<entity-id>/<hash>.json` for missing parents and recovery objects.
3. Recursively fetch missing ancestry with explicit depth, object-count, and byte limits.
4. Verify every fetched object's hash, `vaultId`, entity type, and entity ID (cross-entity, self-referencing, or cyclic references are invalid and quarantine the referencing version).
5. During initial restore, do not declare anything missing until all listing pages are processed.
6. Apply or resolve a child only when its required ancestry and recovery dependencies are complete and verified.
7. If a required object is genuinely unavailable, mark only the affected entity (and vault, if systemic) as `degraded` per §7.2 — other entities continue syncing.

### 6.4 Tombstones: where ordinary deletion lives

- Deleting an entity **hard-deletes its domain rows** (entry, `entry_tags`, `media_assets`), so existing UI queries stay unmodified — no `deleted_at` filters anywhere.
- In the **same transaction**, affected media metadata is copied into `sync_retained_media` and the tombstone is enqueued; the original file is _not_ touched in that transaction (§7.1).
- Deletion knowledge persists in `sync_entity_state` (tombstone flag) and the immutable remote tombstone version.
- A domain row is reconstructed only when conflict resolution preserves a concurrent edit (recovered entry).
- Tombstones cover **individual** entity deletion only. "Delete journal everywhere" and "Delete cloud backup" do not enqueue per-entity tombstones — they use §6.6.

### 6.5 Multi-entity operations are eventually consistent — by design

Tag deletion, conflict expansion, ZIP import, and initial seeding touch several independent entity histories; another device can observe part of the operation before the rest arrives. The engine treats this as expected:

- validate and stage a full change page before materializing;
- apply tag/prompt upserts before the entries that reference them;
- park dangling entry→tag references while the tag's ancestry/change page is incomplete (never drop, never error);
- apply relationship removals and tombstones after upserts;
- every step restartable and idempotent;
- `batch_id` is diagnostics only — it does not imply atomic remote publication.

**Entry referencing a validly tombstoned tag** (cross-entity DAGs cannot prove causal order — e.g. one device deletes a tag while an offline device concurrently adds it to a new entry). Preservation-first:

- tag missing with incomplete ancestry → park temporarily (above);
- valid tag tombstone and no surviving entry references after the pass → the deletion stands;
- valid tag tombstone **plus** a surviving concurrent entry reference → create a deterministic recovered tag from the last known non-tombstone tag state, rewrite the entry to the recovered tag ID, record the recovery, and publish the recovered tag before the referencing entry version;
- no non-tombstone tag state recoverable → keep the entry data without the association and surface a diagnostic; never block sync forever.

### 6.6 Vault revocation — how "Delete journal everywhere" and "Delete cloud backup" actually work

Per-entity tombstones cannot deliver either promise: immutable historical versions and blobs would remain physically in the vault, a stale offline edit would survive the §6.2 delete-vs-edit rule and resurrect content, and the provider contract had no delete operation at all. Revocation replaces tombstones for these two actions.

**The revocation marker.** A content-free file at **`revocations/<content-hash>.json`** — hash-named like every other immutable object, so the `putImmutable` contract holds unchanged (identical markers dedupe; *different* markers are simply *additional* markers at their own keys, never a same-key conflict). Body: `formatVersion`, `vaultId`, `kind` (`journal-deleted` | `backup-deleted`), a random `revocationId`, and a display-only wall-clock timestamp. It contains no journal data. **A vault containing at least one valid revocation marker is dead**: it is never joinable from the connect flow (§8 discovery lists it as revoked), no device may push to it, and the `revocations/` prefix is the one namespace every purge sweep preserves. **Precedence is an observed-marker contract, not a global one.** In a serverless system where devices act irreversibly on the first marker they see, *global* dominance of one kind over another is unprovable — a device that observed only `backup-deleted`, disconnected, and can never rejoin the dead vault will never learn that a concurrent `journal-deleted` marker existed. The contract is therefore stated over what a device observes:

- each device acts once, on the **strictest kind among the markers visible in the listing it acted on** (`journal-deleted` strictest); having acted, its outcome is final;
- concurrent same-kind revocations converge trivially (all markers preserved; purge idempotent);
- the one reachable divergence — device saw only `backup-deleted`, acted, and a concurrent `journal-deleted` marker surfaces later — leaves that device disconnected **with its local data kept**. This is accepted, documented, and reflected in §16 and the confirmation copy: both destructive actions require the vault owner's own blocking confirmation, so this state is reachable only by the user racing two of their *own* destructive commands within one sync interval, and the resulting outcome ("that device kept its journal locally") is precisely what their own `backup-deleted` command requested for it. No third party, no resurrection of remote data, and every device still ends disconnected from a dead vault.

The fixture suite asserts exactly this: every device converges to the outcome of the marker set it observed, never resurrects remote data, and never rejoins a revoked vault.

**Initiating-device sequence** (both actions):

1. Show the blocking confirmation (§11.3 copy; §16 semantics).
2. Publish the revocation marker **first**.
3. Run the purge: `deleteVaultResidue` in bounded, resumable batches — permanent deletes (Drive appdata has no trash) of every entity version, blob, and vault marker, preserving only the `revocations/` prefix. Progress is persisted; app kill resumes the purge on next launch. The device stays connected until the purge verifies.
4. Verify by full listing that nothing but revocation markers remains; only then does the UI report the deletion complete — phrased per the honesty rule below.
5. `journal-deleted` only: hard-delete local journal data (domain + sync tables, outbox cleared, retained-media ledger drained without upload obligations), then disconnect. `backup-deleted`: keep local data, disconnect.

**Every other device**, on its next sync pass, sees the marker at step 2 of §6.1 — **before pushing anything** (pull-before-push, and the marker check precedes pull). Behavior by kind:

- `journal-deleted` → wipe local journal (hard delete, **nothing enqueued** — there is no vault to notify), disconnect, and show the non-blocking §16 notice: "Your journal was deleted from another device on ‹date›" (date from the marker).
- `backup-deleted` → keep local data, disconnect, non-blocking notice: "Your cloud backup was deleted from another device on ‹date›."

**Why stale offline writes are dominated (logically):** a returning device cannot publish without first completing the marker check and pull in the same pass (§6.1 hard invariant), so **no conforming client will ever restore, materialize, or merge revoked data** — that guarantee is absolute. **Physical residue is explicitly best-effort:** a late writer can pass the marker check, upload after the initiating device's verified-empty listing, and crash before its next pull — the provider may then hold orphaned objects inside a dead, unjoinable vault. This race is unavoidable without a coordination server, so the product promise is narrowed rather than overstated: the journal is **durably revoked** (never restorable by conforming clients), and residue deletion is **best-effort and re-swept** — every client that observes marker + residue (at connect-time discovery or the §6.1 marker check) idempotently resumes the purge, and a device that discovers the marker immediately after its own push best-effort deletes what it just uploaded before disconnecting. The bounded leftover risk is documented in user-facing help.

**Interrupted purge:** the vault is already dead (marker present), so interruption never resurrects anything; discovery of a revoked vault with residue offers "finish deleting" to any signed-in device.

**Recreating a backup later** uses a fresh vault ID; the tiny marker in the old namespace persists indefinitely as the durable record old devices need.

**UI honesty rule:** logical revocation (marker published, purge in progress) is shown as "deleting…"; after step 4's verified listing the UI says the backup **"has been deleted"** with help text noting that a device syncing at that exact moment may leave fragments that are automatically removed when it next connects — never an unqualified claim that no byte can remain. The plan explicitly distinguishes logical revocation, verified purge, and the best-effort residue sweep.

## 7. Media lifecycle and provider-side damage

### 7.1 Retained-media ledger — every byte-removal path, not just entity deletion

Filesystem operations cannot be atomic with SQLite, and after a domain hard delete no domain row describes the file — so retention is driven by the durable `sync_retained_media` ledger. **Every operation that removes or replaces media bytes routes through the ledger** — entity deletion, removing a photo/voice memo during an entry edit, replacing or clearing the profile photo, and recovered-copy construction that needs bytes the primary no longer references. No code path deletes a media file directly; §3's edit flows are refactored accordingly.

1. Domain transaction: apply the domain change (hard-delete rows, or update the entry/profile to drop the asset), copy the removed asset's metadata (URI, kind, size, hash-if-known) into the ledger as `recorded` **and insert one `sync_media_obligations` row per operation that still needs the bytes** (§4), enqueue the change. **The file itself is untouched.**
2. A worker later moves/copies the file into the content-addressed store (`staged`), hashes it if needed, and uploads (`uploaded`). New obligations (a recovery, a resolution, a repair) may attach to an existing ledger row at any time before deletion.
3. A ledger row becomes `safe_to_delete` only when **every** obligation row for it is completed or abandoned; the file is physically removed after the grace period **and only if the reference count is zero — no `media_assets` row, no live obligation, and no other ledger row references its hash** (reference-safe deletion, §5.3). The fixture where one obligation completes while another for the same blob remains pending must keep the bytes.
4. A crash at any point leaves either the original URI or the staged URI recorded — bytes a queued change, provisional version, recovery, resolution, or repair needs are never lost.

The ledger is also the repair source when a referenced remote blob turns up missing (§7.2).

### 7.2 Remote damage is corruption

Only a valid tombstone version deletes journal state (and only §6.6 revocation kills a vault). A missing/corrupt remote object (including filename↔hash mismatch or a genuinely unavailable required parent/recovery object):

- marks the affected entity — and the vault, if systemic — `degraded` and stops applying the affected change;
- re-uploads from a verified local copy or the retained-media ledger when possible;
- if a blob is unrecoverable, restores entry text with a visible missing-media placeholder and diagnostic record;
- if the vault marker is gone (but no revocation marker exists), pauses and offers "Recreate cloud copy", "Choose another vault", or "Disconnect" — never silently recreates.

### 7.3 Documented limitation: externally deleted terminal versions

A brand-new device cannot detect that an **unreferenced head version** was externally deleted from the provider — nothing surviving points at it. Precisely:

- existing devices repair provider deletions they can observe, from verified local state;
- fresh restore verifies everything still referenced by the surviving graph;
- fresh restore **cannot prove** an unreferenced terminal version was never removed;
- provider storage therefore remains a real dependency, and manual ZIP export remains the independent disaster-recovery path.

For hidden Drive `appDataFolder` this is an acceptable, documented v1 risk. **Revisit before Dropbox ships** (App Folder files are user-visible and deletable); a future immutable inventory/checkpoint or per-device head-announcement file can close the gap without any server.

### 7.4 No automatic GC

The only remote deletions in v1 are the explicit, confirmed revocation purges of §6.6 (which also remove duplicate physical files from at-least-once writes, since they delete everything). Show provider-reported quota/estimated size. Storage-for-safety trade-off, documented.

### 7.5 Blob download and partial-restore states

- Entry **text is materialized before its media arrives**: a restored entry whose ancestry is complete renders immediately; each asset renders by `download_state` (§4).
- `pending`/`downloading` (including waiting-for-Wi-Fi under the §16 default policy) shows a *downloading / waiting for Wi-Fi* placeholder — visually and semantically distinct from `missing` (§7.2's unrecoverable-blob placeholder). Pending is never presented as data loss.
- `media_assets.local_uri` is null until the blob is downloaded **and hash-verified** into the content-addressed store; verification state persists across restarts.
- Blob downloads respect the Wi-Fi-only policy, run at bounded concurrency, and are prioritized by what the UI is showing (visible timeline first), then recency.

## 8. New-device and restore flows

Entry points: Settings → Backup & Restore (§11.2) and the onboarding "Import your journal" sheet (§11.5) — both lead into the same flow below.

1. Connect Google authorization (§3.3; `drive.appdata` scope, plus the sign-in layer's default identity scopes for the account label).
2. Discover Tackbok vaults under `tackbok-vaults/`. Revoked vaults (§6.6) are listed as revoked — joinable never, "finish deleting" offered if residue remains.
3. No live vault → create from local data. Vault + empty local → restore. Both non-empty → explicit "Merge local and cloud data" confirmation; never silently overwrite either side. Multiple vaults (including bootstrap races that created two) → explicit selection flow.
4. Assign a new `device_id`, publish initial versions, verify.

**Initial-vault seeding (the create-from-local-data path).** Existing rows predate the outbox, and the user keeps editing while the first backup is prepared. Seeding is a **resumable, checkpointed enumeration** that runs through the ordinary outbox — not a special publish path:

- in bounded transactions, walk each entity type in stable-ID order and insert an outbox row (`batchId: 'initial-seed'`, base heads `[]`) for every entity that has **neither an outbox row nor any persisted sync state/version history** (`sync_entity_state` row or `sync_versions` entry) — the second condition matters because ordinary passes drain the queue concurrently: an ahead-of-cursor entity can be edited, published, and have its outbox row cleared before the seeder reaches it, and seeding it with base `[]` would mint a false second root. An entity with published history is already in the vault and needs no seeding;
- the per-type/last-ID checkpoint commits in the same transaction as each batch (`cloud_vault` seeding checkpoint, §4), so a crash resumes without skipping or duplicating;
- entities created *during* seeding need nothing special — every write path already enqueues (§4.1), and insert-if-absent cannot regress them;
- seeding completion is recorded before the vault is reported as fully backed up; ordinary passes (§6.1) run concurrently and drain the queue with the same generation/CAS/provisional-chain guarantees as any other mutation.

Initial restore lists and downloads the full version history (per-file HTTP round-trips on Drive — measured in Phase 0, §12). Discovery is resumable: interrupted restores continue from persisted listing state; orphan staging (§6.3) tolerates out-of-order pages; the app remains usable while restoration is incomplete. **During partial restore, an entity whose ancestry or recovery dependencies are not yet verified is presented as still-restoring, not as final state** (media per §7.5), and restoration progress is visible.

Provider switching (once Dropbox exists) is an explicit migration: pause old, connect new, copy the logical vault incrementally, verify, activate, then ask about the old copy. Never two writable providers.

## 9. Scheduling and background behavior

Event-driven with safety nets — no daily/weekly modes:

- outbox write is immediate and offline-safe on every committed save (never per keystroke);
- network work debounced ~30–120 s so bursts become one version;
- sync on app-active, on connectivity-restored, on backgrounding (best-effort), plus an OS-managed periodic task (`expo-background-task`); background passes are bounded (pull, upload prepared small objects, persist, return);
- **Sync now** button; optional **Wi-Fi only for media** and **Pause sync**.

Initial-backup screen is dismissible and honest: "You can leave this screen; syncing resumes when Tackbok is active." A native `URLSession`/WorkManager transfer module is a Phase-6 decision, only if measured Expo background behavior is inadequate for the product promise — copy must match measured behavior. Cloud sync never requests notification permission.

## 10. Security and privacy

- Buttons say **Connect Google Drive** — storage authorization, not a Tackbok identity. No Tackbok account. (App Review 4.8: not a primary login, so no Sign-in-with-Apple obligation; re-evaluate if a real account system ever appears.)
- Authorization per §3.3 (native path on Android; PKCE with reversed client ID on iOS); tokens only in `expo-secure-store` — never SQLite, Zustand persistence, logs, or analytics.
- Scopes: `drive.appdata` for data, plus the sign-in layer's basic identity (`openid email`) used **only** to label the connected account on-device (`cloud_vault.account_label`); the label never enters the vault, analytics, or diagnostics exports. The disclosure screen states both.
- **Encryption: none in v1** (rationale in §1). Disclosure text: _"Cloud data is protected in transit and by your storage provider. Tackbok does not end-to-end encrypt cloud backups in this version."_ Privacy policy (plain language, per site conventions) updated in the same release.
- Diagnostics/analytics never contain journal text, titles, file names, tag names, emails, tokens, device IDs, version hashes, or content hashes (redact hashes/IDs from the diagnostics export unless deliberately and visibly included). Coarse allowlisted events only: `cloud_sync_connected` (provider), `cloud_sync_started` (trigger), `cloud_sync_succeeded` (coarse buckets), `cloud_sync_failed` (normalized category), `cloud_sync_conflict_recovered` (entity type only), `cloud_sync_repair_result`. Update `src/lib/analytics/events.ts`, its tests, the privacy-screen allowlist, and the website policy together.
- Local diagnostics export: redacted state, versions, counts, normalized errors — safe to attach to a GitHub issue.

## 11. UI plan

### 11.1 Home header

Compact `CloudSyncStatusButton` in the currently empty space between the centred "Tackbok" title and the avatar (`src/screens/home/Header.tsx`): hidden when unconfigured; synced / syncing / queued-offline / warning states. Tap opens a status sheet: provider + account, last success, queued estimate, progress, **Sync now**, **Manage cloud backup**. Title must stay truly centred (balanced zones or absolute centring); test narrow screens, long translations, RTL, Dynamic Type.

### 11.2 Settings → Backup & Restore

Replace the current mock section (disabled "Google Drive Backup" toggle + "Backup Frequency › Daily" row) with:

- **Cloud Backup & Sync** — Off / Google Drive;
- connected account + last successful sync;
- **Sync now**;
- **Media transfers** — Wi-Fi-only toggle (default per §16);
- **Backup health** — verify/repair action + last verification;
- **Manage provider** — reconnect, disconnect, recreate cloud copy, delete cloud copy;
- existing **Export as .ZIP**, **Import as .ZIP**, and third-party import rows (Gratitude, Presently) unchanged in placement.

Remove `SettingsBackupFrequencyModal.tsx` and `backupFrequency` after a compatibility migration; replace `googleDriveBackupEnabled` with provider-neutral display prefs (authoritative state lives in sync tables, tokens in SecureStore).

New screens/sheets: connection flow (disclosure → OAuth → vault discovery → create/restore/merge choice → initial progress — reached from here **and** from the onboarding import sheet, §11.5), conflict-recovered badge/list (using `conflict_origin_id`; "Recovered conflict" is a localized presentation label, never synced; scalar conflicts show their stored alternates, §6.2), restore-progress state (§8), the revocation notices (§6.6), and the destructive-action set below.

### 11.3 Destructive actions stay distinct

**Disconnect provider** (local + remote both remain) / **Delete cloud backup** (revocation `backup-deleted`: marker + verified purge; local data remains; other devices disconnect with a notice — §6.6) / **Delete journal everywhere** (revocation `journal-deleted`: marker + verified purge + local wipe; devices that act on this marker wipe and disconnect with a notice — §6.6) / **Reset this device only** (disconnect first so the local hard-delete cannot propagate). The existing "delete all data" flow must be re-labeled into these explicit variants. Progress copy distinguishes "deleting…" (purge running) from "deleted" (verified empty listing) per §6.6's honesty rule. The sole mixed-marker exception is the concurrent `backup-deleted` case defined in §6.6 and §16.

### 11.4 Localization & accessibility

English, Arabic, German, Hebrew, Simplified Chinese, Traditional Chinese in the same change. RTL status placement, accessible names, progress announcements, non-colour error indicators.

### 11.5 Onboarding restore entry point (signed off 2026-08-08)

The onboarding welcome screen's **"Import your journal"** sheet gains a **"Google Drive Backup — restore from your cloud backup"** row, placed **first**, above the existing Tackbok-ZIP / Gratitude / Presently rows. This is an *entry point only* — it navigates into the exact §8 connect flow (disclosure → OAuth → vault discovery → restore); no separate onboarding-specific sync flow exists.

Why it is required, not optional: the primary disaster-recovery journey is *new/reset phone → install → onboarding*. Catching the user here, while local data is still empty, puts them on the clean "vault + empty local → restore" path and avoids the both-sides-non-empty merge flow almost entirely. It is also the natural continuation after **Reset this device only** (which ends in re-onboarding).

Rules:

- **Optional and failure-tolerant.** Onboarding must still complete fully offline. Cancelled/failed OAuth returns to the import sheet with no state change. No vault in the account → "No Tackbok backup found in this Google account" → back to the sheet (do **not** offer to create a vault here; backup creation for a fresh journal lives in Settings after onboarding).
- **Disclosure before OAuth.** The §10 plaintext-at-provider disclosure appears in this path exactly as in the Settings flow — same component.
- **Copy consistency.** The welcome tagline "Your journal stays on your device." is softened in the same release (e.g. "Your journal stays on your device — with optional cloud backup.") so the two messages don't contradict within one screen. Localized in all §11.4 languages.
- **Restore progress reachable from onboarding.** After connecting, the user lands in the app with restore possibly incomplete; the §8 still-restoring presentation and progress UI must work when entered via onboarding, not only via Settings.
- Dev-testing caveat: OAuth requires a dev-client/release build and (while the consent screen is in Testing) a listed test-user account — Expo Go cannot exercise this path.

## 12. Implementation phases

**Phase 0 — format ADR, fixtures, and four blocking spikes.** ✅ **Completed — gate conditionally closed 2026-08-09** (owner waiver: no physical devices available; evidence, re-scoped items, and the Phase-3 merge-blocking obligations are recorded in [docs/cloud-sync/phase0/gate.md](docs/cloud-sync/phase0/gate.md)).
ADR covering: plaintext v1, one provider, canonical JSON rules, hash-named multi-parent version format with `vaultId`, device-neutral system versions with `recoveries`, provisional-local-branch rule, **Apply-CAS and provisional-chain rules (§4.1)**, ancestry-based head-set rule, N-head conflict rules + ambiguous-merge-base fallback + candidate representative hashes, **the narrowed scalar no-loss contract (§6.2)**, recovered-asset ID derivation, tag/prompt uniqueness relaxation, tombstoned-tag reference rule, missing-parent/dependency policy, **vault revocation protocol (§6.6)**, **profile singleton entity**, content-level-idempotent Drive semantics, vault namespace, terminal-version deletion limitation, no GC, **all validation-cap numeric values**, and the numeric performance targets of §13 (Phase 0 may tighten them; loosening requires explicit sign-off).
Spikes: (a) streaming SHA-256 selection on physical devices (§5.4); (b) Drive appDataFolder behavior probe — duplicate names, appProperties queries, resumable session expiry, **permanent `files.delete` semantics for the revocation purge**; (c) **restore-scale probe** — list thousands of appDataFolder objects, bounded concurrent downloads of small JSON files, ancestry reconstruction time/memory, interrupted-discovery resume; (d) **authorization spike (§3.3)** — Android native authorization (library vs. inline module), iOS PKCE-or-native decision, silent refresh, revocation handling, account-label sourcing, all on physical devices, written up as an ADR. **Protocol v1 is confirmed only when (c) meets the §13 restore targets, or the immutable checkpoint/index fallback is added to the format.**
Golden fixtures: tiny vault, linear history, symmetric fork, asymmetric fork, three-head fork, criss-cross / multiple-merge-base, set-merge fork, text-conflict recovered copy (with recovered-asset remapping), **scalar conflict with stored alternates**, delete/edit fork, raced double-resolution (byte-identical output required), **dirty-local vs. pulled-remote (provisional branch)**, **dirty-local delete vs. remote edit**, **generation N+1 saved during sync of N — asserting final N+1 domain content, ancestry N+1→provisional-N, remote set-changes preserved through the follow-up merge, and no spurious recovered copy**, **entity clean at pull start → local edit commits before Apply → Apply must not overwrite the edit or manufacture false ancestry**, **crash after each §5.5 publish step**, **vault revocation (both kinds): stale offline device returns and is dominated; interrupted purge resumes; residue re-sweep; late writer after verified purge**, **concurrent destructive actions on two devices — `journal-deleted` vs `backup-deleted` markers coexisting; each device converges to the strictest kind it observed and its outcome is final; a third device that acted on `backup-deleted` alone keeps local data per the §6.6 contract; idempotent retries**, **initial seeding raced with concurrent edits, including an ahead-of-cursor entity edited and fully drained before the seed cursor reaches it**, **profile conflict (name and photo)**, **one blob with multiple obligations — one completes, another pending, bytes must survive**, **ZIP round-trip preserving entry, tag, custom-prompt, asset, and profile identities under `backupVersion: 1`**, child-before-parent delivery, missing/corrupt/cross-entity parent, missing recovery dependency, ancestry-cycle rejection, tombstoned-tag concurrent reference.
Gate: fixtures round-trip byte-identically on iOS, Android, and Jest; all four spikes have written decisions. **The implementing agent stops here for review.** *(Review completed 2026-08-09; Phase 1+ green-lit under the gate.md waiver.)*

**Phase 1 — normalized model + transactional outbox.** ✅ **Completed 2026-08-09** ([gate evidence](docs/cloud-sync/phase1/gate.md)). Schema-only migration + checkpointed backfill (§4.2, including the tag/prompt unique-constraint relaxation and the **profile migration out of Zustand**), transaction-scoped repositories, all write paths routed (including profile and edit-time media removal through the ledger, §7.1), generation counters + per-device edit sequence, tombstone/hard-delete split with the retained-media ledger, ZIP export/import with additive stable-ID fields on the normalized model (§3). **Repositories/dual-write go live before the backfill starts, and the reconciliation pass runs before migration is declared complete (§4.2).** Gate: killing the app after any domain commit — or mid-backfill — never loses queued sync intent, retained media, or ID-assignment consistency; the concurrent-write-during-backfill matrix (edit, delete, tag membership, asset replacement, profile change, restart) leaves normalized tables, legacy fields, and the outbox consistent.

**Phase 2 — engine against the fake provider.** ✅ **Completed 2026-08-09** ([gate evidence](docs/cloud-sync/phase2/gate.md)). Canonical codec, hashing, `ancestry/` (head sets, merge-base sets, orphan staging, validation caps), provisional-version construction, entity-version construction including system versions with `recoveries`, outbox coalescing + generation settle rule + **Apply CAS + provisional-chain rebase**, state machine, N-head conflict package with recovered-asset remapping and scalar alternates, multi-entity apply ordering + tombstoned-tag recovery, **initial seeding**, **revocation handling against the fake provider (observed-marker behavior, purge resume, both kinds)**, crash recovery, provider contract suite (at-least-once duplicates, out-of-order delivery, **delete idempotency**). Gate: two and three simulated devices converge under reordered, duplicated, interrupted, concurrent, raced-resolution, orphaned-version, and dirty-during-sync operations, **and a revoked vault dominates a stale offline writer in every interleaving the chaos suite generates**.

**Phase 3 — Google Drive adapter.** 🚧 **Code implemented 2026-08-09; STOPPED before owner-dependent real-Drive/auth probes — gate open, do not merge** ([handoff and remaining evidence](docs/cloud-sync/phase3/gate.md)). Authorization per spike-d ADR (per §3.3–3.4) + SecureStore handling, vault-namespace key mapping via appProperties, change cursors, resumable blob upload/download with session expiry handling, duplicate tolerance, **permanent-delete operations + revocation purge against real Drive**, error normalization. Gate: contract suite passes against real Drive; physical-device ~200 MB media fixture passes; **a real end-to-end connect → grant → refresh-after-expiry → revoke cycle passes on physical Android and iOS devices**.

**Phase 4 — runtime + UI.** `SyncRuntime` startup in `_layout.tsx`, AppState/network triggers, debounce, background-task registration, all screens/sheets from §11 (including the onboarding restore entry point + tagline update, §11.5, and the revocation notices), translations, accessibility. Gate: setup never requests notification permission; an offline edit immediately shows as safely queued; onboarding completes fully offline with the Drive row failing gracefully.

**Phase 5 — hardening + rollout.** Cursor/full-reconciliation soak tests, full restore-scale fixture (§13), verify/repair tooling, privacy policy + analytics allowlist + store-review notes, feature flag, internal dogfood with deliberately conflicting devices (including a third device), staged rollout. Kill switch pauses network sync but preserves outbox and local data; rollback never deletes provider data.

**Phase 6 — background-transfer decision.** Measure Expo background behavior on physical devices with large initial backups; build the native transfer module only if the product requires continuous minimized upload; otherwise keep the accurate resumable wording.

**Deferred (in order of likelihood):** Dropbox adapter (revisit §7.3 first; portability caveat in §3.2), vault compaction/GC with checkpoint semantics, immutable checkpoint/index for restore scale if the probe demands it, opt-in passphrase E2E encryption (new format version, one-time re-upload), per-device head-announcement/inventory files for deletion detection, coordination service, silent-push wake-ups, WebDAV.

## 13. Verification plan

Unit/property: canonical JSON + golden hashes; system-version byte-determinism across simulated devices; parent and `recoveries` sorting; head-set computation including asymmetric/N-head branches and provisional versions; descends-from; maximal-common-ancestor sets and the ambiguous-base fallback; candidate grouping + representative hashes; recovered-asset ID derivation; every conflict rule + convergence/idempotence/stable-ID properties and the **precisely-scoped no-loss contract of §6.2** under races; orphan and recovery-dependency staging with caps; outbox coalescing, generation settle rule, **Apply CAS, provisional-chain rebase**, blob-hash publishability gate, remote-origin suppression; state-machine transitions including `revoked`.

Integration: migration from a populated current-schema DB (including unique-constraint relaxation and **profile migration**); interrupted/resumed backfill **with ID-stability assertions across kill points**; atomicity of every mutation + outbox + ledger write (including edit-time media removal and profile-photo replacement); tag deletion updating relations in one transaction; imports as one bounded batch; **initial seeding interleaved with edits**; partial multi-entity application resolving cleanly; tombstoned-tag concurrent-reference recovery; query-cache invalidation on remote apply; retained-media ledger surviving crashes at every step; crash-injection after **every** §5.5 publish step **and every §6.6 purge batch**.

Device matrix (two **and three** devices): create/create, edit/edit different fields, overlapping text edits → exactly one recovered copy per alternate everywhere, **mood/profile scalar conflicts → deterministic primary + stored alternates on every device**, dirty local edit vs. newly pulled remote edit, dirty local delete vs. remote edit, media edit awaiting hash while remote edit arrives, **save of generation N+1 during upload of N → final content is N+1 (or its proper merge), ancestry chains through provisional-N, no false conflict**, process death after provisional creation but before publication, offline single edit vs. online multi-edit chain, three-way fork, raced double-resolution → byte-identical files, delete/edit both orders, tag rename/delete with entry edits, concurrent asset add/remove across conflicting states (exercises recovered-asset remapping), **delete-everywhere with a third device offline throughout → returning device wipes, never resurrects, never publishes**, **delete-cloud-backup → other devices disconnect and keep data**, long-offline device, clock skew of months (must be irrelevant), app kill after each publish step, duplicate/reordered version files, child-before-parent delivery, duplicate physical Drive files with identical content.

Failure: OAuth revocation/refresh failure, airplane mode, 401/403/429/5xx, full quota, missing/corrupt blob/version/vault marker, filename↔body-hash mismatch, missing/corrupt/cross-entity parent, missing recovery dependency, ancestry cycle, oversized version JSON, expired resumable session, truncated upload, low storage, process termination, **interrupted revocation purge, revocation marker discovered mid-pass**.

Performance fixtures — **numeric targets** (product-level; Phase 0 may tighten, loosening requires sign-off; "reference device" = a mid-tier 2022 Android device and the oldest supported iPhone):

- **Media (~200 MB mixed):** initial sync total transfer ≤ unique content size + 5% metadata overhead; a later 1 MB attachment syncs ≤ 2 MB total traffic, never 201 MB; text edits upload no media bytes; a failed upload resumes its session (or restarts an expired one); streaming hash sustains **≥ 25 MB/s** on the reference device; the **maximum supported single media file is 200 MB** (larger files are rejected at capture/import with a clear message — nothing may attempt to buffer one in JS memory); timeline scrolling stays **≥ 55 fps** and save latency gains **≤ 25 ms p95** during hashing/uploads.
- **Restore scale (~20,000–50,000 entity-version files** — roughly a decade of daily entries with edits): the app is interactive **≤ 5 s** after launch during an in-progress restore; full text restore (all version files listed, downloaded, verified, applied — media excluded) completes **≤ 30 min on Wi-Fi** on the reference device; peak JS heap during restore **≤ 250 MB**; interrupted-discovery resume loses **≤ 1 listing page** of progress. First measured by the Phase-0 probe **before protocol confirmation**; if the probe cannot meet these, add the immutable checkpoint/index format — never a mutable global head.

Physical devices: iOS background/lock/low-power/force-quit/reboot/re-auth; Android Doze/battery-saver/force-stop/reboot/vendor restrictions; confirm no path depends on notification permission.

## 14. Definition of done

- A current installation migrates without losing or duplicating data — including profile data out of Zustand.
- A ~200 MB vault resumes after interruption; a later 1 MB change does not re-upload 200 MB.
- Two and three devices converge on the full conflict matrix — asymmetric forks, N-head forks, criss-cross histories, raced resolutions, dirty-during-sync — with no silent authored-data loss under the §6.2 contract and no duplicate recovered entries.
- An offline local edit survives every pull that races it (provisional-branch rule); a save during sync is never clobbered by that sync's completion (generation + Apply-CAS rules) and never manufactures a false conflict (provisional-chain rule).
- **"Delete journal everywhere" ends with a vault verified empty at completion time (revocation markers only); every device that acts on `journal-deleted` is wiped and disconnected, and no stale offline edit ever resurrects remote data.** "Deleted" is claimed only after verified listing; late-writer residue is best-effort re-swept per §6.6. The only local-data divergence is a device that already acted on a concurrently observed `backup-deleted` marker, exactly as documented in §6.6 and §16.
- Authorization works end-to-end on physical Android and iOS devices, including silent refresh and revocation recovery (spike-d ADR implemented).
- A brand-new device restores a decade-scale vault within the §13 numeric targets and stays usable meanwhile.
- Provider-side file deletion never masquerades as an in-app deletion; the terminal-version blind spot (§7.3) is documented in user-facing help.
- Auth, quota, offline, corruption, revocation, and unsupported-version states are visible and recoverable.
- Notification denial has no effect on backup.
- No journal content, media, token, device ID, hash, account email, or identifiable account metadata reaches analytics or logs.
- UI localized, accessible, RTL-safe; home title stays visually centred.
- Disclosure and store-review notes accurately describe provider OAuth (including identity scopes for the account label), plaintext provider storage, background behavior, and deletion semantics.
- Manual ZIP export/import still works (stable-ID fields written under `backupVersion: 1`; old archives accepted), independent of cloud sync.

## 15. References

- [Google Drive app-specific data folder](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Google Drive change tracking](https://developers.google.com/workspace/drive/api/guides/manage-changes)
- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads) (256 KiB chunk multiples; session expiry)
- [Google OAuth for installed apps](https://developers.google.com/identity/protocols/oauth2/native-app) (reversed-client-ID redirect on iOS; **custom URI schemes no longer supported on Android**)
- [Android AuthorizationClient](https://developer.android.com/identity/authorization) · [@react-native-google-signin/google-signin](https://react-native-google-signin.github.io/)
- [Expo AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/) · [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) · [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/) · [Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/) · [BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)
- Streaming-hash candidates: [react-native-quick-crypto](https://github.com/margelo/react-native-quick-crypto) · [hash-wasm](https://github.com/Daninet/hash-wasm) · [@noble/hashes](https://github.com/paulmillr/noble-hashes)
- [Apple App Review Guidelines (4.8)](https://developer.apple.com/app-store/review/guidelines/)
- Prior art: Joplin's item-level synchronizer and provider abstraction (inspiration for scope; Tackbok's ancestry protocol is its own design and is tested as such).

## 16. Product decisions — ALL SIGNED OFF

Items signed off 2026-08-08. These decisions are authoritative for implementation.

- [x] **Google Drive only at launch**; Dropbox as a fast-follow.
- [x] **No Hono/coordination server** in v1.
- [x] **Plaintext-at-provider v1** with explicit disclosure; opt-in E2E deferred to a future format version.
- [x] **Profile display data (user name, profile photo) is SYNCED with the vault**, backed by the `user_profile` domain table, transactional repository, and ledger-managed photo (§4, §7.1). Scalar-field rules of §6.2 apply; the photo is a media blob.
- [x] **Profile email is NOT synced.** It stays device-local (and in the ZIP for compatibility). The cloud account already identifies the user; copying the email into the vault adds identifiable data with no product value.
- [x] **Concurrent delete/edit preserves the edited version** (recovered if necessary) — for ordinary per-entity deletion.
- [x] **Overlapping text edits create recovered copies**, never silent last-write-wins.
- [x] **Named scalar conflicts (mood, profile name/photo) keep a deterministic primary with stored, inspectable alternates** — an explicitly narrower no-loss promise (§6.2). Recovered-copy entries for a mood flip were judged worse UX than a visible conflict record.
- [x] **Terminal-version deletion blind spot (§7.3) accepted for v1** — hidden `appDataFolder` makes external per-file deletion an edge case, and manual ZIP export is the independent fallback. Must be revisited before the Dropbox adapter ships (App Folder files are user-visible/deletable).
- [x] **No automatic remote GC in v1.** Superseded versions are ~1–2 KB JSON files — even a decade of heavy editing is tens of MB, while wrong GC in a serverless multi-device system risks permanent data loss. Explicit revocation purges (§6.6) are the only remote deletions; compaction with checkpoint semantics stays in Deferred.
- [x] **Media transfers: Wi-Fi-only by default**, with an explicit user opt-in toggle for cellular data.
- [x] **Uninterrupted minimized initial upload is NOT a launch requirement.** Ship with resumable uploads and honest UI copy ("syncing resumes when Tackbok is active"); Phase 6 measures real background behavior during dogfood and the native `URLSession`/WorkManager module is built only if measured behavior fails real users.
- [x] **Destructive actions split into the four explicit variants of §11.3**, with the multi-device semantics of "Delete journal everywhere" fixed as:
  - it **propagates** through the vault revocation marker of §6.6, not per-entity tombstones: every device that acts on `journal-deleted` is wiped, stale offline edits cannot resurrect the vault, and the vault is physically purged subject to the documented late-residue limitation;
  - the **initiating** device shows the blocking confirmation, which must state explicitly: deletes from this device, the cloud backup, **and every other device connected to this backup**;
  - **other devices never get a blocking prompt** — those that act on `journal-deleted` wipe on their next sync and show a non-blocking notice ("Your journal was deleted from another device on ‹date›");
  - a user who wants only one phone wiped uses **Reset this device only**, which disconnects from the vault first so its local hard-delete can never propagate;
  - "deleted from the cloud backup" is shown only after the purge is verified by listing (§6.6 honesty rule);
  - **documented narrow exception:** if the user *simultaneously* runs "Delete cloud backup" on one device and "Delete journal everywhere" on another, a third device that syncs in that window may act on the `backup-deleted` marker alone — it disconnects but keeps its local journal, which is what the user's own `backup-deleted` command requested. Both actions require the vault owner's blocking confirmation, so this state is reachable only by racing one's own commands; it is stated in help text rather than promised away.
- [x] **ZIP stable-ID fields are additive under the existing `backupVersion: 1`.** New optional fields (tag IDs, custom-prompt IDs, asset IDs, blob hashes); the version number does **not** change because the shipped importer rejects any value other than 1 while ignoring unknown fields — keeping version 1 is the only contract old app versions actually honor (verified in code). Old archives import indefinitely; an old-archive import necessarily mints fresh identities — documented, accepted.
