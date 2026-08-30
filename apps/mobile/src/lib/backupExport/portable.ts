/*
 * Converts Tackbok database records into the shared portable model used by backup export.
 */

import { type CustomPrompt, type Entry, type MediaAsset, type Tag } from '~/db';
import { AssetType, type Asset } from '~/types';
import type { PortableEntry, PortablePrompt, PortableTag } from '../backupImport/types';
import {
  assetFileExists,
  createArchiveAssetPath,
  resolveTagIdsToTitles,
} from './utils';

/**
 * Maps stored tag records into portable tag objects for backup serialization.
 */
export function createPortableTags(allTags: Tag[]): PortableTag[] {
  return allTags.map((tag) => ({
    tagId: tag.tag_id,
    title: tag.title,
    createdAt: tag.created_at,
    updatedAt: tag.updated_at,
  }));
}

/**
 * Maps stored custom prompts into portable prompt objects for backup serialization.
 */
export function createPortablePrompts(allPrompts: CustomPrompt[]): PortablePrompt[] {
  return allPrompts.map((prompt) => ({
    promptId: prompt.prompt_id,
    title: prompt.title,
    createdAt: prompt.created_at,
    updatedAt: prompt.updated_at,
  }));
}

/**
 * Converts stored entries into portable backup entries and drops asset records
 * whose underlying files no longer exist on disk.
 */
export function createPortableEntries(
  allEntries: Entry[],
  tagMap: Map<string, string>,
  normalizedAssetsByEntry: Map<string, MediaAsset[]> = new Map(),
  normalizedTagIdsByEntry: Map<string, string[]> = new Map(),
): { portableEntries: PortableEntry[] } {
  const portableEntries: PortableEntry[] = [];

  for (const entry of allEntries) {
    const portableAssets: PortableEntry['assets'] = [];

    const normalizedAssets = normalizedAssetsByEntry.get(entry.note_id) ?? [];
    const sourceAssets: Asset[] =
      normalizedAssets.length > 0
        ? normalizedAssets
            .filter((asset) => asset.local_uri)
            .map((asset) => ({
              type: asset.kind === 'voice' ? AssetType.AUDIO : AssetType.IMAGE,
              uri: asset.local_uri!,
              assetId: asset.asset_id,
              blobHash: asset.blob_hash ?? undefined,
              mimeType: asset.mime_type ?? undefined,
              byteSize: asset.byte_size ?? undefined,
              durationMs: asset.duration_ms ?? undefined,
              width: asset.width ?? undefined,
              height: asset.height ?? undefined,
            }))
        : entry.assets ?? [];

    for (const asset of sourceAssets) {
      if (!assetFileExists(asset)) {
        continue;
      }

      portableAssets.push({
        type: asset.type,
        assetId: asset.assetId,
        blobHash: asset.blobHash,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        durationMs: asset.durationMs,
        path: createArchiveAssetPath(asset.type, asset.uri),
        width: asset.width,
        height: asset.height,
      });
    }

    portableEntries.push({
      noteId: entry.note_id,
      textTitle: entry.text_title,
      textContent: entry.text_content,
      mood: entry.mood ?? null,
      tagTitles: resolveTagIdsToTitles(entry.tags, tagMap),
      tagIds: normalizedTagIdsByEntry.get(entry.note_id) ??
        entry.tags.split(',').filter(Boolean).sort(),
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      assets: portableAssets,
    });
  }

  return { portableEntries };
}
