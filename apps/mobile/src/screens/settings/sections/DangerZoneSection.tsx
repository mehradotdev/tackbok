import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { DELETE_CONFIRM_DELAY_SECONDS } from '~/constants';
import { QUERY_KEYS } from '~/hooks/useGratitude';
import { deleteAllData } from '~/db/queries';
import { deleteAllPhotos } from '~/lib/photoUtils';
import { deleteAllVoiceMemos } from '~/lib/voiceMemoUtils';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';
import {
  AlertDialog,
  AlertDialogDestructiveAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '../SettingsRow';

export function DangerZoneSection() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const resetSettingsToDefaults = useSettingsStore((state) => state.resetToDefaults);

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  const handleDeleteAllData = useCallback(async () => {
    setShowDeleteConfirmDialog(false);
    try {
      // Wipe the DB first — if this throws, the files are still intact
      // and the catch block will surface the error to the user.
      await deleteAllData();
      // Reset persisted app settings alongside the DB wipe so Delete All Data
      // restores the app to its default state.
      resetSettingsToDefaults();
      // Invalidate and await refetch of all cached queries so the mounted
      // home screen receives empty data from the cleared DB before we navigate
      // back. Using invalidateQueries (not removeQueries) ensures active
      // observers trigger a real refetch; removeQueries only evicts the cache
      // without scheduling a new fetch for already-mounted components.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] }),
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.tags] }),
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.prompts] }),
      ]);
      // DB is gone; now clean up the filesystem directories.
      // Attempt both cleanups regardless of individual failures so that a
      // photos error never silently leaves voice memos on disk (and vice versa).
      const cleanupErrors: string[] = [];
      try {
        deleteAllPhotos();
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
      try {
        deleteAllVoiceMemos();
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
      if (cleanupErrors.length > 0) {
        toast.warning(t('All data deleted, but some media files could not be removed.'), {
          description: cleanupErrors.join('\n'),
          duration: 8000,
        });
      } else {
        toast.success(t('All data deleted'));
      }
      // Navigate to home screen
      router.dismissTo('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Delete failed');
      toast.error(message);
    }
  }, [t, router, queryClient, resetSettingsToDefaults]);

  return (
    <>
      <SettingsSection title={t('Danger Zone')}>
        <SettingsRow
          label={t('Delete All Data')}
          description={t('Permanently delete all your app data')}
          icon={Trash2}
          onPress={() => setShowDeleteConfirmDialog(true)}
          showChevron
          isLast
        />
      </SettingsSection>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete all data?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This action cannot be undone. All your app data will be permanently deleted.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogDestructiveAction
              onPress={handleDeleteAllData}
              delaySeconds={DELETE_CONFIRM_DELAY_SECONDS}>
              <Text>{t('Delete All Data')}</Text>
            </AlertDialogDestructiveAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
