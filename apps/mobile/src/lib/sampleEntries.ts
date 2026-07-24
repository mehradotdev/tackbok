import { Asset as ExpoBundledAsset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { PHOTOS_DIR_NAME, VOICE_MEMOS_DIR_NAME } from '~/constants';
import { AssetType, type Asset } from '~/types';
import { type TranslationFunction } from '~/lib/i18n';
import { generateUUID } from '~/lib/utils';
import { useSettingsStore } from '~/lib/settings';
import { deleteEntry } from '~/lib/entryDeletion';
import {
  createTag,
  deleteTag,
  getAllEntries,
  getAllTags,
  upsertEntry,
} from '~/db/queries';

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
  const filename = `${generateUUID()}.${extension}`;
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
async function ensureTag(title: string): Promise<string | null> {
  try {
    await createTag(title);
  } catch {
    // Most likely a unique-title conflict with an existing tag — fine.
  }
  const allTags = await getAllTags();
  const normalized = title.trim().toLowerCase();
  return (
    allTags.find((tag) => tag.title.trim().toLowerCase() === normalized)?.tag_id ??
    null
  );
}

export async function seedSampleEntries(t: TranslationFunction): Promise<string[]> {
  const focusAreas = useSettingsStore.getState().journalFocusAreas;
  const promptCategory = focusAreas[0] ?? 'self';

  const [photo1, photo2, audio] = await Promise.all([
    copyBundledAsset(SAMPLE_PHOTO_MODULES[0], PHOTOS_DIR_NAME, 'jpg'),
    copyBundledAsset(SAMPLE_PHOTO_MODULES[1], PHOTOS_DIR_NAME, 'jpg'),
    copyBundledAsset(SAMPLE_AUDIO_MODULE, VOICE_MEMOS_DIR_NAME, 'm4a'),
  ]);

  const tagIds = (
    await Promise.all([
      ensureTag(t('sample_tag_family')),
      ensureTag(t('sample_tag_littleThings')),
    ])
  ).filter((id): id is string => id !== null);

  const photoAssets: Asset[] = [
    { type: AssetType.IMAGE, uri: photo1.relativeUri, width: photo1.width, height: photo1.height },
    { type: AssetType.IMAGE, uri: photo2.relativeUri, width: photo2.width, height: photo2.height },
  ];
  const audioAssets: Asset[] = [{ type: AssetType.AUDIO, uri: audio.relativeUri }];

  const entries = [
    {
      note_id: generateUUID(),
      text_title: t('sample_entry_welcome_title'),
      text_content: t('sample_entry_welcome_body'),
      mood: 'HAPPY' as const,
      created_at: timestampAt(1, 18, 30),
    },
    {
      note_id: generateUUID(),
      text_title: t('sample_entry_voice_title'),
      text_content: t('sample_entry_voice_body'),
      assets: audioAssets,
      created_at: timestampAt(1, 10, 5),
    },
    {
      note_id: generateUUID(),
      text_title: t('sample_entry_photos_title'),
      text_content: t('sample_entry_photos_body'),
      assets: photoAssets,
      created_at: timestampAt(2, 15, 20),
    },
    {
      note_id: generateUUID(),
      // The tags entry answers a built-in prompt from the user's chosen focus areas.
      text_title: t(`prompt_${promptCategory}_1`),
      text_content: t('sample_entry_tags_body'),
      mood: 'AMAZING' as const,
      tags: tagIds.join(','),
      created_at: timestampAt(3, 9, 40),
    },
  ];

  // Track ids in the settings store as they land (not only on full success):
  // if an insert midway fails, the already-seeded entries stay covered by the
  // removal banner instead of becoming permanent untracked content.
  const insertedIds: string[] = [];
  const { setSampleEntryIds, setSampleEntriesBannerDismissed } =
    useSettingsStore.getState();
  // A fresh seed (e.g. onboarding replay) gets a fresh banner, even if the
  // user dismissed it for a previous batch.
  setSampleEntriesBannerDismissed(false);
  try {
    for (const entry of entries) {
      await upsertEntry({ ...entry, updated_at: entry.created_at });
      insertedIds.push(entry.note_id);
    }
  } finally {
    setSampleEntryIds(insertedIds);
  }

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
