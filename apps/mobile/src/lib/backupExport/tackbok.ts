import { desc } from 'drizzle-orm';
import { db, customPrompts, entries, tags } from '~/db';
import { PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';
import { useSettingsStore } from '~/lib/settings';
import { createZipArchiveBuilder } from '~/lib/zip';
import {
  BACKUP_ENTRIES_PATH,
  BACKUP_MANIFEST_PATH,
  BACKUP_MEDIA_PREFIX,
  BACKUP_PROFILE_PATH,
  BACKUP_PROMPTS_PATH,
  BACKUP_TAGS_PATH,
  type PortableProfile,
  type TackbokBackupManifest,
} from '../backupImport/types';
import {
  buildTagIdToNameMap,
  generateTimestamp,
  getRelativeAssetFile,
  normalizeOptionalText,
  saveZipFile,
} from '../backupImport/archiveUtils';
import {
  createPortableEntries,
  createPortablePrompts,
  createPortableTags,
} from './portable';

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
  const { portableEntries, photoCount, audioCount } = createPortableEntries(
    allEntries,
    tagMap,
  );
  const portableTags = createPortableTags(allTags);
  const portablePrompts = createPortablePrompts(allPrompts);
  const profile: PortableProfile = {
    name: profileName,
    email: profileEmail,
    imagePath: null,
  };
  const zip = createZipArchiveBuilder();

  for (const entry of portableEntries) {
    for (const asset of entry.assets) {
      const sourceFile = getRelativeAssetFile(
        asset.path
          .replace(`${BACKUP_MEDIA_PREFIX}/photos/`, `${PHOTOS_DIR_NAME}/`)
          .replace(`${BACKUP_MEDIA_PREFIX}/voice-memos/`, `${VOICE_MEMOS_DIR_NAME}/`),
      );
      if (!sourceFile || !sourceFile.exists) {
        continue;
      }

      zip.addBytes(asset.path, await sourceFile.bytes());
    }
  }

  if (profileImageUri) {
    const profileFile = getRelativeAssetFile(profileImageUri);
    if (profileFile?.exists) {
      const profileArchivePath = `${BACKUP_MEDIA_PREFIX}/profile/${profileImageUri.split('/').pop()}`;
      zip.addBytes(profileArchivePath, await profileFile.bytes());
      profile.imagePath = profileArchivePath;
    }
  }

  const manifest: TackbokBackupManifest = {
    format: 'tackbok-backup',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      entries: portableEntries.length,
      tags: portableTags.length,
      customPrompts: portablePrompts.length,
      photos: photoCount + (profile.imagePath ? 1 : 0),
      voiceMemos: audioCount,
    },
  };

  zip.addText(BACKUP_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  zip.addText(BACKUP_ENTRIES_PATH, JSON.stringify(portableEntries, null, 2));
  zip.addText(BACKUP_TAGS_PATH, JSON.stringify(portableTags, null, 2));
  zip.addText(BACKUP_PROMPTS_PATH, JSON.stringify(portablePrompts, null, 2));
  zip.addText(BACKUP_PROFILE_PATH, JSON.stringify(profile, null, 2));

  await saveZipFile(zip.toBytes(), `TackbokBackup_${generateTimestamp()}.zip`);
}
