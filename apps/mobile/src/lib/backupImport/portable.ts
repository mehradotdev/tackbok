/**
 * Converts source-specific backup records into the shared portable model and
 * provides the source-agnostic runtime that writes that model into Tackbok.
 */

import { db, customPrompts, entries, mediaAssets, tags } from '~/db';
import { AssetType, type Asset } from '~/types';
import { createZipEntryLookup, type ZipEntryLookup, type ZipReader } from '~/lib/zip';
import { sanitizePromptTitle, sanitizeTagName } from '~/lib/utils';
import { sha256Bytes } from '~/lib/cloudSync/snapshot/sha256';
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
import { and, eq, inArray } from 'drizzle-orm';
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
      const blobHash = sha256Bytes(bytes);

      if (portableAsset.type === AssetType.IMAGE) {
        const photo = await writeImportedPhoto(bytes, archivePath);
        entryCreatedFiles.push(photo.uri);
        assets.push({
          type: photo.type,
          uri: photo.uri,
          width: portableAsset.width ?? photo.width,
          height: portableAsset.height ?? photo.height,
          assetId: portableAsset.assetId,
          blobHash,
          mimeType: portableAsset.mimeType,
          byteSize: bytes.byteLength,
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
        blobHash,
        mimeType: portableAsset.mimeType,
        byteSize: bytes.byteLength,
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
/**
 * The tags a history restore brings back (#185 P9): only those the entries
 * it writes use (every entry when overwriting, the missing ones when
 * skipping). Tag IDs come from titles, so a tag deleted since the backup
 * would otherwise come back on every device.
 */
export function tagsForHistoryRestore(
  portableEntries: readonly PortableEntry[],
  portableTags: readonly PortableTag[],
  existingNoteIds: ReadonlySet<string>,
  mode: ImportMode,
): PortableTag[] {
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const entry of portableEntries) {
    // As `importPortableEntries` reads it.
    const noteId = entry.noteId?.trim();
    if (!noteId || (mode === 'skip' && existingNoteIds.has(noteId))) continue;
    for (const id of entry.tagIds ?? []) ids.add(id);
    for (const title of entry.tagTitles ?? [])
      titles.add(sanitizeTagName(title).toLowerCase());
  }
  return portableTags.filter(
    (tag) =>
      (tag.tagId !== undefined && ids.has(tag.tagId)) ||
      titles.has(sanitizeTagName(tag.title).toLowerCase()),
  );
}

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

    // The ID derives from the title (cloud sync v2), not from the archive.
    const tagId = await createTagInTransaction(tx, cleanTitle, {
      batchId,
      now: Number.isFinite(portableTag.updatedAt) ? portableTag.updatedAt : Date.now(),
      createdAt: Number.isFinite(portableTag.createdAt)
        ? portableTag.createdAt
        : undefined,
    });
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

  for (const portablePrompt of portablePrompts) {
    const cleanTitle = sanitizePromptTitle(portablePrompt.title);
    if (!cleanTitle) continue;

    const key = cleanTitle.toLowerCase();
    if (promptTitles.has(key)) continue;

    await createPromptInTransaction(tx, cleanTitle, {
      batchId,
      now: Number.isFinite(portablePrompt.updatedAt)
        ? portablePrompt.updatedAt
        : Date.now(),
      createdAt: Number.isFinite(portablePrompt.createdAt)
        ? portablePrompt.createdAt
        : undefined,
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
  zip: ZipReader,
  createdFiles: string[],
  source: BackupImportSource,
  onProgress?: ImportProgressCallback,
  batchId?: string,
  /**
   * `history`: restoring a cloud backup from history (#185 P9). Note IDs
   * are this journal's own, so the cross-source duplicate check is off (it
   * could skip a deleted entry whose "Keep both" twin has its date and
   * text), and an entry whose media is incomplete keeps its current
   * attachments on overwrite.
   */
  options: { history?: boolean } = {},
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
    for (
      let index = 0;
      index < Math.max(portableTagIds.length, portableTagTitles.length);
      index++
    ) {
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
    if (!options.history && !hasExisting && hasPortableCreatedAt && textContent) {
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

    // A history restore keeps an attachment's ID only while this journal
    // still has it: one removed since may have a published descriptor
    // other devices still hold, which a new row under its ID would contradict.
    // One this entry still has with the same bytes keeps its file and ID: no
    // second copy. That includes one whose backup ID is gone here because an
    // earlier restore gave it a new one (skip, then overwrite).
    let entryToImport = portableEntry;
    const reused = new Map<number, Asset>();
    if (options.history) {
      const ids = portableEntry.assets.flatMap((asset) =>
        asset.assetId ? [asset.assetId] : [],
      );
      const rows =
        ids.length === 0
          ? []
          : await tx.select().from(mediaAssets).where(inArray(mediaAssets.asset_id, ids));
      const byId = new Map(rows.map((row) => [row.asset_id, row]));
      const current = hasExisting
        ? await tx
            .select()
            .from(mediaAssets)
            .where(
              and(eq(mediaAssets.owner_type, 'entry'), eq(mediaAssets.owner_id, noteId)),
            )
        : [];
      const keepable = (
        row: typeof mediaAssets.$inferSelect | undefined,
        blobHash: string | undefined,
      ) =>
        !!row?.local_uri &&
        row.owner_type === 'entry' &&
        row.owner_id === noteId &&
        !!row.blob_hash &&
        row.blob_hash === blobHash;
      // By ID first, then, for a backup ID this journal no longer has, by
      // bytes among this entry's attachments not matched yet.
      const matches = new Map<number, typeof mediaAssets.$inferSelect>();
      const taken = new Set<string>();
      portableEntry.assets.forEach((asset, index) => {
        const row = asset.assetId ? byId.get(asset.assetId) : undefined;
        if (row && keepable(row, asset.blobHash)) {
          matches.set(index, row);
          taken.add(row.asset_id);
        }
      });
      portableEntry.assets.forEach((asset, index) => {
        if (matches.has(index) || (asset.assetId && byId.has(asset.assetId))) return;
        // Not a row another backup attachment names by ID: that one keeps its ID.
        const row = current.find(
          (candidate) =>
            !taken.has(candidate.asset_id) &&
            !byId.has(candidate.asset_id) &&
            keepable(candidate, asset.blobHash),
        );
        if (row) {
          matches.set(index, row);
          taken.add(row.asset_id);
        }
      });
      const remaining: PortableEntry['assets'] = [];
      portableEntry.assets.forEach((asset, index) => {
        const row = asset.assetId ? byId.get(asset.assetId) : undefined;
        const match = matches.get(index);
        if (match?.local_uri && match.blob_hash) {
          reused.set(index, {
            type: match.kind === 'voice' ? AssetType.AUDIO : AssetType.IMAGE,
            uri: match.local_uri,
            assetId: match.asset_id,
            blobHash: match.blob_hash,
            mimeType: match.mime_type ?? undefined,
            byteSize: match.byte_size ?? undefined,
            width: match.width ?? undefined,
            height: match.height ?? undefined,
            durationMs: match.duration_ms ?? undefined,
          });
          return;
        }
        remaining.push(row ? asset : { ...asset, assetId: undefined });
      });
      entryToImport = { ...portableEntry, assets: remaining };
    }

    const {
      assets: materialized,
      createdFiles: entryCreatedFiles,
      hadFailures,
    } = await materializePortableEntryAssets(entryToImport, zip, summary, source);
    // In the backup's order: kept files where they were, new ones in the
    // other places (one that failed to restore leaves its place out).
    const assets: Asset[] = [];
    if (!options.history) assets.push(...materialized);
    else {
      let next = 0;
      portableEntry.assets.forEach((_asset, index) => {
        const kept = reused.get(index);
        if (kept) assets.push(kept);
        else if (next < materialized.length) assets.push(materialized[next++]);
      });
    }

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

    // Attachments the archive could not carry: keep the current ones beside
    // the restored ones instead of removing them.
    if (options.history && hasExisting && portableEntry.mediaIncomplete) {
      const [current] = await tx
        .select({ assets: entries.assets })
        .from(entries)
        .where(eq(entries.note_id, noteId))
        .limit(1);
      const restored = new Set(assets.map((asset) => asset.blobHash).filter(Boolean));
      for (const asset of current?.assets ?? [])
        if (!asset.blobHash || !restored.has(asset.blobHash)) assets.push(asset);
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
