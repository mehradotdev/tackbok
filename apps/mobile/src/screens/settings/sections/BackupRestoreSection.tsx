import { useState, useCallback } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CloudUpload,
  RefreshCw,
  FileOutput,
  FileInput,
  Upload,
} from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  exportToCSV,
  pickCSVFile,
  importFromCSV,
  importFromPresentlyCSV,
} from '~/lib/backup';
import { Text } from '~/components/ui/text';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/components/ui/toast';
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
  const [showImportConfirmDialog, setShowImportConfirmDialog] = useState(false);
  const [showPresentlyImportConfirmDialog, setShowPresentlyImportConfirmDialog] =
    useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Export to Tackbok CSV handler
  const handleExportToCSV = useCallback(async () => {
    try {
      await exportToCSV();
      toast.success(t('Entries exported successfully'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Export failed');
      toast.error(message);
    }
  }, [t]);

  // Shared import handler — parameterized by dialog dismissal and import function
  const handleImport = useCallback(
    async (dismissDialog: () => void, importFn: (uri: string) => Promise<number>) => {
      dismissDialog();
      try {
        const result = await pickCSVFile();
        if (!result) return; // User cancelled

        const asset = result.assets?.[0];
        if (!asset?.uri) throw new Error(t('Import failed'));

        setIsImporting(true);
        const count = await importFn(asset.uri);
        try {
          await queryClient.invalidateQueries();
        } catch (error) {
          console.error('Failed to invalidate queries:', error);
        }
        setIsImporting(false);

        const message =
          count === 1
            ? t('importedCountSingular', { count })
            : t('importedCount', { count });
        toast.success(message);

        // Navigate to home screen
        router.replace('/');
      } catch (error) {
        setIsImporting(false);
        const message = error instanceof Error ? error.message : t('Import failed');
        toast.error(message);
      }
    },
    [t, router, queryClient],
  );

  const handleImportFromCSV = useCallback(
    () => handleImport(() => setShowImportConfirmDialog(false), importFromCSV),
    [handleImport],
  );

  const handleImportFromPresentlyCSV = useCallback(
    () =>
      handleImport(
        () => setShowPresentlyImportConfirmDialog(false),
        importFromPresentlyCSV,
      ),
    [handleImport],
  );

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
          label={t('Export to CSV')}
          description={t('Full backup of entries and tags')}
          icon={FileOutput}
          onPress={handleExportToCSV}
          showChevron
        />
        <SettingsRow
          label={t('Import Entries from CSV')}
          description={t('Restore from a Tackbok backup file')}
          icon={FileInput}
          onPress={() => setShowImportConfirmDialog(true)}
          showChevron
        />
        <SettingsRow
          label={t('Import from Presently App')}
          description={t('Import entries from a Presently CSV export')}
          icon={Upload}
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

      {/* Import Confirmation Dialog */}
      <AlertDialog
        open={showImportConfirmDialog}
        onOpenChange={setShowImportConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure you want to import?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This will import entries from a Tackbok backup file. Duplicate entries will be skipped.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleImportFromCSV}>
              <Text>{t('Import')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Import Loading Overlay */}
      {/* TODO: Fix Importing Overlay use React Native Modal */}
      {isImporting && (
        <View className="absolute inset-0 bg-background/80 items-center justify-center z-50">
          <View className="bg-card p-6 rounded-2xl items-center shadow-lg">
            <ActivityIndicator size="large" className="mb-4" />
            <Text className="text-foreground text-base font-body-medium">
              {t('Importing entries...')}
            </Text>
          </View>
        </View>
      )}
    </>
  );
}
