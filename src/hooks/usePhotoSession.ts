import { useState, useRef, useCallback } from 'react';
import { MAX_PHOTOS_PER_ENTRY } from '~/constants';
import type { Asset } from '~/types';
import {
  type PickPhotosResult,
  compressAndSavePhoto,
  deletePhotoFile,
} from '~/lib/photoUtils';

/**
 * Manages photo state throughout an editing session, tracking which photos
 * are newly added vs. originally present, and handling disk cleanup on
 * commit (save) or discard (cancel).
 *
 * ## Mental Model
 *
 * There are two pools of "dirty" files that may need cleanup:
 *
 *   1. **Added photos** — files created on disk this session via compressAndSavePhoto.
 *      These are NEW files that didn't exist before the session started.
 *
 *   2. **Removed photos** — photos the user hit "X" on. They're pulled from the
 *      visible `photos` array into a removal queue.
 *
 * On **save**: delete removed photos (both old and new, they're gone either way)
 *              and keep added photos that are still visible.
 *
 * On **discard**: delete all added photos (they were never committed),
 *                 restore all removed initial photos (pretend nothing happened).
 *
 * ## The 4 Scenarios
 *
 * | Action               | Save                          | Discard                        |
 * |----------------------|-------------------------------|--------------------------------|
 * | Added new photo(s)   | Keep files, persist in DB     | Delete files from disk         |
 * | Removed existing(s)  | Delete files from disk        | Keep files, they're "restored" |
 */

interface UsePhotoSessionReturn {
  /** Current visible photos in the editor */
  photos: Asset[];
  /** True while compressing/saving picked photos */
  isAddingPhotos: boolean;
  /** URIs of the current photos, for change detection */
  photoUris: string[];
  /** Handle the result from the photo picker */
  handlePhotosPicked: (result: PickPhotosResult) => Promise<void>;
  /** Remove a photo from the visible list (queued for deletion on save) */
  removePhoto: (photoUri: string) => void;
  /** Commit: delete removed photos from disk. Call inside your save handler. */
  commitRemovedPhotos: () => Promise<void>;
  /** Discard: delete all newly-added photos from disk, restore originals. */
  discardAllChanges: () => Promise<void>;
}

export function usePhotoSession(initialPhotos: Asset[]): UsePhotoSessionReturn {
  const [photos, setPhotos] = useState<Asset[]>(initialPhotos);
  const [isAddingPhotos, setIsAddingPhotos] = useState(false);

  // URIs that existed at the start of this session — our source of truth for "original vs. new"
  const initialUrisRef = useRef(new Set(initialPhotos.map((p) => p.uri)));

  // Photos removed during this session (to be deleted on save, or selectively on discard)
  const removedPhotosRef = useRef<Asset[]>([]);

  const handlePhotosPicked = useCallback(async (result: PickPhotosResult) => {
    if (result.status !== 'success' || result.uris.length === 0) return;

    setIsAddingPhotos(true);
    try {
      const newAssets = await Promise.all(result.uris.map(compressAndSavePhoto));
      setPhotos((prev) => [...prev, ...newAssets].slice(0, MAX_PHOTOS_PER_ENTRY));
    } finally {
      setIsAddingPhotos(false);
    }
  }, []);

  const removePhoto = useCallback((photoUri: string) => {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.uri === photoUri);
      if (removed) {
        removedPhotosRef.current.push(removed);
      }
      return prev.filter((p) => p.uri !== photoUri);
    });
  }, []);

  /**
   * Commit (Save path):
   * Delete every photo in the removal queue from disk.
   * This includes both originally-existing photos and newly-added-then-removed ones.
   */
  const commitRemovedPhotos = useCallback(async () => {
    if (removedPhotosRef.current.length > 0) {
      await Promise.all(removedPhotosRef.current.map((p) => deletePhotoFile(p.uri)));
      removedPhotosRef.current = [];
    }
  }, []);

  /**
   * Discard (Cancel path):
   * Clean up ALL files that were created this session — whether they're still
   * visible in the editor or were subsequently removed by the user.
   * Original photos are left untouched on disk.
   */
  const discardAllChanges = useCallback(async () => {
    const initialUris = initialUrisRef.current;

    // New photos still visible in the editor
    const addedVisible = photos.filter((p) => !initialUris.has(p.uri));

    // New photos that were added then removed (sitting in the removal queue)
    const addedThenRemoved = removedPhotosRef.current.filter(
      (p) => !initialUris.has(p.uri),
    );

    const toDelete = [...addedVisible, ...addedThenRemoved];

    if (toDelete.length > 0) {
      await Promise.all(toDelete.map((p) => deletePhotoFile(p.uri)));
    }

    removedPhotosRef.current = [];
  }, [photos]);

  return {
    photos,
    isAddingPhotos,
    photoUris: photos.map((p) => p.uri),
    handlePhotosPicked,
    removePhoto,
    commitRemovedPhotos,
    discardAllChanges,
  };
}
