/*
 * Converts a cloud backup snapshot (sync v2 state) into the portable model a
 * Tackbok ZIP backup uses, so an earlier backup can be exported or restored
 * through the ordinary import (#185 P9).
 */
import { AssetType } from '~/types';
import type { MediaDescriptor, SyncState } from '~/lib/cloudSync/v2/types';
import {
  attachmentIds,
  liveEntries,
  shownItems,
  shownNamed,
  shownTagIds,
} from '~/lib/cloudSync/v2/view';
import type {
  PortableEntry,
  PortableProfile,
  PortablePrompt,
  PortableTag,
} from '../backupImport/types';

/** A media file the archive needs, at `path`. */
export interface SnapshotMediaFile {
  path: string;
  blobHash: string;
  byteSize: number;
}

export interface SnapshotPortable {
  entries: PortableEntry[];
  tags: PortableTag[];
  prompts: PortablePrompt[];
  profile: PortableProfile;
  media: SnapshotMediaFile[];
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

/**
 * A file per asset, numbered: asset IDs are unique in a state, but may hold
 * characters an archive path should not.
 */
function archivePath(media: MediaDescriptor, index: number): string {
  const voice = media.kind === 'voice';
  const extension =
    (media.mimeType && EXTENSIONS[media.mimeType.toLowerCase()]) ??
    (voice ? 'm4a' : 'jpg');
  const directory =
    media.kind === 'profile-photo' ? 'profile' : voice ? 'voice-memos' : 'photos';
  return `media/${directory}/${index + 1}.${extension}`;
}

/**
 * The journal a snapshot shows, as a portable backup. Values the app would
 * show; other versions of a title or text are left out, as in an ordinary
 * export. The profile email is not synced, so the caller passes this
 * device's (an overwriting restore would otherwise clear it).
 */
export function snapshotToPortable(
  state: SyncState,
  email: string | null,
): SnapshotPortable {
  const media = new Map<string, SnapshotMediaFile>();
  const fileFor = (descriptor: MediaDescriptor) => {
    const file = {
      path: archivePath(descriptor, media.size),
      blobHash: descriptor.blobHash,
      byteSize: descriptor.byteSize,
    };
    media.set(file.path, file);
    return file;
  };

  const shownTags = shownNamed(state, 'tag');
  const tagTitles = new Map(shownTags.map((tag) => [tag.id, tag.title]));
  const tags: PortableTag[] = shownTags.map((tag) => {
    const at = state.tags.get(tag.id)!.title.s[0];
    return { tagId: tag.id, title: tag.title, createdAt: at, updatedAt: at };
  });
  const prompts: PortablePrompt[] = shownNamed(state, 'prompt').map((prompt) => {
    const at = state.prompts.get(prompt.id)!.title.s[0];
    return { promptId: prompt.id, title: prompt.title, createdAt: at, updatedAt: at };
  });

  const entries: PortableEntry[] = [];
  for (const entry of liveEntries(state)) {
    // A live entry has values; only a compacted deleted one lacks them.
    if (!entry.date || !entry.mood) continue;
    const title = shownItems(entry.title)[0] ?? null;
    const text = shownItems(entry.text)[0] ?? null;
    const tagIds = shownTagIds(entry, shownTags).sort();
    const assets: PortableEntry['assets'] = [];
    for (const assetId of attachmentIds(entry)) {
      const descriptor = state.media.get(assetId);
      if (!descriptor || descriptor.kind === 'profile-photo') continue;
      assets.push({
        type: descriptor.kind === 'voice' ? AssetType.AUDIO : AssetType.IMAGE,
        assetId,
        blobHash: descriptor.blobHash,
        mimeType: descriptor.mimeType ?? undefined,
        byteSize: descriptor.byteSize,
        durationMs: descriptor.durationMs ?? undefined,
        width: descriptor.width ?? undefined,
        height: descriptor.height ?? undefined,
        path: fileFor(descriptor).path,
      });
    }
    const stamps = [title?.s[0], text?.s[0], entry.mood.s[0], entry.date.s[0]];
    entries.push({
      noteId: entry.id,
      textTitle: title?.v ?? null,
      textContent: text?.v ?? null,
      mood: entry.mood.v,
      tagTitles: tagIds.map((id) => tagTitles.get(id)!),
      tagIds,
      createdAt: entry.date.v,
      updatedAt: Math.max(...stamps.filter((value) => value !== undefined)),
      assets,
    });
  }
  // Newest first, as an ordinary export.
  entries.sort(
    (left, right) =>
      right.createdAt - left.createdAt || left.noteId.localeCompare(right.noteId),
  );

  const name = shownItems(state.profile.name)[0]?.v ?? null;
  const photoId = shownItems(state.profile.photo)[0]?.v ?? null;
  const photo = photoId ? state.media.get(photoId) : undefined;
  const profile: PortableProfile = {
    name,
    email,
    imagePath: photo ? fileFor(photo).path : null,
    photoAssetId: photo?.assetId ?? null,
    photoBlobHash: photo?.blobHash ?? null,
  };
  return { entries, tags, prompts, profile, media: [...media.values()] };
}
