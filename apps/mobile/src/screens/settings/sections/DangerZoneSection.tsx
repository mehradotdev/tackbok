import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { DELETE_CONFIRM_DELAY_SECONDS } from '~/constants';
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
  const resetCustomWorksheetTemplate = useSettingsStore(
    (state) => state.resetCustomWorksheetTemplate,
  );

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  const handleDeleteAllData = useCallback(async () => {
    setShowDeleteConfirmDialog(false);
    try {
      // Wipe the DB first — if this throws, the files are still intact
      // and the catch block will surface the error to the user.
      await deleteAllData();
      // Clear persisted journaling text alongside the DB wipe so "Delete All
      // Data" removes user-authored worksheet content too.
      resetCustomWorksheetTemplate();
      // Remove all cached queries immediately after the DB wipe so React
      // Query never serves entries that no longer exist, even if filesystem
      // cleanup below throws. invalidateQueries() only marks stale — deleted
      // data would remain visible until a background refetch completes.
      // removeQueries() evicts the cache entirely.
      try {
        queryClient.removeQueries();
      } catch (error) {
        console.error('Failed to remove queries:', error);
      }
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
        throw new Error(cleanupErrors.join('\n'));
      }
      toast.success(t('All data deleted'));
      // Navigate to home screen
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Delete failed');
      toast.error(message);
    }
  }, [t, router, queryClient, resetCustomWorksheetTemplate]);

  return (
    <>
      <SettingsSection title={t('Danger Zone')}>
        <SettingsRow
          label={t('Delete All Data')}
          description={t(
            'Permanently delete all your entries, photos, voice memos, custom prompts, and custom worksheet template',
          )}
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
                'This action cannot be undone. All your entries, photos, voice memos, custom prompts, and custom worksheet template will be permanently deleted.',
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
