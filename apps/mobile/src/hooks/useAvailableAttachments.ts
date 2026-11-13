import { useSyncExternalStore } from 'react';
import type { Asset } from '~/types';
import {
  getMediaRevision,
  subscribeMediaRevision,
} from '~/lib/cloudSync/runtime/mediaRevision';
import { filterExistingPhotos, filterUnavailableAttachments } from '~/lib/photoUtils';
import { filterExistingVoiceMemos } from '~/lib/voiceMemoUtils';

/**
 * Reads attachment files again whenever cloud sync may have added some. Files
 * arrive without the entry rows changing, so a value cached only on those
 * rows would keep hiding them.
 */
export function useMediaFiles<T>(read: () => T): T {
  const revision = useSyncExternalStore(
    subscribeMediaRevision,
    getMediaRevision,
    getMediaRevision,
  );
  return readAtRevision(read, revision);
}

/**
 * Takes the revision so that the React Compiler, which caches calls on their
 * arguments, reads the files again whenever it changes.
 */
function readAtRevision<T>(read: () => T, _revision: number): T {
  return read();
}

/** An entry's attachments split by whether their files are on disk. */
export function useAvailableAttachments(assets: Asset[] | null | undefined) {
  return useMediaFiles(() => ({
    photos: filterExistingPhotos(assets ?? null),
    voiceMemos: filterExistingVoiceMemos(assets ?? null),
    unavailable: filterUnavailableAttachments(assets ?? null),
  }));
}
