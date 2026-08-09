import { db, entries } from '~/db';
import { useSettingsStore } from '~/lib/settings';
import { type BackupImportSummary, type ImportMode } from '../types';
import {
  type ImportProgressCallback,
  reportImportProgress,
} from '../progress';
import {
  createBackupImportSummary,
  createSummaryCounterMetrics,
  recordImportWarning,
} from '../summary';
import {
  buildGratitudeAppPortablePayload,
  ensurePortablePromptTitles,
  importPortableEntries,
  upsertPortableTags,
} from '../portable';
import {
  cleanupImportedFiles,
  isZipFile,
  loadZipFromUri,
  readSafeZipBytes,
  writeImportedPhoto,
} from '../archiveUtils';
import { getImportTotals } from './helpers';

export async function importFromGratitudeAppBackup(
  uri: string,
  mode: ImportMode,
  onProgress?: ImportProgressCallback,
): Promise<BackupImportSummary> {
  if (!isZipFile(uri)) {
    throw new Error('Gratitude import requires a ZIP backup');
  }

  reportImportProgress(onProgress, 'gratitudeApp', 'reading', 0.2);

  const zip = await loadZipFromUri(uri);
  try {
    reportImportProgress(onProgress, 'gratitudeApp', 'validating', 0.2);

    const gratitudeAppPayload = await buildGratitudeAppPortablePayload(zip);
    const { portableEntries, portablePrompts, portableTags, profile } = gratitudeAppPayload;
    const totals = getImportTotals(portableEntries, portableTags, portablePrompts);
    const summary = createBackupImportSummary();
    const createdFiles: string[] = [];
    let importedProfileImageUri: string | null = null;

    reportImportProgress(onProgress, 'gratitudeApp', 'profile', 0.1, totals);

    try {
      if (profile.imagePath) {
        try {
          const bytes = await readSafeZipBytes(zip, profile.imagePath);
          const profileImage = await writeImportedPhoto(bytes, profile.imagePath);
          importedProfileImageUri = profileImage.uri;
          createdFiles.push(profileImage.uri);
        } catch (error) {
          const message = `Could not restore profile image "${profile.imagePath}".`;
          recordImportWarning(summary, {
            kind: 'profile-asset',
            message,
            assetPath: profile.imagePath,
          });
          console.warn(`[backupImport:gratitudeApp] ${message}`, error);
        }
      }

      reportImportProgress(onProgress, 'gratitudeApp', 'taxonomy', 0.1, {
        ...totals,
        ...createSummaryCounterMetrics(summary),
      });

      await db.transaction(async (tx) => {
        const tagMap = await upsertPortableTags(tx, portableTags, summary);
        await ensurePortablePromptTitles(tx, portablePrompts, summary);
        reportImportProgress(onProgress, 'gratitudeApp', 'taxonomy', 1, {
          ...totals,
          ...createSummaryCounterMetrics(summary),
        });

        // TODO: If imports ever get slow on large journals, profile this query first.
        // A chunked lookup by incoming portable note IDs may scale better than
        // materializing every existing note_id up front.
        const existingEntries = await tx.select({ note_id: entries.note_id }).from(entries);
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
          'gratitudeApp',
          onProgress,
        );
      });
    } catch (error) {
      cleanupImportedFiles(createdFiles);
      throw error;
    }

    reportImportProgress(onProgress, 'gratitudeApp', 'finishing', 0.7, {
      ...totals,
      processedEntries: portableEntries.length,
      ...createSummaryCounterMetrics(summary),
    });

    try {
      const settingsState = useSettingsStore.getState();
      if (profile.name != null) {
        await settingsState.setProfileName(profile.name);
      }
      if (profile.hasEmail) {
        await settingsState.setProfileEmail(profile.email);
      }
      if (importedProfileImageUri) {
        await settingsState.setProfileImageUri(importedProfileImageUri);
      }
    } catch (error) {
      if (importedProfileImageUri) {
        cleanupImportedFiles([importedProfileImageUri]);
      }
      recordImportWarning(summary, {
        kind: 'profile-settings',
        message: 'Imported entries, but could not apply imported profile settings.',
      });
      console.warn(
        '[backupImport:gratitudeApp] Imported entries, but could not apply imported profile settings.',
        error,
      );
    }

    reportImportProgress(onProgress, 'gratitudeApp', 'finishing', 1, {
      ...totals,
      processedEntries: portableEntries.length,
      ...createSummaryCounterMetrics(summary),
    });

    return summary;
  } finally {
    await zip.close();
  }
}
