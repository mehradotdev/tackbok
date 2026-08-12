/**
 * Converts source-specific backup records into the shared portable model and
 * provides the source-agnostic runtime that writes that model into Tackbok.
 */

import { randomUUID } from 'expo-crypto';
import { db, customPrompts, entries, tags } from '~/db';
import { AssetType, type Asset } from '~/types';
import { createZipEntryLookup, type ZipEntryLookup, type ZipReader } from '~/lib/zip';
import { sanitizePromptTitle, sanitizeTagName } from '~/lib/utils';
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
  cleanupImportedFiles,
  deriveGratitudeTitle,
  normalizeOptionalText,
  readSafeZipBytes,
  readSafeZipJson,
  VALID_MOODS,
  writeImportedAudio,
  writeImportedPhoto,
} from './archiveUtils';
import { createSummaryCounterMetrics, recordImportWarning } from './summary';
import { and, eq } from 'drizzle-orm';
import {
  createPromptInTransaction,
  createTagInTransaction,
  upsertEntryInTransaction,
} from '~/lib/cloudSync/storage/repositories';

type BackupArchiveTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function describeImportedAsset(type: Asset['type']): string {
  return type === AssetType.IMAGE ? 'image' : 'voice memo';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }

  if (typeof error === 'string' && error) {
    return error;
  }

  return 'Unknown import error';
}

function logImportWarning(
  source: BackupImportSource,
  message: string,
  error?: unknown,
): void {
  if (error === undefined) {
    console.warn(`[backupImport:${source}] ${message}`);
    return;
  }

  console.warn(`[backupImport:${source}] ${message}`, error);
}

interface MaterializedPortableAssetsResult {
  assets: Asset[];
  createdFiles: string[];
  hadFailures: boolean;
}

/**
 * Lets the UI thread render between synchronous asset reads/writes; a plain
 * await only yields a microtask, which never frees a frame.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function materializePortableEntryAssets(
  portableEntry: PortableEntry,
  zip: ZipReader,
  summary: BackupImportSummary,
  source: BackupImportSource,
): Promise<MaterializedPortableAssetsResult> {
  const assets: Asset[] = [];
  const entryCreatedFiles: string[] = [];
  let hadFailures = false;

  for (const portableAsset of portableEntry.assets ?? []) {
    await yieldToEventLoop();
    try {
      const archivePath = assertSafeArchivePath(portableAsset.path);
      const bytes = await readSafeZipBytes(zip, archivePath);

      if (portableAsset.type === AssetType.IMAGE) {
        const photo = await writeImportedPhoto(bytes, archivePath);
        entryCreatedFiles.push(photo.uri);
        assets.push({
          type: photo.type,
          uri: photo.uri,
          width: portableAsset.width ?? photo.width,
          height: portableAsset.height ?? photo.height,
          assetId: portableAsset.assetId,
          blobHash: portableAsset.blobHash,
          mimeType: portableAsset.mimeType,
          byteSize: portableAsset.byteSize,
          durationMs: portableAsset.durationMs,
        });
        summary.importedPhotos++;
        continue;
      }

      const audio = writeImportedAudio(bytes, archivePath);
      entryCreatedFiles.push(audio.uri);
        assets.push({
          ...audio,
          assetId: portableAsset.assetId,
          blobHash: portableAsset.blobHash,
          mimeType: portableAsset.mimeType,
          byteSize: portableAsset.byteSize,
          durationMs: portableAsset.durationMs,
        });
      summary.importedAudio++;
    } catch (error) {
      hadFailures = true;
      const assetLabel = describeImportedAsset(portableAsset.type);
      const message = `Could not restore ${assetLabel} "${portableAsset.path}" for entry "${portableEntry.noteId}".`;

      recordImportWarning(summary, {
        kind: 'entry-asset',
        message: `${message} ${getErrorMessage(error)}`,
        noteId: portableEntry.noteId,
        assetPath: portableAsset.path,
        assetType: portableAsset.type,
      });
      logImportWarning(source, message, error);
    }
  }

  return {
    assets,
    createdFiles: entryCreatedFiles,
    hadFailures,
  };
}

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

function normalizeArchiveLookupPath(path: string | null | undefined): string | null {
  const normalized = path
    ?.trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '');
  return normalized ? normalized : null;
}

function resolveGratitudeArchiveAssetPath(
  zipLookup: ZipEntryLookup,
  dirName: string,
  rawPath: string | null | undefined,
): string | null {
  const normalizedPath = normalizeArchiveLookupPath(rawPath);
  if (!normalizedPath) {
    return null;
  }

  const candidates = new Set<string>([normalizedPath]);
  if (!normalizedPath.startsWith(`${dirName}/`)) {
    candidates.add(`${dirName}/${normalizedPath}`);
  }

  for (const candidatePath of candidates) {
    if (zipLookup.hasPath(candidatePath)) {
      return candidatePath;
    }
  }

  const basename = normalizedPath.split('/').pop();
  if (!basename) {
    return null;
  }

  return (
    zipLookup.findByDirectoryAndBasename(dirName, basename) ??
    zipLookup.findByBasename(basename)
  );
}

/**
 * Resolves all image and audio assets for a GratitudeApp entry from the imported ZIP archive.
 */
function resolveGratitudeAppEntryAssets(
  zipLookup: ZipEntryLookup,
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
    const candidatePath = resolveGratitudeArchiveAssetPath(
      zipLookup,
      dirName,
      asset.assetPath,
    );
    if (!candidatePath) continue;

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
      const candidatePath = resolveGratitudeArchiveAssetPath(
        zipLookup,
        GRATITUDE_APP_IMAGES_DIR,
        imageName,
      );
      if (!candidatePath) continue;

      entryAssets.push({
        type: AssetType.IMAGE,
        path: candidatePath,
      });
    }
  }

  if (!entryAssets.some((asset) => asset.type === AssetType.AUDIO)) {
    for (const recording of gratitudeRecordings) {
      if (recording.noteId !== gratitudeEntry.noteId) continue;

      const candidatePath = resolveGratitudeArchiveAssetPath(
        zipLookup,
        GRATITUDE_APP_RECORDINGS_DIR,
        recording.recordingPath,
      );
      if (!candidatePath) continue;

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
export async function buildGratitudeAppPortablePayload(
  zip: ZipReader,
): Promise<GratitudeAppPortablePayload> {
  const [
    gratitudeEntries,
    gratitudeAssets,
    gratitudePrompts,
    gratitudeTags,
    gratitudeRecordings,
    gratitudeConfigList,
  ] = await Promise.all([
    readSafeZipJson<GratitudeAppEntryRecord[]>(zip, GRATITUDE_APP_ENTRIES_PATH),
    readSafeZipJson<GratitudeAppAssetRecord[]>(zip, GRATITUDE_APP_ASSETS_PATH),
    readSafeZipJson<GratitudeAppPromptRecord[]>(zip, GRATITUDE_APP_PROMPTS_PATH),
    readSafeZipJson<GratitudeAppTagRecord[]>(zip, GRATITUDE_APP_TAGS_PATH),
    readSafeZipJson<GratitudeAppRecordingRecord[]>(zip, GRATITUDE_APP_RECORDINGS_PATH),
    readSafeZipJson<GratitudeAppConfigRecord[]>(zip, GRATITUDE_APP_CONFIG_PATH),
  ]);
  const gratitudeConfig = gratitudeConfigList[0] ?? {};
  // Gratitude backups often store media under a parent folder, so the importer
  // reuses a single lookup facade for exact-path and basename fallbacks.
  const zipLookup = createZipEntryLookup(zip);
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
      zipLookup,
      gratitudeEntry,
      groupedAssets,
      gratitudeRecordings,
    ),
  }));

  const profileEmail = normalizeOptionalText(gratitudeConfig['Email Id']);
  const profileImageName = normalizeOptionalText(gratitudeConfig['Profile Image Name']);

  return {
    portableEntries,
    portablePrompts: Array.from(promptTitles.values()),
    portableTags: createPortableTagsFromGratitudeApp(gratitudeTags),
    profile: {
      name: gratitudeConfig.Name,
      email: profileEmail,
      hasEmail: profileEmail !== null,
      imagePath: profileImageName ? zipLookup.findByBasename(profileImageName) : null,
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
  batchId?: string,
): Promise<Map<string, string>> {
  const existingTags = await tx.select().from(tags);
  const tagMap = new Map<string, string>();

  for (const tag of existingTags) {
    const key = sanitizeTagName(tag.title).toLowerCase();
    if (!key) continue;
    tagMap.set(key, tag.tag_id);
    tagMap.set(`id:${tag.tag_id}`, tag.tag_id);
  }

  for (const portableTag of portableTags) {
    const cleanTitle = sanitizeTagName(portableTag.title);
    if (!cleanTitle) continue;

    const key = cleanTitle.toLowerCase();
    const portableId = portableTag.tagId?.trim();
    const existingTitleId = tagMap.get(key);
    if (existingTitleId) {
      if (portableId) tagMap.set(`id:${portableId}`, existingTitleId);
      continue;
    }

    const requestedId = portableId || randomUUID();
    const tagId = tagMap.has(`id:${requestedId}`) ? randomUUID() : requestedId;
    await createTagInTransaction(
      tx,
      cleanTitle,
      {
        batchId,
        now: Number.isFinite(portableTag.updatedAt)
          ? portableTag.updatedAt
          : Date.now(),
        createdAt: Number.isFinite(portableTag.createdAt)
          ? portableTag.createdAt
          : undefined,
      },
      tagId,
    );
    tagMap.set(key, tagId);
    tagMap.set(`id:${tagId}`, tagId);
    if (portableId) tagMap.set(`id:${portableId}`, tagId);
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
  batchId?: string,
): Promise<Set<string>> {
  const existingPrompts = await tx.select().from(customPrompts);
  const promptTitles = new Set(
    existingPrompts.map((prompt) => sanitizePromptTitle(prompt.title).toLowerCase()),
  );
  const promptIds = new Set(existingPrompts.map((prompt) => prompt.prompt_id));

  for (const portablePrompt of portablePrompts) {
    const cleanTitle = sanitizePromptTitle(portablePrompt.title);
    if (!cleanTitle) continue;

    const key = cleanTitle.toLowerCase();
    if (promptTitles.has(key)) continue;

    const requestedId = portablePrompt.promptId?.trim() || randomUUID();
    const promptId = promptIds.has(requestedId) ? randomUUID() : requestedId;
    await createPromptInTransaction(
      tx,
      cleanTitle,
      {
        batchId,
        now: Number.isFinite(portablePrompt.updatedAt)
          ? portablePrompt.updatedAt
          : Date.now(),
        createdAt: Number.isFinite(portablePrompt.createdAt)
          ? portablePrompt.createdAt
          : undefined,
      },
      promptId,
    );
    promptIds.add(promptId);
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
  zip: ZipReader,
  createdFiles: string[],
  source: BackupImportSource,
  onProgress?: ImportProgressCallback,
  batchId?: string,
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
        ...createSummaryCounterMetrics(summary),
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

    const resolvedTagIds = new Set<string>();
    const portableTagIds = portableEntry.tagIds ?? [];
    const portableTagTitles = portableEntry.tagTitles ?? [];
    for (let index = 0; index < Math.max(portableTagIds.length, portableTagTitles.length); index++) {
      const stableId = portableTagIds[index]
        ? tagMap.get(`id:${portableTagIds[index]}`)
        : undefined;
      const cleanTitle = portableTagTitles[index]
        ? sanitizeTagName(portableTagTitles[index])
        : '';
      const titleId = cleanTitle ? tagMap.get(cleanTitle.toLowerCase()) : undefined;
      const resolvedId = stableId ?? titleId;
      if (resolvedId) resolvedTagIds.add(resolvedId);
    }
    const tagIds = Array.from(resolvedTagIds).sort().join(',');

    const textTitle = normalizeOptionalText(portableEntry.textTitle);
    const textContent = normalizeOptionalText(portableEntry.textContent);
    const mood =
      portableEntry.mood && VALID_MOODS.has(portableEntry.mood)
        ? portableEntry.mood
        : null;
    const hasPortableCreatedAt = Number.isFinite(portableEntry.createdAt);
    const createdAt = hasPortableCreatedAt ? portableEntry.createdAt : Date.now();
    const updatedAt = Number.isFinite(portableEntry.updatedAt)
      ? portableEntry.updatedAt
      : createdAt;

    // Presently imports generate different note IDs, so note_id checks alone
    // cannot detect cross-source duplicates. For new note IDs, use the same
    // created_at + text_content key as Presently to skip equivalent entries.
    // This path always skips on match, even in overwrite mode, to avoid
    // unnecessary updated_at churn when content is already present.
    // TODO: Benchmark duplicate-check latency before optimizing this import
    // path. If portable imports become slow on larger datasets, preload
    // existing created_at/text_content pairs for the imported timestamps so
    // duplicate detection does not rely on repeated point lookups.
    if (!hasExisting && hasPortableCreatedAt && textContent) {
      const duplicateByTimestampAndContent = await tx
        .select({ note_id: entries.note_id })
        .from(entries)
        .where(
          and(eq(entries.created_at, createdAt), eq(entries.text_content, textContent)),
        )
        .limit(1);

      if (duplicateByTimestampAndContent.length > 0) {
        summary.skippedEntries++;
        processedEntries++;
        reportEntryProgress();
        continue;
      }
    }

    const {
      assets,
      createdFiles: entryCreatedFiles,
      hadFailures,
    } = await materializePortableEntryAssets(portableEntry, zip, summary, source);

    if (
      hadFailures &&
      (portableEntry.assets?.length ?? 0) > 0 &&
      !buildSubstantiveCheck({ textTitle, textContent, mood, assets })
    ) {
      const message = `Skipped entry "${noteId}" because none of its content could be restored after media import failures.`;
      recordImportWarning(summary, {
        kind: 'entry-skipped',
        message,
        noteId,
      });
      logImportWarning(source, message);
    }

    if (!buildSubstantiveCheck({ textTitle, textContent, mood, assets })) {
      summary.skippedEntries++;
      processedEntries++;
      reportEntryProgress();
      continue;
    }

    try {
      await upsertEntryInTransaction(
        tx,
        {
          note_id: noteId,
          text_title: textTitle,
          text_content: textContent,
          mood,
          assets: assets.length > 0 ? assets : null,
          tags: tagIds,
          created_at: createdAt,
          updated_at: updatedAt,
        },
        { batchId, now: updatedAt },
      );
    } catch (error) {
      cleanupImportedFiles(entryCreatedFiles);
      throw error;
    }

    createdFiles.push(...entryCreatedFiles);

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
