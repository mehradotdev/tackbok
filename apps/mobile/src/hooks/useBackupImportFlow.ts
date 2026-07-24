import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '~/hooks/useGratitude';
import { useTranslation } from '~/lib/i18n';
import {
  createBackupImportProgress,
  createSummaryProgressMetrics,
  getImportPhaseOrder,
  importFromGratitudeAppBackup,
  importFromPresentlyCSV,
  importFromTackbokBackup,
  pickPresentlyImportFile,
  pickZipImportFile,
  type BackupImportPhaseBySource,
  type BackupImportProgress,
  type BackupImportProgressMetrics,
  type BackupImportSource,
  type BackupImportSummary,
  type ImportMode,
} from '~/lib/backupImport';
import { track, toCountBucket } from '~/lib/analytics';
import { toast } from '~/components/ui/toast';

export type PendingImportSelection = {
  source: 'tackbok' | 'gratitudeApp';
  uri: string;
};

function createImportProgressForSource<TSource extends BackupImportSource>(
  source: TSource,
  phase: BackupImportPhaseBySource[TSource],
  phaseProgress: number,
  partial?: Partial<BackupImportProgressMetrics>,
): BackupImportProgress<TSource> {
  return createBackupImportProgress(
    source,
    phase,
    phaseProgress,
    partial,
    getImportPhaseOrder(source),
  );
}

/**
 * Backup-import orchestration shared by Settings (Backup & Restore section)
 * and the onboarding Welcome screen. Owns picker → mode → progress → summary
 * state; the caller renders the matching modals and decides what happens
 * after the summary is dismissed via `onImportDone`.
 */
export function useBackupImportFlow(
  onImportDone: (source: BackupImportSource, summary: BackupImportSummary) => void,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [importProgress, setImportProgress] = useState<BackupImportProgress | null>(null);
  const [importSummary, setImportSummary] = useState<{
    source: BackupImportSource;
    summary: BackupImportSummary;
  } | null>(null);
  const [pendingImportSelection, setPendingImportSelection] =
    useState<PendingImportSelection | null>(null);

  const finishImport = useCallback(
    async (source: BackupImportSource, summary: BackupImportSummary) => {
      setImportProgress(
        createImportProgressForSource(
          source,
          'finishing',
          0.9,
          createSummaryProgressMetrics(summary),
        ),
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] }),
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.tags] }),
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.prompts] }),
      ]);

      setImportProgress(null);
      setImportSummary({ source, summary });
      track('import_completed', {
        source,
        entry_bucket: toCountBucket(summary.importedEntries + summary.updatedEntries),
      });
    },
    [queryClient],
  );

  const runImportFlow = useCallback(
    async (
      source: BackupImportSource,
      executeImport: (
        onProgress: (progress: BackupImportProgress) => void,
      ) => Promise<BackupImportSummary>,
      initialProgress?: BackupImportProgress,
    ) => {
      setImportSummary(null);
      if (initialProgress) {
        setImportProgress(initialProgress);
      }

      try {
        const summary = await executeImport((progress) => {
          setImportProgress(progress);
        });
        await finishImport(source, summary);
      } catch (error) {
        setImportProgress(null);
        const message = error instanceof Error ? error.message : t('Import failed');
        toast.error(message);
      }
    },
    [finishImport, t],
  );

  /** Open the zip picker for a Tackbok/Gratitude App import; the mode modal follows. */
  const selectImportFile = useCallback(
    async (source: PendingImportSelection['source']) => {
      try {
        const result = await pickZipImportFile();
        if (!result) return;

        const asset = result.assets?.[0];
        if (!asset?.uri) {
          throw new Error(t('Import failed'));
        }

        setPendingImportSelection({ source, uri: asset.uri });
      } catch (error) {
        const message = error instanceof Error ? error.message : t('Import failed');
        toast.error(message);
      }
    },
    [t],
  );

  /** Run the pending zip import with the mode the user picked in the mode modal. */
  const runPendingImport = useCallback(
    async (mode: ImportMode) => {
      const selection = pendingImportSelection;
      if (!selection) return;

      const source = selection.source;
      setPendingImportSelection(null);
      const runImport =
        source === 'tackbok' ? importFromTackbokBackup : importFromGratitudeAppBackup;

      await runImportFlow(
        source,
        (onProgress) => runImport(selection.uri, mode, onProgress),
        createImportProgressForSource(source, 'reading', 0.05),
      );
    },
    [pendingImportSelection, runImportFlow],
  );

  /** Open the CSV picker and run a Presently import (no mode modal). */
  const startPresentlyImport = useCallback(async () => {
    try {
      const result = await pickPresentlyImportFile();
      if (!result) return;

      const assetUri = result.assets?.[0]?.uri;
      if (!assetUri) {
        throw new Error(t('Import failed'));
      }

      await runImportFlow('presently', (onProgress) =>
        importFromPresentlyCSV(assetUri, onProgress),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Import failed');
      toast.error(message);
    }
  }, [runImportFlow, t]);

  const clearPendingImport = useCallback(() => setPendingImportSelection(null), []);

  const closeImportSummary = useCallback(() => {
    const done = importSummary;
    setImportSummary(null);
    if (done) onImportDone(done.source, done.summary);
  }, [importSummary, onImportDone]);

  return {
    importProgress,
    importSummary,
    pendingImportSelection,
    selectImportFile,
    runPendingImport,
    startPresentlyImport,
    clearPendingImport,
    closeImportSummary,
  };
}
