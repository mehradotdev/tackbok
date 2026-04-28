import { desc } from 'drizzle-orm';
import { File, Paths } from 'expo-file-system';
import { db, customPrompts, entries, tags } from '~/db';
import { PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';
import { useSettingsStore } from '~/lib/settings';
import { createExpoZipWriter } from '~/lib/zip';
import {
  BACKUP_ENTRIES_PATH,
  BACKUP_MANIFEST_PATH,
  BACKUP_MEDIA_PREFIX,
  BACKUP_PROFILE_PATH,
  BACKUP_PROMPTS_PATH,
  BACKUP_TAGS_PATH,
  type PortableEntry,
  type PortableProfile,
  type TackbokBackupManifest,
} from '../backupImport/types';
import {
  normalizeOptionalText,
} from '../backupImport/archiveUtils';
import {
  createPortableEntries,
  createPortablePrompts,
  createPortableTags,
} from './portable';
import {
  cleanupDeferredBackupZipFiles,
  buildTagIdToNameMap,
  generateTimestamp,
  getRelativeAssetFile,
  saveOrShareZipFile,
} from './utils';

export async function exportToBackupZip(): Promise<void> {
  const [allEntries, allTags, allPrompts] = await Promise.all([
    db.select().from(entries).orderBy(desc(entries.created_at)),
    db.select().from(tags),
    db.select().from(customPrompts),
  ]);
  const settings = useSettingsStore.getState();
  const profileName = normalizeOptionalText(settings.profileName);
  const profileEmail = normalizeOptionalText(settings.profileEmail);
  const profileImageUri = normalizeOptionalText(settings.profileImageUri);

  if (
    allEntries.length === 0 &&
    allTags.length === 0 &&
    allPrompts.length === 0 &&
    !profileName &&
    !profileEmail &&
    !profileImageUri
  ) {
    throw new Error('No backup data to export');
  }

  const tagMap = await buildTagIdToNameMap();
  const { portableEntries } = createPortableEntries(allEntries, tagMap);
  const portableTags = createPortableTags(allTags);
  const portablePrompts = createPortablePrompts(allPrompts);
  const profile: PortableProfile = {
    name: profileName,
    email: profileEmail,
    imagePath: null,
  };
  const fileName = `TackbokBackup_${generateTimestamp()}.zip`;
  const tempZipFile = new File(Paths.cache, fileName);
  const zip = createExpoZipWriter(tempZipFile);
  const exportedEntries: PortableEntry[] = [];
  let exportedPhotoCount = 0;
  let exportedAudioCount = 0;
  // iOS share targets may still be reading the cached ZIP after `shareAsync` resolves.
  let cleanupStrategy: 'delete-immediately' | 'defer-cleanup' = 'delete-immediately';

  try {
    // Opportunistically remove older shared backups that were kept around to avoid the iOS share race.
    cleanupDeferredBackupZipFiles();

    for (const entry of portableEntries) {
      const exportedAssets: PortableEntry['assets'] = [];

      for (const asset of entry.assets) {
        const sourceFile = getRelativeAssetFile(
          asset.path
            .replace(`${BACKUP_MEDIA_PREFIX}/photos/`, `${PHOTOS_DIR_NAME}/`)
            .replace(`${BACKUP_MEDIA_PREFIX}/voice-memos/`, `${VOICE_MEMOS_DIR_NAME}/`),
        );
        if (!sourceFile || !sourceFile.exists) {
          continue;
        }

        try {
          await zip.addFile(asset.path, sourceFile);
          exportedAssets.push(asset);

          if (asset.path.startsWith(`${BACKUP_MEDIA_PREFIX}/photos/`)) {
            exportedPhotoCount++;
          } else if (asset.path.startsWith(`${BACKUP_MEDIA_PREFIX}/voice-memos/`)) {
            exportedAudioCount++;
          }
        } catch (error) {
          console.warn(`Skipping unreadable backup asset: ${asset.path}`, error);
        }
      }

      exportedEntries.push({
        ...entry,
        assets: exportedAssets,
      });
    }

    if (profileImageUri) {
      const profileFile = getRelativeAssetFile(profileImageUri);
      if (profileFile?.exists) {
        const basename = profileImageUri.split('/').pop();
        if (!basename) {
          console.warn(`Skipping invalid profile image URI: ${profileImageUri}`);
        } else {
          const profileArchivePath = `${BACKUP_MEDIA_PREFIX}/profile/${basename}`;
          try {
            await zip.addFile(profileArchivePath, profileFile);
            profile.imagePath = profileArchivePath;
            exportedPhotoCount++;
          } catch (error) {
            console.warn(
              `Skipping unreadable backup profile image: ${profileImageUri}`,
              error,
            );
          }
        }
      }
    }

    const manifest: TackbokBackupManifest = {
      format: 'tackbok-backup',
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        entries: exportedEntries.length,
        tags: portableTags.length,
        customPrompts: portablePrompts.length,
        photos: exportedPhotoCount,
        voiceMemos: exportedAudioCount,
      },
    };

    await zip.addText(BACKUP_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    await zip.addText(BACKUP_ENTRIES_PATH, JSON.stringify(exportedEntries, null, 2));
    await zip.addText(BACKUP_TAGS_PATH, JSON.stringify(portableTags, null, 2));
    await zip.addText(BACKUP_PROMPTS_PATH, JSON.stringify(portablePrompts, null, 2));
    await zip.addText(BACKUP_PROFILE_PATH, JSON.stringify(profile, null, 2));

    await zip.close();
    cleanupStrategy = await saveOrShareZipFile(tempZipFile, fileName);
  } catch (error) {
    await zip.abort();
    throw error;
  } finally {
    // Only delete immediately when the exported file has already been copied somewhere permanent.
    if (cleanupStrategy === 'delete-immediately' && tempZipFile.exists) {
      tempZipFile.delete();
    }
  }
}
