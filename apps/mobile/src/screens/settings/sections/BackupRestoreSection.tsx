import { useState, useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Cloud, FileOutput, FileInput } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useCloudSyncSnapshot } from '~/lib/cloudSync/ui';
import { useBackupImportFlow } from '~/hooks/useBackupImportFlow';
import { exportToBackupZip } from '~/lib/backupExport';
import { track } from '~/lib/analytics';
import { Text } from '~/components/ui/text';
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
import { SettingsRow } from '~/components/SettingsRow';
import { SettingsImportModeModal } from '../SettingsImportModeModal';
import { SettingsImportProgressModal } from '../SettingsImportProgressModal';
import { SettingsImportSummaryModal } from '../SettingsImportSummaryModal';

export function BackupRestoreSection() {
  const router = useRouter();
  const { t } = useTranslation();
  const { snapshot } = useCloudSyncSnapshot();
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
      toast.success(t('backup.backupExportedSuccessfully'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('backup.exportFailed');
      toast.error(message);
    }
  }, [t]);

  const handleImportFromPresentlyCSV = useCallback(async () => {
    setShowPresentlyImportConfirmDialog(false);
    await startPresentlyImport();
  }, [startPresentlyImport]);

  return (
    <>
      <SettingsSection title={t('backup.backupRestore')}>
        <SettingsRow
          label={t('cloud.cloudBackupSync')}
          description={
            snapshot.configured
              ? t('cloud.googleDriveStatus', {
                  status:
                    snapshot.status === 'queued'
                      ? t('cloud.safelyQueued')
                      : snapshot.status === 'syncing'
                        ? t('cloud.syncing')
                        : snapshot.status === 'paused'
                          ? t('cloud.syncPaused')
                          : snapshot.status === 'restoring'
                            ? t('cloud.restoring')
                            : snapshot.status === 'warning'
                              ? t('cloud.attentionNeeded')
                              : t('cloud.upToDate'),
                })
              : t('journaling.off')
          }
          icon={Cloud}
          onPress={() => router.push('/cloud-backup' as Href)}
          showChevron
        />
        <SettingsRow
          label={t('backup.exportAsZip')}
          description={t('backup.allOfYourDataInAFormatThatYouCan')}
          icon={FileOutput}
          onPress={handleExportBackup}
          showChevron
        />
        <SettingsRow
          label={t('backup.importAsZip')}
          description={t('backup.restoreYourDataFromAZipFile')}
          icon={FileInput}
          onPress={() => selectImportFile('tackbok')}
          showChevron
        />
        <SettingsRow
          label={t('backup.importFromGratitudeApp')}
          description={t('backup.importDataFromAGratitudeAppZipBackup')}
          icon={GratitudeJournalLogoIcon}
          onPress={() => selectImportFile('gratitudeApp')}
          showChevron
        />
        <SettingsRow
          label={t('backup.importFromPresentlyApp')}
          description={t('backup.restoreYourDataFromAPresentlyCsvFile')}
          icon={PresentlyLogoIcon}
          onPress={() => setShowPresentlyImportConfirmDialog(true)}
          showChevron
          isLast
        />
      </SettingsSection>

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
            <AlertDialogTitle>{t('backup.importFromPresently')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('backup.thisWillImportEntriesFromAPresentlyAppCsvFile')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('common.cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleImportFromPresentlyCSV}>
              <Text>{t('backup.import')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
