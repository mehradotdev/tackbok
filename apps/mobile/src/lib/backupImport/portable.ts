/**
 * Converts source-specific backup records into the shared portable model and
 * provides the source-agnostic runtime that writes that model into Tackbok.
 */

import { db, customPrompts, entries, tags } from '~/db';
import { AssetType, type Asset } from '~/types';
import { findZipEntryPathByBasename, hasZipEntry, type ZipArchive } from '~/lib/zip';
import { generateUUID, sanitizePromptTitle, sanitizeTagName } from '~/lib/utils';
import type { ImportProgressCallback } from './progress';
import { reportImportProgress } from './progress';
import {
  type BackupImportSource,
  type BackupImportSummary,
  type GratitudeAppAssetRecord,
  type GratitudeAppConfigRecord,
  type GratitudeAppEntryRecord,
  type GratitudeAppPromptRecord,
  type GratitudeAppRecordingRecord,
  type GratitudeAppTagRecord,
  GRATITUDE_APP_ASSETS_PATH,
  GRATITUDE_APP_CONFIG_PATH,
  GRATITUDE_APP_ENTRIES_PATH,
  GRATITUDE_APP_IMAGES_DIR,
  GRATITUDE_APP_PROMPTS_PATH,
  GRATITUDE_APP_RECORDINGS_DIR,
  GRATITUDE_APP_RECORDINGS_PATH,
  GRATITUDE_APP_TAGS_PATH,
  type ImportMode,
  type PortableEntry,
  type PortablePrompt,
  type PortableTag,
} from './types';
import {
  assertSafeArchivePath,
  buildSubstantiveCheck,
  deriveGratitudeTitle,
  normalizeOptionalText,
  readSafeZipBytes,
  readSafeZipJson,
  VALID_MOODS,
  writeImportedAudio,
  writeImportedPhoto,
} from './archiveUtils';

type BackupArchiveTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface GratitudeAppPortablePayload {
  portableEntries: PortableEntry[];
  portablePrompts: PortablePrompt[];
  portableTags: PortableTag[];
  profile: {
    name: string | null | undefined;
    email: string | null;
    hasEmail: boolean;
    imagePath: string | null;
  };
}

// ============================================================================
// Gratitude App Adapter
// ============================================================================

/**
 * Groups GratitudeApp asset records by entry ID so attachments can be resolved per entry.
 */
function groupGratitudeAppAssets(
  gratitudeAssets: GratitudeAppAssetRecord[],
): Map<string, GratitudeAppAssetRecord[]> {
  const groupedAssets = new Map<string, GratitudeAppAssetRecord[]>();

  for (const asset of gratitudeAssets) {
    if (!asset.entityId || !asset.assetPath) continue;

    const list = groupedAssets.get(asset.entityId) ?? [];
    list.push(asset);
    groupedAssets.set(asset.entityId, list);
  }

  return groupedAssets;
}

/**
 * Builds a de-duplicated prompt map from explicit prompt records and entry-level prompts.
 */
function buildGratitudeAppPromptMap(
  gratitudePrompts: GratitudeAppPromptRecord[],
  gratitudeEntries: GratitudeAppEntryRecord[],
): Map<string, PortablePrompt> {
  const promptTitles = new Map<string, PortablePrompt>();

  for (const prompt of gratitudePrompts) {
    const cleanTitle = sanitizePromptTitle(prompt.text);
    if (!cleanTitle) continue;

    const key = cleanTitle.toLowerCase();
    if (!promptTitles.has(key)) {
      promptTitles.set(key, {
        title: cleanTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  for (const gratitudeEntry of gratitudeEntries) {
    const cleanPrompt = sanitizePromptTitle(gratitudeEntry.prompt ?? '');
    if (!cleanPrompt) continue;

    const key = cleanPrompt.toLowerCase();
    if (!promptTitles.has(key)) {
      promptTitles.set(key, {
        title: cleanPrompt,
        createdAt: gratitudeEntry.createdOn,
        updatedAt: gratitudeEntry.updatedOn,
      });
    }
  }

  return promptTitles;
}

/**
 * Normalizes GratitudeApp tag records into the shared portable tag representation.
 */
function createPortableTagsFromGratitudeApp(
  gratitudeTags: GratitudeAppTagRecord[],
): PortableTag[] {
  return gratitudeTags.map((tag) => {
    const createdAt =
      typeof tag.createdAt === 'number' && Number.isFinite(tag.createdAt)
        ? tag.createdAt
        : Date.now();

    return {
      title: tag.title,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

/**
 * Resolves all image and audio assets for a GratitudeApp entry from the imported ZIP archive.
 */
function resolveGratitudeAppEntryAssets(
  zip: ZipArchive,
  gratitudeEntry: GratitudeAppEntryRecord,
  groupedAssets: Map<string, GratitudeAppAssetRecord[]>,
  gratitudeRecordings: GratitudeAppRecordingRecord[],
): PortableEntry['assets'] {
  const assetsForEntry = (groupedAssets.get(gratitudeEntry.noteId) ?? [])
    .filter((asset) => asset.assetPath)
    .sort(
      (left, right) =>
        (left.index ?? 0) - (right.index ?? 0) ||
        (left.createdAt ?? 0) - (right.createdAt ?? 0),
    );

  const entryAssets: PortableEntry['assets'] = [];

  for (const asset of assetsForEntry) {
    if (!asset.assetPath) continue;

    const dirName =
      asset.assetType === 'audio'
        ? GRATITUDE_APP_RECORDINGS_DIR
        : GRATITUDE_APP_IMAGES_DIR;
    const candidatePath = `${dirName}/${asset.assetPath}`;
    if (!hasZipEntry(zip, candidatePath)) continue;

    entryAssets.push({
      type: asset.assetType === 'audio' ? AssetType.AUDIO : AssetType.IMAGE,
      path: candidatePath,
    });
  }

  if (entryAssets.length === 0 && gratitudeEntry.imagePath) {
    const fallbackImages = gratitudeEntry.imagePath
      .split(',')
      .map((imageName) => imageName.trim())
      .filter(Boolean);

    for (const imageName of fallbackImages) {
      const candidatePath = `${GRATITUDE_APP_IMAGES_DIR}/${imageName}`;
      if (!hasZipEntry(zip, candidatePath)) continue;

      entryAssets.push({
        type: AssetType.IMAGE,
        path: candidatePath,
      });
    }
  }

  if (!entryAssets.some((asset) => asset.type === AssetType.AUDIO)) {
    for (const recording of gratitudeRecordings) {
      if (recording.noteId !== gratitudeEntry.noteId) continue;

      const candidatePath = `${GRATITUDE_APP_RECORDINGS_DIR}/${recording.recordingPath}`;
      if (!hasZipEntry(zip, candidatePath)) continue;

      entryAssets.push({
        type: AssetType.AUDIO,
        path: candidatePath,
      });
    }
  }

  return entryAssets;
}

/**
 * Reads GratitudeApp backup records and converts them into the shared portable payload.
 */
export function buildGratitudeAppPortablePayload(
  zip: ZipArchive,
): GratitudeAppPortablePayload {
  const gratitudeEntries = readSafeZipJson<GratitudeAppEntryRecord[]>(
    zip,
    GRATITUDE_APP_ENTRIES_PATH,
  );
  const gratitudeAssets = readSafeZipJson<GratitudeAppAssetRecord[]>(
    zip,
    GRATITUDE_APP_ASSETS_PATH,
  );
  const gratitudePrompts = readSafeZipJson<GratitudeAppPromptRecord[]>(
    zip,
    GRATITUDE_APP_PROMPTS_PATH,
  );
  const gratitudeTags = readSafeZipJson<GratitudeAppTagRecord[]>(
    zip,
    GRATITUDE_APP_TAGS_PATH,
  );
  const gratitudeRecordings = readSafeZipJson<GratitudeAppRecordingRecord[]>(
    zip,
    GRATITUDE_APP_RECORDINGS_PATH,
  );
  const gratitudeConfigList = readSafeZipJson<GratitudeAppConfigRecord[]>(
    zip,
    GRATITUDE_APP_CONFIG_PATH,
  );
  const gratitudeConfig = gratitudeConfigList[0] ?? {};
  const groupedAssets = groupGratitudeAppAssets(gratitudeAssets);
  const promptTitles = buildGratitudeAppPromptMap(gratitudePrompts, gratitudeEntries);

  const portableEntries = gratitudeEntries.map((gratitudeEntry) => ({
    noteId: gratitudeEntry.noteId,
    textTitle: deriveGratitudeTitle(
      gratitudeEntry.noteText ?? null,
      gratitudeEntry.prompt ?? null,
    ),
    textContent: normalizeOptionalText(gratitudeEntry.noteText ?? null),
    mood: null,
    tagTitles: [],
    createdAt: gratitudeEntry.createdOn,
    updatedAt: gratitudeEntry.updatedOn,
    assets: resolveGratitudeAppEntryAssets(
      zip,
      gratitudeEntry,
      groupedAssets,
      gratitudeRecordings,
    ),
  }));

  const profileImageName = normalizeOptionalText(gratitudeConfig['Profile Image Name']);

  return {
    portableEntries,
    portablePrompts: Array.from(promptTitles.values()),
    portableTags: createPortableTagsFromGratitudeApp(gratitudeTags),
    profile: {
      name: gratitudeConfig.Name,
      email: gratitudeConfig['Email Id'] ?? null,
      hasEmail: 'Email Id' in gratitudeConfig,
      imagePath: profileImageName
        ? findZipEntryPathByBasename(zip, profileImageName)
        : null,
    },
  };
}

// ============================================================================
// Shared Import Runtime
// ============================================================================
/**
 * Inserts portable tags that do not already exist and returns a title-to-tag-id map.
 */
export async function upsertPortableTags(
  tx: BackupArchiveTransaction,
  portableTags: PortableTag[],
  summary: BackupImportSummary,
): Promise<Map<string, string>> {
  const existingTags = await tx.select().from(tags);
  const tagMap = new Map<string, string>();

  for (const tag of existingTags) {
    tagMap.set(tag.title.trim().toLowerCase(), tag.tag_id);
  }

  for (const portableTag of portableTags) {
    const cleanTitle = sanitizeTagName(portableTag.title);
    if (!cleanTitle) continue;

    const key = cleanTitle.toLowerCase();
    if (tagMap.has(key)) continue;

    const tagId = generateUUID();
    await tx.insert(tags).values({
      tag_id: tagId,
      title: cleanTitle,
      created_at: Number.isFinite(portableTag.createdAt)
        ? portableTag.createdAt
        : Date.now(),
      updated_at: Number.isFinite(portableTag.updatedAt)
        ? portableTag.updatedAt
        : Date.now(),
    });
    tagMap.set(key, tagId);
    summary.importedTags++;
  }

  return tagMap;
}

/**
 * Ensures every portable prompt title exists in the database and tracks new prompt imports.
 */
export async function ensurePortablePromptTitles(
  tx: BackupArchiveTransaction,
  portablePrompts: PortablePrompt[],
  summary: BackupImportSummary,
): Promise<Set<string>> {
  const existingPrompts = await tx.select().from(customPrompts);
  const promptTitles = new Set(
    existingPrompts.map((prompt) => sanitizePromptTitle(prompt.title).toLowerCase()),
  );

  for (const portablePrompt of portablePrompts) {
    const cleanTitle = sanitizePromptTitle(portablePrompt.title);
    if (!cleanTitle) continue;

    const key = cleanTitle.toLowerCase();
    if (promptTitles.has(key)) continue;

    await tx.insert(customPrompts).values({
      prompt_id: generateUUID(),
      title: cleanTitle,
      created_at: Number.isFinite(portablePrompt.createdAt)
        ? portablePrompt.createdAt
        : Date.now(),
      updated_at: Number.isFinite(portablePrompt.updatedAt)
        ? portablePrompt.updatedAt
        : Date.now(),
    });
    promptTitles.add(key);
    summary.importedPrompts++;
  }

  return promptTitles;
}

/**
 * Imports portable entries, materializes their assets, and upserts them into Tackbok.
 */
export async function importPortableEntries(
  tx: BackupArchiveTransaction,
  portableEntries: PortableEntry[],
  existingNoteIds: Set<string>,
  tagMap: Map<string, string>,
  summary: BackupImportSummary,
  mode: ImportMode,
  zip: ZipArchive,
  createdFiles: string[],
  source: BackupImportSource,
  onProgress?: ImportProgressCallback,
): Promise<void> {
  let processedEntries = 0;
  const totalEntries = portableEntries.length;

  const reportEntryProgress = () => {
    reportImportProgress(
      onProgress,
      source,
      'entries',
      totalEntries === 0 ? 1 : processedEntries / Math.max(totalEntries, 1),
      {
        totalEntries,
        processedEntries,
        importedPhotos: summary.importedPhotos,
        importedAudio: summary.importedAudio,
        importedTags: summary.importedTags,
        importedPrompts: summary.importedPrompts,
      },
    );
  };

  reportEntryProgress();

  for (const portableEntry of portableEntries) {
    const noteId = portableEntry.noteId?.trim();
    if (!noteId) {
      processedEntries++;
      reportEntryProgress();
      continue;
    }

    const hasExisting = existingNoteIds.has(noteId);
    if (hasExisting && mode === 'skip') {
      summary.skippedEntries++;
      processedEntries++;
      reportEntryProgress();
      continue;
    }

    const assets: Asset[] = [];
    for (const portableAsset of portableEntry.assets ?? []) {
      const archivePath = assertSafeArchivePath(portableAsset.path);
      const bytes = readSafeZipBytes(zip, archivePath);

      if (portableAsset.type === AssetType.IMAGE) {
        const photo = await writeImportedPhoto(bytes, archivePath);
        createdFiles.push(photo.uri);
        assets.push({
          type: photo.type,
          uri: photo.uri,
          width: portableAsset.width ?? photo.width,
          height: portableAsset.height ?? photo.height,
        });
        summary.importedPhotos++;
        continue;
      }

      const audio = writeImportedAudio(bytes, archivePath);
      createdFiles.push(audio.uri);
      assets.push(audio);
      summary.importedAudio++;
    }

    const tagIds = (portableEntry.tagTitles ?? [])
      .map((title) => sanitizeTagName(title))
      .filter(Boolean)
      .map((title) => tagMap.get(title.toLowerCase()))
      .filter((tagId): tagId is string => !!tagId)
      .join(',');

    const textTitle = normalizeOptionalText(portableEntry.textTitle);
    const textContent = normalizeOptionalText(portableEntry.textContent);
    const mood =
      portableEntry.mood && VALID_MOODS.has(portableEntry.mood)
        ? portableEntry.mood
        : null;
    const createdAt = Number.isFinite(portableEntry.createdAt)
      ? portableEntry.createdAt
      : Date.now();
    const updatedAt = Number.isFinite(portableEntry.updatedAt)
      ? portableEntry.updatedAt
      : createdAt;

    if (!buildSubstantiveCheck({ textTitle, textContent, mood, assets })) {
      processedEntries++;
      reportEntryProgress();
      continue;
    }

    await tx
      .insert(entries)
      .values({
        note_id: noteId,
        text_title: textTitle,
        text_content: textContent,
        mood,
        assets: assets.length > 0 ? assets : null,
        tags: tagIds,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      .onConflictDoUpdate({
        target: entries.note_id,
        set: {
          text_title: textTitle,
          text_content: textContent,
          mood,
          assets: assets.length > 0 ? assets : null,
          tags: tagIds,
          created_at: createdAt,
          updated_at: updatedAt,
        },
      });

    if (hasExisting) {
      summary.updatedEntries++;
    } else {
      existingNoteIds.add(noteId);
      summary.importedEntries++;
    }

    processedEntries++;
    reportEntryProgress();
  }
}
