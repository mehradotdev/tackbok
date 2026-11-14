import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import type { Asset, Entry } from '~/types';
import type { OtherVersionGroup } from '~/db/queries';
import { useTranslation } from '~/lib/i18n';
import { track } from '~/lib/analytics';
import { acknowledgeEntryConflicts } from '~/lib/cloudSync/ui';
import {
  useDeleteEntry,
  useOtherVersionGroups,
  useTagMapping,
} from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { toast } from '~/components/ui/toast';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDestructiveAction,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { ImageViewerModal } from '~/components/ImageViewerModal';
import { ThemeBackdrop } from '~/components/backdrops/ThemeBackdrop';
import { OtherVersionGroupCard } from './OtherVersionGroupCard';
import { entriesToDelete, groupMembers } from './keepVersion';

/** Entries that were edited on two devices at once, with both versions kept. */
export default function OtherVersionsScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const tagMap = useTagMapping();
  const { data, isLoading, isError, refetch } = useOtherVersionGroups();
  const groups = data ?? [];
  const deleteEntryMutation = useDeleteEntry();
  // The entry to keep and the entries the confirmation names for deletion.
  const [pendingKeep, setPendingKeep] = useState<{
    keepId: string;
    deleteIds: string[];
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [viewerPhotos, setViewerPhotos] = useState<Asset[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);

  const handlePhotoPress = (photos: Asset[], index: number) => {
    setViewerPhotos(photos);
    setViewerIndex(index);
    setIsViewerVisible(true);
  };

  const handleEntryPress = (entry: Entry) => {
    router.push({
      pathname: '/gratitudeEntry/[noteId]',
      params: { noteId: entry.note_id },
    });
  };

  const handleKeepPress = (group: OtherVersionGroup, entry: Entry) => {
    setPendingKeep({
      keepId: entry.note_id,
      deleteIds: groupMembers(group)
        .map((member) => member.note_id)
        .filter((id) => id !== entry.note_id),
    });
  };

  // Deletes through the same path as deleting an entry from its own screen,
  // so the deletes sync and their media is retained the same way.
  const handleKeepConfirm = async () => {
    if (!pendingKeep || isDeleting) return;
    const { keepId, deleteIds } = pendingKeep;
    const ids = entriesToDelete(groups, keepId, deleteIds);
    setIsDeleting(true);
    try {
      for (const id of ids) {
        await deleteEntryMutation.mutateAsync(id);
        track('entry_deleted');
      }
    } catch (error) {
      console.error('Failed to delete entry', error);
      toast.error(t('mood.failedToDeleteEntry'));
      return;
    } finally {
      setIsDeleting(false);
      setPendingKeep(null);
    }
    // The choice is made, so the conflicts about these entries are handled.
    // Best effort: the deletes already happened, and the card still offers them.
    acknowledgeEntryConflicts([keepId, ...ids]).catch((error: unknown) =>
      console.error('Failed to dismiss entry conflicts', error),
    );
  };

  const pendingCount = pendingKeep?.deleteIds.length ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ThemeBackdrop />
      <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border">
        <Button
          onPress={() => router.back()}
          variant="ghost"
          className="p-1"
          accessibilityLabel={t('common.back')}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text
          variant="h2"
          numberOfLines={2}
          adjustsFontSizeToFit
          className="flex-1 text-foreground font-heading">
          {t('cloud.conflicts.otherVersionsTitle')}
        </Text>
      </View>

      {isLoading ? null : isError ? (
        <View className="flex-1 items-center justify-center gap-4 px-4">
          <Text className="text-muted-foreground text-center">
            {t('cloud.conflicts.otherVersionsLoadFailed')}
          </Text>
          <Button variant="outline" onPress={() => void refetch()}>
            <Text>{t('common.retry')}</Text>
          </Button>
        </View>
      ) : groups.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-muted-foreground text-center">
            {t('cloud.conflicts.noOtherVersions')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => groupMembers(item)[0].note_id}
          ListHeaderComponent={
            <Text className="text-sm text-muted-foreground px-safe-or-3 py-3">
              {t('cloud.conflicts.otherVersionsDescription')}
            </Text>
          }
          renderItem={({ item }) => (
            <OtherVersionGroupCard
              group={item}
              tagMap={tagMap}
              onEntryPress={handleEntryPress}
              onPhotoPress={handlePhotoPress}
              onKeep={(entry) => handleKeepPress(item, entry)}
              disabled={isDeleting}
            />
          )}
          contentContainerClassName="pb-safe-or-4"
        />
      )}

      <AlertDialog
        open={pendingKeep !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingKeep(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cloud.conflicts.keepThisOneTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cloud.conflicts.keepThisOneMessage', { count: pendingCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} onPress={() => setPendingKeep(null)}>
              <Text>{t('common.cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogDestructiveAction
              disabled={isDeleting}
              onPress={() => void handleKeepConfirm()}>
              <Text>{t('common.delete')}</Text>
            </AlertDialogDestructiveAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImageViewerModal
        visible={isViewerVisible}
        initialIndex={viewerIndex}
        photos={viewerPhotos}
        onClose={() => setIsViewerVisible(false)}
      />
    </SafeAreaView>
  );
}
