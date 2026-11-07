import { Asset as ExpoBundledAsset } from 'expo-asset';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';
import { AssetType, type Asset } from '~/types';
import { type TranslationFunction } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { deleteEntry } from '~/lib/entryDeletion';
import { sanitizeTagName } from '~/lib/utils';
import { tags } from '~/db';
import { deleteTag, getAllEntries } from '~/db/queries';
import { isCloudRestoreInProgress } from '~/lib/cloudSync/ui/restoreInProgress';
import {
  createTagInTransaction,
  runInCloudSyncTransaction,
  upsertEntryInTransaction,
  type CloudSyncTransaction,
} from '~/lib/cloudSync/storage/repositories';

/**
 * Seeds the onboarding sample entries: 4 entries spread over the last few days
 * (never today — the user's first real entry should own it), each demonstrating
 * one capability. Their note_ids are persisted in `sampleEntryIds` so the
 * timeline banner can remove them again with one tap.
 *
 * Bundled media is copied into the same persistent directories real photos and
 * voice memos use, so viewing, export/backup and deletion need no special-casing.
 */

// Original, repo-generated assets — see assets/samples/README.md.
const SAMPLE_PHOTO_MODULES: number[] = [
  require('../../assets/samples/sample-photo-1.jpg'),
  require('../../assets/samples/sample-photo-2.jpg'),
];
const SAMPLE_AUDIO_MODULE: number = require('../../assets/samples/sample-voice-memo.m4a');

function ensureDir(dirName: string): Directory {
  const dir = new Directory(Paths.document, dirName);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

async function copyBundledAsset(
  moduleId: number,
  dirName: string,
  extension: string,
): Promise<{ relativeUri: string; width?: number; height?: number }> {
  const bundled = ExpoBundledAsset.fromModule(moduleId);
  await bundled.downloadAsync();
  const sourceUri = bundled.localUri ?? bundled.uri;
  const dir = ensureDir(dirName);
  const filename = `${randomUUID()}.${extension}`;
  await new File(sourceUri).copy(new File(dir, filename));
  return {
    relativeUri: `${dirName}/${filename}`,
    width: bundled.width ?? undefined,
    height: bundled.height ?? undefined,
  };
}

/** Local wall-clock timestamp `daysAgo` days back at hour:minute. */
function timestampAt(daysAgo: number, hour: number, minute: number): number {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

/**
 * Creates a tag if needed and returns its id (tags have a unique title, so a
 * replayed onboarding reuses the existing tag instead of failing).
 */
async function ensureTagInTransaction(
  tx: CloudSyncTransaction,
  title: string,
): Promise<string> {
  const normalized = sanitizeTagName(title).toLowerCase();
  const existing = (await tx.select().from(tags)).find(
    (tag) => tag.title.trim().toLowerCase() === normalized,
  );
  return existing?.tag_id ?? (await createTagInTransaction(tx, title));
}

function deleteCopiedFiles(relativeUris: string[]): void {
  for (const relativeUri of relativeUris) {
    try {
      const file = new File(Paths.document, relativeUri);
      if (file.exists) file.delete();
    } catch {
      // Best-effort cleanup; an unreferenced copy is harmless.
    }
  }
}

/**
 * Returns the seeded note_ids, or none when a restore from a cloud backup is
 * in progress: sample entries would otherwise sync into that backup.
 */
export async function seedSampleEntries(t: TranslationFunction): Promise<string[]> {
  const focusAreas = useSettingsStore.getState().journalFocusAreas;
  const promptCategory = focusAreas[0] ?? 'self';

  // Copy bundled media before the transaction; loading it can take a while.
  const [photo1, photo2, audio] = await Promise.all([
    copyBundledAsset(SAMPLE_PHOTO_MODULES[0], PHOTOS_DIR_NAME, 'jpg'),
    copyBundledAsset(SAMPLE_PHOTO_MODULES[1], PHOTOS_DIR_NAME, 'jpg'),
    copyBundledAsset(SAMPLE_AUDIO_MODULE, VOICE_MEMOS_DIR_NAME, 'm4a'),
  ]);
  const copiedUris = [photo1.relativeUri, photo2.relativeUri, audio.relativeUri];

  const photoAssets: Asset[] = [
    {
      type: AssetType.IMAGE,
      uri: photo1.relativeUri,
      width: photo1.width,
      height: photo1.height,
    },
    {
      type: AssetType.IMAGE,
      uri: photo2.relativeUri,
      width: photo2.width,
      height: photo2.height,
    },
  ];
  const audioAssets: Asset[] = [{ type: AssetType.AUDIO, uri: audio.relativeUri }];

  let insertedIds: string[];
  try {
    insertedIds = await runInCloudSyncTransaction(async (tx) => {
      // Checked in the same exclusive transaction as the writes: a restore
      // committed while the media was loading must not receive the samples.
      if (await isCloudRestoreInProgress(tx)) return [];
      const tagIds = [
        await ensureTagInTransaction(tx, t('sample_tag_family')),
        await ensureTagInTransaction(tx, t('sample_tag_littleThings')),
      ];
      const entries = [
        {
          note_id: randomUUID(),
          text_title: t('sample_entry_welcome_title'),
          text_content: t('sample_entry_welcome_body'),
          mood: 'HAPPY' as const,
          created_at: timestampAt(1, 18, 30),
        },
        {
          note_id: randomUUID(),
          text_title: t('sample_entry_voice_title'),
          text_content: t('sample_entry_voice_body'),
          assets: audioAssets,
          created_at: timestampAt(1, 10, 5),
        },
        {
          note_id: randomUUID(),
          text_title: t('sample_entry_photos_title'),
          text_content: t('sample_entry_photos_body'),
          assets: photoAssets,
          created_at: timestampAt(2, 15, 20),
        },
        {
          note_id: randomUUID(),
          // The tags entry answers a built-in prompt from the user's chosen focus areas.
          text_title: t(`prompt_${promptCategory}_1`),
          text_content: t('sample_entry_tags_body'),
          mood: 'AMAZING' as const,
          tags: tagIds.join(','),
          created_at: timestampAt(3, 9, 40),
        },
      ];
      for (const entry of entries) {
        await upsertEntryInTransaction(tx, { ...entry, updated_at: entry.created_at });
      }
      return entries.map((entry) => entry.note_id);
    });
  } catch (error) {
    // The transaction rolled back, so no entry references the copies.
    deleteCopiedFiles(copiedUris);
    throw error;
  }
  if (insertedIds.length === 0) {
    deleteCopiedFiles(copiedUris);
    return [];
  }

  const { setSampleEntryIds, setSampleEntriesBannerDismissed } =
    useSettingsStore.getState();
  // A fresh seed (e.g. onboarding replay) gets a fresh banner, even if the
  // user dismissed it for a previous batch.
  setSampleEntriesBannerDismissed(false);
  setSampleEntryIds(insertedIds);
  return insertedIds;
}

/**
 * One-tap removal (timeline banner): deletes the remaining sample entries,
 * their copied media files, and the sample tags — the latter only if no other
 * entry still uses them — then clears `sampleEntryIds`.
 */
export async function removeSampleEntries(): Promise<void> {
  const { sampleEntryIds, setSampleEntryIds } = useSettingsStore.getState();
  if (sampleEntryIds.length === 0) return;

  const sampleIdSet = new Set(sampleEntryIds);
  const sampleEntries = (await getAllEntries()).filter((entry) =>
    sampleIdSet.has(entry.note_id),
  );

  const candidateTagIds = new Set<string>();
  for (const entry of sampleEntries) {
    entry.tags
      .split(',')
      .filter(Boolean)
      .forEach((tagId) => candidateTagIds.add(tagId));

    await deleteEntry(entry.note_id);
  }

  if (candidateTagIds.size > 0) {
    const remainingEntries = await getAllEntries();
    for (const tagId of candidateTagIds) {
      const stillUsed = remainingEntries.some((entry) =>
        entry.tags.split(',').includes(tagId),
      );
      if (!stillUsed) {
        try {
          await deleteTag(tagId);
        } catch {
          // Best-effort cleanup; a leftover tag is harmless.
        }
      }
    }
  }

  setSampleEntryIds([]);
}
