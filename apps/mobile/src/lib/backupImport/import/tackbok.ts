import { eq } from 'drizzle-orm';
import { entries, userProfile } from '~/db';
import { randomUUID } from 'expo-crypto';
import {
  BACKUP_ENTRIES_PATH,
  BACKUP_MANIFEST_PATH,
  BACKUP_PROFILE_PATH,
  BACKUP_PROMPTS_PATH,
  BACKUP_TAGS_PATH,
  type BackupImportSummary,
  type ImportMode,
  type PortableEntry,
  type PortableProfile,
  type PortablePrompt,
  type PortableTag,
  type TackbokBackupManifest,
} from '../types';
import { type ImportProgressCallback, reportImportProgress } from '../progress';
import {
  createBackupImportSummary,
  createSummaryCounterMetrics,
  recordImportWarning,
} from '../summary';
import {
  ensurePortablePromptTitles,
  importPortableEntries,
  upsertPortableTags,
} from '../portable';
import {
  cleanupImportedFiles,
  isZipFile,
  loadZipFromUri,
  readSafeZipBytes,
  readSafeZipJson,
  writeImportedPhoto,
} from '../archiveUtils';
import { getImportTotals } from './helpers';
import {
  PROFILE_ROW_ID,
  type ProfileUpdate,
  runInCloudSyncTransaction,
  updateProfileInTransaction,
} from '~/lib/cloudSync/storage/repositories';
import { hydrateProfileCache } from '~/lib/settings';

export async function importFromTackbokBackup(
  uri: string,
  mode: ImportMode,
  onProgress?: ImportProgressCallback,
): Promise<BackupImportSummary> {
  if (!isZipFile(uri)) {
    throw new Error('Tackbok restore requires a ZIP backup');
  }

  reportImportProgress(onProgress, 'tackbok', 'reading', 0.2);

  const zip = await loadZipFromUri(uri);
  try {
    reportImportProgress(onProgress, 'tackbok', 'validating', 0.15);
    const manifest = await readSafeZipJson<TackbokBackupManifest>(
      zip,
      BACKUP_MANIFEST_PATH,
    );

    if (manifest.format !== 'tackbok-backup' || manifest.backupVersion !== 1) {
      throw new Error('This Tackbok backup version is not supported');
    }

    const [portableEntries, portableTags, portablePrompts, portableProfile] =
      await Promise.all([
        readSafeZipJson<PortableEntry[]>(zip, BACKUP_ENTRIES_PATH),
        readSafeZipJson<PortableTag[]>(zip, BACKUP_TAGS_PATH),
        readSafeZipJson<PortablePrompt[]>(zip, BACKUP_PROMPTS_PATH),
        readSafeZipJson<PortableProfile>(zip, BACKUP_PROFILE_PATH),
      ]);
    const profileName = portableProfile.name?.trim() ? portableProfile.name.trim() : null;
    const summary = createBackupImportSummary();
    const createdFiles: string[] = [];
    let importedProfileImageUri: string | null = null;
    let profileUpdate: ProfileUpdate = {};
    const batchId = randomUUID();
    const totals = getImportTotals(portableEntries, portableTags, portablePrompts);

    reportImportProgress(
      onProgress,
      'tackbok',
      'profile',
      portableProfile.imagePath ? 0.2 : 1,
      totals,
    );

    try {
      if (portableProfile.imagePath) {
        try {
          const bytes = await readSafeZipBytes(zip, portableProfile.imagePath);
          const profileImage = await writeImportedPhoto(bytes, portableProfile.imagePath);
          importedProfileImageUri = profileImage.uri;
          createdFiles.push(profileImage.uri);
        } catch (error) {
          const message = `Could not restore profile image "${portableProfile.imagePath}".`;
          recordImportWarning(summary, {
            kind: 'profile-asset',
            message,
            assetPath: portableProfile.imagePath,
          });
          console.warn(`[backupImport:tackbok] ${message}`, error);
        }
      }

      reportImportProgress(onProgress, 'tackbok', 'taxonomy', 0.1, {
        ...totals,
        ...createSummaryCounterMetrics(summary),
      });

      await runInCloudSyncTransaction(async (tx) => {
        const tagMap = await upsertPortableTags(tx, portableTags, summary, batchId);
        await ensurePortablePromptTitles(tx, portablePrompts, summary, batchId);
        reportImportProgress(onProgress, 'tackbok', 'taxonomy', 1, {
          ...totals,
          ...createSummaryCounterMetrics(summary),
        });

        // TODO: If imports ever get slow on large journals, profile this query first.
        // A chunked lookup by incoming portable note IDs may scale better than
        // materializing every existing note_id up front.
        const existingEntries = await tx
          .select({ note_id: entries.note_id })
          .from(entries);
        const existingNoteIds = new Set(existingEntries.map((entry) => entry.note_id));

        await importPortableEntries(
          tx,
          portableEntries,
          existingNoteIds,
          tagMap,
          summary,
          mode,
          zip,
          createdFiles,
          'tackbok',
          onProgress,
          batchId,
        );
        // Skipping existing data also keeps the current profile; only empty
        // fields are filled from the backup.
        const [currentProfile] =
          mode === 'skip'
            ? await tx
                .select()
                .from(userProfile)
                .where(eq(userProfile.profile_id, PROFILE_ROW_ID))
                .limit(1)
            : [];
        profileUpdate = {
          ...(currentProfile?.display_name ? {} : { displayName: profileName }),
          ...(currentProfile?.email ? {} : { email: portableProfile.email ?? null }),
          ...(currentProfile?.photo_asset_id
            ? {}
            : {
                photoUri: importedProfileImageUri,
                photoAssetId: portableProfile.photoAssetId ?? null,
              }),
        };
        await updateProfileInTransaction(tx, profileUpdate, { batchId });
      });
      if (importedProfileImageUri && profileUpdate.photoUri === undefined) {
        cleanupImportedFiles([importedProfileImageUri]);
        importedProfileImageUri = null;
      }
    } catch (error) {
      cleanupImportedFiles(createdFiles);
      throw error;
    }

    reportImportProgress(onProgress, 'tackbok', 'finishing', 0.7, {
      ...totals,
      processedEntries: portableEntries.length,
      ...createSummaryCounterMetrics(summary),
    });

    try {
      hydrateProfileCache({
        ...(profileUpdate.displayName !== undefined && {
          profileName: profileUpdate.displayName,
        }),
        ...(profileUpdate.email !== undefined && { profileEmail: profileUpdate.email }),
        ...(profileUpdate.photoUri !== undefined && {
          profileImageUri: profileUpdate.photoUri,
        }),
      });
    } catch (error) {
      // The committed profile row still references the imported photo, so it
      // must stay. The cache is rebuilt from SQLite on the next launch.
      recordImportWarning(summary, {
        kind: 'profile-settings',
        message: 'Imported entries, but could not apply imported profile settings.',
      });
      console.warn(
        '[backupImport:tackbok] Imported entries, but could not apply imported profile settings.',
        error,
      );
    }

    reportImportProgress(onProgress, 'tackbok', 'finishing', 1, {
      ...totals,
      processedEntries: portableEntries.length,
      ...createSummaryCounterMetrics(summary),
    });

    return summary;
  } finally {
    await zip.close();
  }
}
