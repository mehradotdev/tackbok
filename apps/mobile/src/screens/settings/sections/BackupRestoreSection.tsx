import { useState, useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CloudUpload, RefreshCw, FileOutput, FileInput } from 'lucide-react-native';
import { QUERY_KEYS } from '~/hooks/useGratitude';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
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
import { exportToBackupZip } from '~/lib/backupExport';
import { track, toCountBucket } from '~/lib/analytics';
import { Text } from '~/components/ui/text';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/components/ui/toast';
import {
  GratitudeJournalLogoIcon,
  PresentlyLogoIcon,
} from '~/components/ImportSourceIcons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '../SettingsRow';
import { SettingsBackupFrequencyModal } from '../SettingsBackupFrequencyModal';
import { SettingsImportModeModal } from '../SettingsImportModeModal';
import { SettingsImportProgressModal } from '../SettingsImportProgressModal';
import { SettingsImportSummaryModal } from '../SettingsImportSummaryModal';

type PendingImportSelection = {
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

export function BackupRestoreSection() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    googleDriveBackupEnabled,
    setGoogleDriveBackupEnabled,
    backupFrequency,
    setBackupFrequency,
  } = useSettingsStore();

  const [showBackupFrequencyModal, setShowBackupFrequencyModal] = useState(false);
  const [showPresentlyImportConfirmDialog, setShowPresentlyImportConfirmDialog] =
    useState(false);
  const [importProgress, setImportProgress] = useState<BackupImportProgress | null>(null);
  const [importSummary, setImportSummary] = useState<{
    source: BackupImportSource;
    summary: BackupImportSummary;
  } | null>(null);
  const [pendingImportSelection, setPendingImportSelection] =
    useState<PendingImportSelection | null>(null);

  const handleExportBackup = useCallback(async () => {
    try {
      await exportToBackupZip();
      track('backup_exported');
      toast.success(t('Backup exported successfully'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Export failed');
      toast.error(message);
    }
  }, [t]);

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

  const handleSelectImportFile = useCallback(
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

  const handleRunPendingImport = useCallback(
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

  const handleImportFromPresentlyCSV = useCallback(async () => {
    setShowPresentlyImportConfirmDialog(false);

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

  const getBackupFrequencyLabel = () => {
    const labels: Record<string, string> = {
      daily: t('Daily'),
      weekly: t('Weekly'),
      on_change: t('On Every Change'),
    };
    return labels[backupFrequency] ?? t('Daily');
  };

  const handleCloseImportSummary = useCallback(() => {
    setImportSummary(null);
    // Settings is pushed on top of home. dismissTo('/') returns to that existing
    // home screen instead of replacing settings with a second '/' route.
    router.dismissTo('/');
  }, [router]);

  return (
    <>
      <SettingsSection title={t('Backup & Restore')}>
        <SettingsRow
          label={t('Google Drive Backup')}
          description={t('Automatically back up your entries with Google Drive')}
          icon={CloudUpload}
          onPress={() => setGoogleDriveBackupEnabled(!googleDriveBackupEnabled)}
          disabled
          rightElement={
            <View pointerEvents="none">
              <Switch checked={googleDriveBackupEnabled} />
            </View>
          }
        />
        <SettingsRow
          label={t('Backup Frequency')}
          description={getBackupFrequencyLabel()}
          icon={RefreshCw}
          onPress={() => setShowBackupFrequencyModal(true)}
          showChevron
          disabled={!googleDriveBackupEnabled}
        />
        <SettingsRow
          label={t('Export as .ZIP')}
          description={t(
            'All of your data in a format that you can restore in the app later',
          )}
          icon={FileOutput}
          onPress={handleExportBackup}
          showChevron
        />
        <SettingsRow
          label={t('Import as .ZIP')}
          description={t('Restore your data from a .zip file')}
          icon={FileInput}
          onPress={() => handleSelectImportFile('tackbok')}
          showChevron
        />
        <SettingsRow
          label={t('Import from Gratitude App')}
          description={t('Import data from a Gratitude App .zip backup')}
          icon={GratitudeJournalLogoIcon}
          onPress={() => handleSelectImportFile('gratitudeApp')}
          showChevron
        />
        <SettingsRow
          label={t('Import from Presently App')}
          description={t('Restore your data from a Presently .csv file')}
          icon={PresentlyLogoIcon}
          onPress={() => setShowPresentlyImportConfirmDialog(true)}
          showChevron
          isLast
        />
      </SettingsSection>

      <SettingsBackupFrequencyModal
        visible={showBackupFrequencyModal}
        onClose={() => setShowBackupFrequencyModal(false)}
        value={backupFrequency}
        onValueChange={setBackupFrequency}
      />

      <SettingsImportModeModal
        visible={pendingImportSelection !== null}
        onClose={() => setPendingImportSelection(null)}
        onSelectMode={handleRunPendingImport}
      />

      <SettingsImportProgressModal
        visible={importProgress !== null}
        progress={importProgress}
      />

      <SettingsImportSummaryModal
        visible={importSummary !== null}
        source={importSummary?.source ?? null}
        summary={importSummary?.summary ?? null}
        onDone={handleCloseImportSummary}
      />

      {/* Presently Import Confirmation Dialog */}
      <AlertDialog
        open={showPresentlyImportConfirmDialog}
        onOpenChange={setShowPresentlyImportConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Import from Presently?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleImportFromPresentlyCSV}>
              <Text>{t('Import')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
