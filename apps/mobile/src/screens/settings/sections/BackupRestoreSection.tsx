import { useState, useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CloudUpload, RefreshCw, FileOutput, FileInput } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { useBackupImportFlow } from '~/hooks/useBackupImportFlow';
import { exportToBackupZip } from '~/lib/backupExport';
import { track } from '~/lib/analytics';
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

export function BackupRestoreSection() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    googleDriveBackupEnabled,
    setGoogleDriveBackupEnabled,
    backupFrequency,
    setBackupFrequency,
  } = useSettingsStore();

  const [showBackupFrequencyModal, setShowBackupFrequencyModal] = useState(false);
  const [showPresentlyImportConfirmDialog, setShowPresentlyImportConfirmDialog] =
    useState(false);

  const handleImportDone = useCallback(() => {
    // Settings is pushed on top of home. dismissTo('/') returns to that existing
    // home screen instead of replacing settings with a second '/' route.
    router.dismissTo('/');
  }, [router]);

  const {
    importProgress,
    importSummary,
    pendingImportSelection,
    selectImportFile,
    runPendingImport,
    startPresentlyImport,
    clearPendingImport,
    closeImportSummary,
  } = useBackupImportFlow(handleImportDone);

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

  const handleImportFromPresentlyCSV = useCallback(async () => {
    setShowPresentlyImportConfirmDialog(false);
    await startPresentlyImport();
  }, [startPresentlyImport]);

  const getBackupFrequencyLabel = () => {
    const labels: Record<string, string> = {
      daily: t('Daily'),
      weekly: t('Weekly'),
      on_change: t('On Every Change'),
    };
    return labels[backupFrequency] ?? t('Daily');
  };

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
          onPress={() => selectImportFile('tackbok')}
          showChevron
        />
        <SettingsRow
          label={t('Import from Gratitude App')}
          description={t('Import data from a Gratitude App .zip backup')}
          icon={GratitudeJournalLogoIcon}
          onPress={() => selectImportFile('gratitudeApp')}
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
        onClose={clearPendingImport}
        onSelectMode={runPendingImport}
      />

      <SettingsImportProgressModal
        visible={importProgress !== null}
        progress={importProgress}
      />

      <SettingsImportSummaryModal
        visible={importSummary !== null}
        source={importSummary?.source ?? null}
        summary={importSummary?.summary ?? null}
        onDone={closeImportSummary}
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
