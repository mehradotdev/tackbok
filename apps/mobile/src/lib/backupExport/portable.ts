/*
 * Converts Tackbok database records into the shared portable model used by backup export.
 */

import { type CustomPrompt, type Entry, type Tag } from '~/db';
import { AssetType } from '~/types';
import type { PortableEntry, PortablePrompt, PortableTag } from '../backupImport/types';
import {
  assetFileExists,
  createArchiveAssetPath,
  resolveTagIdsToTitles,
} from '../backupImport/archiveUtils';

/**
 * Maps stored tag records into portable tag objects for backup serialization.
 */
export function createPortableTags(allTags: Tag[]): PortableTag[] {
  return allTags.map((tag) => ({
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
    title: prompt.title,
    createdAt: prompt.created_at,
    updatedAt: prompt.updated_at,
  }));
}

/**
 * Converts entries and their assets into portable entries while counting exported media.
 */
export function createPortableEntries(
  allEntries: Entry[],
  tagMap: Map<string, string>,
): { portableEntries: PortableEntry[]; photoCount: number; audioCount: number } {
  const portableEntries: PortableEntry[] = [];
  let photoCount = 0;
  let audioCount = 0;

  for (const entry of allEntries) {
    const portableAssets: PortableEntry['assets'] = [];

    for (const asset of entry.assets ?? []) {
      if (!assetFileExists(asset)) {
        continue;
      }

      portableAssets.push({
        type: asset.type,
        path: createArchiveAssetPath(asset.type, asset.uri),
        width: asset.width,
        height: asset.height,
      });

      if (asset.type === AssetType.IMAGE) {
        photoCount++;
      } else {
        audioCount++;
      }
    }

    portableEntries.push({
      noteId: entry.note_id,
      textTitle: entry.text_title,
      textContent: entry.text_content,
      mood: entry.mood ?? null,
      tagTitles: resolveTagIdsToTitles(entry.tags, tagMap),
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      assets: portableAssets,
    });
  }

  return { portableEntries, photoCount, audioCount };
}
