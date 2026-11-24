/**
 * Backup history (#185 P9): the cloud backup as it was on each of the last
 * 30 days (`retention.ts`), which the user can export as a Tackbok ZIP or
 * restore through the ordinary import. A restore never deletes: it brings
 * back entries the backup had, and the user chooses whether entries in both
 * keep their current values (the import's "skip" mode, the default) or take
 * the backup's ("overwrite"). The import writes them as this device's edits,
 * so they reach every device by the ordinary sync.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { and, eq } from 'drizzle-orm';
import { cloudSyncState, cloudVault, db, userProfile } from '~/db';
import { useSettingsStore } from '~/lib/settings';
import { createExpoZipWriter } from '~/lib/zip';
import {
  BACKUP_ENTRIES_PATH,
  BACKUP_MANIFEST_PATH,
  BACKUP_PROFILE_PATH,
  BACKUP_PROMPTS_PATH,
  BACKUP_TAGS_PATH,
  type TackbokBackupManifest,
} from '~/lib/backupImport/types';
import { snapshotToPortable } from '~/lib/backupExport/snapshotPortable';
import {
  cleanupDeferredBackupZipFiles,
  generateTimestamp,
  saveOrShareZipFile,
} from '~/lib/backupExport/utils';
import { AssetType } from '~/types';
import { createMediaPartialFileSink } from '../snapshot/media';
import { ProductionSnapshotMediaStore } from '../snapshot/storage';
import { backupHistory } from '../snapshot/sync/retention';
import { MediaIntegrityError, type SnapshotProvider } from '../snapshot/sync/types';
import { nativeCodecWork } from '../snapshot/runtime/nativeSha256';
import {
  SnapshotUpdateRequiredError,
  decodeEnvelopeAsync,
  headUpdateReason,
} from '../v2/codec';
import { configuredDriveProvider } from './production';

export interface BackupHistoryItem {
  snapshotId: string;
  /** Upload time on Google Drive. */
  createdAt: number;
}

/** Why an earlier backup could not be read. */
export class BackupHistoryError extends Error {
  constructor(
    readonly reason: 'not-configured' | 'backup-gone' | 'unreadable' | 'update-required',
  ) {
    super(`Backup history: ${reason}`);
    this.name = 'BackupHistoryError';
  }
}

async function configuredVault(): Promise<string> {
  const [vault] = await db.select().from(cloudVault).limit(1);
  if (!vault?.remote_root_id) throw new BackupHistoryError('not-configured');
  return vault.vault_id;
}

/**
 * Refuses a vault a newer Tackbok has written to (#251): sync is paused for
 * an update, or a head carries a newer major version or a required feature
 * this build lacks. Such a version may keep data, such as photos, where this
 * one cannot see it, so even an older backup would come back incomplete,
 * with its photos counted as gone.
 */
async function assertReadableByThisVersion(
  provider: SnapshotProvider,
  vaultId: string,
): Promise<void> {
  const [vault] = await db
    .select({ deviceId: cloudVault.device_id })
    .from(cloudVault)
    .where(eq(cloudVault.vault_id, vaultId))
    .limit(1);
  const [state] = vault
    ? await db
        .select({ pauseReason: cloudSyncState.pause_reason })
        .from(cloudSyncState)
        .where(
          and(
            eq(cloudSyncState.vault_id, vaultId),
            eq(cloudSyncState.device_id, vault.deviceId),
          ),
        )
        .limit(1)
    : [];
  if (state?.pauseReason === 'unsupported-format')
    throw new BackupHistoryError('update-required');
  const heads = await provider.listHeads(vaultId, true);
  if (heads.some(({ head }) => headUpdateReason(head) !== null))
    throw new BackupHistoryError('update-required');
}

/** One backup a day for the last 30 days, newest first. */
export async function listBackupHistory(): Promise<BackupHistoryItem[]> {
  const vaultId = await configuredVault();
  const provider = await configuredDriveProvider();
  // A fresh listing, which also reads Drive's clock.
  await provider.listHeads(vaultId, true);
  const snapshots = await provider.listSnapshots(vaultId);
  // shortcut: with no Date header (never seen in practice) the list counts
  // 30 days by this device's clock; it is only a list.
  const now = provider.providerTime() ?? Date.now();
  return backupHistory(snapshots, now).map(({ snapshotId, createdAt }) => ({
    snapshotId,
    createdAt,
  }));
}

export interface BackupHistoryArchive {
  file: File;
  fileName: string;
  /** Photos and voice notes neither this device nor Google Drive still has. */
  missingMedia: number;
}

/** A blob's bytes as a file: a verified local copy, or a download from Drive. */
async function mediaFile(
  provider: SnapshotProvider,
  vaultId: string,
  localFile: (blobHash: string) => Promise<File | null>,
  downloads: Directory,
  blobHash: string,
): Promise<File | null> {
  const local = await localFile(blobHash);
  if (local) return local;
  const sink = createMediaPartialFileSink(downloads, blobHash);
  // Bytes that fail their check are downloaded once more from zero; only
  // then is the file counted as missing.
  for (let attempt = 0; ; attempt++) {
    try {
      if (!(await provider.downloadMedia(vaultId, blobHash, sink))) return null;
      break;
    } catch (error) {
      if (!(error instanceof MediaIntegrityError)) throw error;
      if (attempt > 0) return null;
    }
  }
  const file = new File(downloads, `${blobHash}.bin`);
  return file.exists ? file : null;
}

/**
 * Writes one earlier backup as a Tackbok ZIP in the cache directory. The
 * caller deletes `file` when done. Media that is gone everywhere (collected
 * after nothing referred to it for 30 days, #185 P12) is left out and
 * counted, as an ordinary export leaves out missing files.
 */
export async function buildBackupHistoryArchive(
  snapshotId: string,
  /**
   * `restore`: the profile photo is named without its asset ID, so the
   * import gives it a new one. The backup's ID may belong to a photo
   * replaced since, whose immutable descriptor other devices still hold.
   * (Attachments are handled by the import itself, `replaceEntryAssets`.)
   */
  purpose: 'export' | 'restore' = 'export',
  /** Tests only: the provider and the local media lookup. */
  deps: {
    provider?: SnapshotProvider;
    localFile?: (blobHash: string) => Promise<File | null>;
  } = {},
): Promise<BackupHistoryArchive> {
  const vaultId = await configuredVault();
  const provider = deps.provider ?? (await configuredDriveProvider());
  // Before anything is downloaded: nothing is exported or restored partly.
  await assertReadableByThisVersion(provider, vaultId);
  const bytes = await provider.downloadSnapshot(vaultId, snapshotId);
  if (!bytes) throw new BackupHistoryError('backup-gone');
  let state;
  try {
    const decoded = await decodeEnvelopeAsync(bytes, snapshotId, nativeCodecWork);
    if (decoded.header.vaultId !== vaultId) throw new Error('other vault');
    state = decoded.state;
  } catch (error) {
    if (error instanceof SnapshotUpdateRequiredError)
      throw new BackupHistoryError('update-required');
    throw new BackupHistoryError('unreadable');
  }
  const [profileRow] = await db
    .select({ email: userProfile.email })
    .from(userProfile)
    .limit(1);
  const email = profileRow?.email ?? useSettingsStore.getState().profileEmail ?? null;
  const portable = snapshotToPortable(state, email);

  const fileName = `TackbokBackup_history_${snapshotId.slice(0, 12)}.zip`;
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  const downloads = new Directory(Paths.cache, 'backup-history-media');
  const zip = createExpoZipWriter(file);
  const store = new ProductionSnapshotMediaStore();
  const localFile =
    deps.localFile ?? ((blobHash: string) => store.verifiedLocalFile(blobHash));
  const written = new Set<string>();
  let missingMedia = 0;
  try {
    downloads.create({ intermediates: true, idempotent: true });
    for (const media of portable.media) {
      const source = await mediaFile(
        provider,
        vaultId,
        localFile,
        downloads,
        media.blobHash,
      );
      if (!source) continue;
      await zip.addFile(media.path, source);
      written.add(media.path);
      // A download is in the archive now: free its space before the next.
      if (source.uri.startsWith(downloads.uri) && source.exists) source.delete();
    }
    let photos = 0;
    let voiceMemos = 0;
    const entries = portable.entries.map((entry) => {
      const assets = entry.assets.filter((asset) => written.has(asset.path));
      missingMedia += entry.assets.length - assets.length;
      for (const asset of assets)
        if (asset.type === AssetType.AUDIO) voiceMemos++;
        else photos++;
      return assets.length < entry.assets.length
        ? { ...entry, assets, mediaIncomplete: true }
        : { ...entry, assets };
    });
    const profile = { ...portable.profile };
    if (purpose === 'restore') profile.photoAssetId = null;
    if (profile.imagePath && !written.has(profile.imagePath)) {
      missingMedia++;
      profile.imagePath = null;
    } else if (profile.imagePath) photos++;
    const manifest: TackbokBackupManifest = {
      format: 'tackbok-backup',
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        entries: entries.length,
        tags: portable.tags.length,
        customPrompts: portable.prompts.length,
        photos,
        voiceMemos,
      },
    };
    await zip.addText(BACKUP_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    await zip.addText(BACKUP_ENTRIES_PATH, JSON.stringify(entries, null, 2));
    await zip.addText(BACKUP_TAGS_PATH, JSON.stringify(portable.tags, null, 2));
    await zip.addText(BACKUP_PROMPTS_PATH, JSON.stringify(portable.prompts, null, 2));
    await zip.addText(BACKUP_PROFILE_PATH, JSON.stringify(profile, null, 2));
    await zip.close();
  } catch (error) {
    await zip.abort();
    if (file.exists) file.delete();
    throw error;
  } finally {
    if (downloads.exists) downloads.delete();
  }
  return { file, fileName, missingMedia };
}

/** Exports one earlier backup through the save or share sheet. */
export async function exportBackupFromHistory(
  snapshotId: string,
  takenAt: string,
): Promise<{ missingMedia: number }> {
  cleanupDeferredBackupZipFiles();
  const archive = await buildBackupHistoryArchive(snapshotId);
  // Named for the day the backup is from, and unique: an earlier share of
  // the same day may still be read from the cache (`saveOrShareZipFile`).
  const fileName = `TackbokBackup_${takenAt}_${generateTimestamp()}.zip`;
  let cleanup: 'delete-immediately' | 'defer-cleanup' = 'delete-immediately';
  let shared = archive.file;
  try {
    const named = new File(Paths.cache, fileName);
    if (named.exists) named.delete();
    await archive.file.move(named);
    shared = named;
    cleanup = await saveOrShareZipFile(shared, fileName);
  } finally {
    if (cleanup === 'delete-immediately' && shared.exists) shared.delete();
  }
  return { missingMedia: archive.missingMedia };
}

/** Deletes a restore archive once the import is done or cancelled. */
export function discardBackupHistoryArchive(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Could not delete a backup history archive', error);
  }
}
