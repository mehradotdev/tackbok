import { useState, useRef, useCallback, useMemo } from 'react';
import type { Asset } from '~/types';
import { saveVoiceMemo, deleteVoiceMemoFile } from '~/lib/voiceMemoUtils';
import { useTranslation } from '~/lib/i18n';
import { toast } from '~/components/ui/toast';

/**
 * Manages voice memo state throughout an editing session, tracking which memos
 * are newly added vs. originally present, and handling disk cleanup on
 * commit (save) or discard (cancel).
 *
 * ## Mental Model  (mirrors usePhotoSession)
 *
 * There are two pools of "dirty" files that may need cleanup:
 *
 *   1. **Added memos** — files created on disk this session via saveVoiceMemo.
 *      These are NEW files that didn't exist before the session started.
 *
 *   2. **Removed memos** — memos the user hit "X" on. They're pulled from the
 *      visible `voiceMemos` array into a removal queue.
 *
 * On **save**: delete removed memos (both old and new, they're gone either way)
 *              and keep added memos that are still visible.
 *
 * On **discard**: delete all added memos (they were never committed),
 *                 restore all removed initial memos (pretend nothing happened).
 */

interface UseVoiceMemoSessionReturn {
  /** Current visible voice memos in the editor */
  voiceMemos: Asset[];
  /** URIs of the current voice memos, for change detection */
  voiceMemoUris: string[];
  /** Handle a newly recorded voice memo from its temp URI */
  handleVoiceMemoSaved: (tempUri: string) => Promise<void>;
  /** Remove a voice memo from the visible list (queued for deletion on save) */
  removeVoiceMemo: (uri: string) => void;
  /** Commit: delete removed voice memos from disk. Call inside your save handler. */
  commitRemovedVoiceMemos: () => void;
  /** Discard: delete all newly-added voice memos from disk, restore originals. */
  discardAllChanges: () => void;
}

export function useVoiceMemoSession(
  initialVoiceMemos: Asset[],
): UseVoiceMemoSessionReturn {
  const { t } = useTranslation();
  const [voiceMemos, setVoiceMemos] = useState<Asset[]>(initialVoiceMemos);

  // URIs that existed at the start of this session — our source of truth for "original vs. new"
  const initialUrisRef = useRef(new Set(initialVoiceMemos.map((m) => m.uri)));

  // Voice memos removed during this session (to be deleted on save, or selectively on discard)
  const removedMemosRef = useRef<Asset[]>([]);

  const handleVoiceMemoSaved = useCallback(
    async (tempUri: string) => {
      try {
        const asset = await saveVoiceMemo(tempUri);
        // Capacity is enforced upstream in handleVoiceMemoRequest before the modal opens
        setVoiceMemos((prev) => [...prev, asset]);
      } catch (error) {
        console.error('Failed to save voice memo:', error);
        toast.error(t('Failed to save voice memo'));
      }
    },
    [t],
  );

  const removeVoiceMemo = useCallback((uri: string) => {
    setVoiceMemos((prev) => {
      const removed = prev.find((m) => m.uri === uri);
      if (removed) {
        removedMemosRef.current.push(removed);
      }
      return prev.filter((m) => m.uri !== uri);
    });
  }, []);

  /**
   * Commit (Save path):
   * Delete only memos created and removed inside this unsaved editor session.
   * Previously persisted memos are retained by the transactional sync ledger.
   */
  const commitRemovedVoiceMemos = useCallback(() => {
    removedMemosRef.current
      .filter((memo) => !initialUrisRef.current.has(memo.uri))
      .forEach((m) => {
      deleteVoiceMemoFile(m.uri);
    });
    removedMemosRef.current = [];
  }, []);

  /**
   * Discard (Cancel path):
   * Clean up ALL files that were created this session — whether they're still
   * visible in the editor or were subsequently removed by the user.
   * Original voice memos are left untouched on disk.
   */
  const discardAllChanges = useCallback(() => {
    const initialUris = initialUrisRef.current;

    // New memos still visible in the editor
    const addedVisible = voiceMemos.filter((m) => !initialUris.has(m.uri));

    // New memos that were added then removed (sitting in the removal queue)
    const addedThenRemoved = removedMemosRef.current.filter(
      (m) => !initialUris.has(m.uri),
    );

    [...addedVisible, ...addedThenRemoved].forEach((m) => {
      deleteVoiceMemoFile(m.uri);
    });
    removedMemosRef.current = [];
  }, [voiceMemos]);

  const voiceMemoUris = useMemo(() => voiceMemos.map((m) => m.uri), [voiceMemos]);

  return {
    voiceMemos,
    voiceMemoUris,
    handleVoiceMemoSaved,
    removeVoiceMemo,
    commitRemovedVoiceMemos,
    discardAllChanges,
  };
}
