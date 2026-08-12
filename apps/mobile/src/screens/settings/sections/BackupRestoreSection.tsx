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

  return (
    <>
      <SettingsSection title={t('Backup & Restore')}>
        <SettingsRow
          label={t('Cloud Backup & Sync')}
          description={
            snapshot.configured
              ? t('Google Drive — {status}', {
                  status:
                    snapshot.status === 'queued'
                      ? t('Safely queued')
                      : snapshot.status === 'syncing'
                        ? t('Syncing…')
                        : snapshot.status === 'paused'
                          ? t('Sync paused')
                          : snapshot.status === 'restoring'
                            ? t('Restoring…')
                            : t('Up to date'),
                })
              : t('Off')
          }
          icon={Cloud}
          onPress={() => router.push('/cloud-backup' as Href)}
          showChevron
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
