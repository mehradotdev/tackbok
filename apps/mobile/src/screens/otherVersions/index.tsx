import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import type { Asset, Entry } from '~/types';
import type { OtherVersionGroup } from '~/db/queries';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { keepEntryVersion, parseVersionCopyId } from '~/lib/cloudSync/ui/versions';
import { isOpenGroup } from '~/lib/otherVersionGroups';
import { QUERY_KEYS, useOtherVersionGroups, useTagMapping } from '~/hooks/useGratitude';
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
import { groupMembers, keepMessage } from './keepVersion';

/**
 * Entries that were edited on two devices at once, with both versions kept.
 * Lists only groups with a choice to make; `focus` (an entry ID) puts that
 * entry's group first.
 */
export default function OtherVersionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string | string[] }>();
  // A repeated query parameter arrives as a list; use the first.
  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const { t, isRTL } = useTranslation();
  const tagMap = useTagMapping();
  const { data, isLoading, isError, refetch } = useOtherVersionGroups();
  // A version left on its own has nothing to choose between (see `isOpenGroup`).
  const groups = focusFirst((data ?? []).filter(isOpenGroup), focus);
  const focusedKey =
    focus && groups[0] && hasMember(groups[0], focus) ? groupKey(groups[0]) : null;
  // Once a choice was listed here, an empty list means every choice is made.
  const [hadGroups, setHadGroups] = useState(false);
  if (groups.length > 0 && !hadGroups) setHadGroups(true);
  const allDone = !isLoading && !isError && groups.length === 0 && hadGroups;
  const queryClient = useQueryClient();
  // The entry to keep and the entries the confirmation names for deletion.
  const [pendingKeep, setPendingKeep] = useState<{
    keepId: string;
    others: Entry[];
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Set synchronously, so a second tap before the re-render deletes nothing.
  const deletingRef = useRef(false);

  const [viewerPhotos, setViewerPhotos] = useState<Asset[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);

  // The versions are in front of the user now, so the Home notice about these
  // entry conflicts is no longer news on this device.
  useEffect(() => {
    useSettingsStore.getState().markOtherVersionsSeen(Date.now());
  }, []);

  // Screen readers stay where the confirmation was, so say it once each time
  // the list empties. Queued, so focus moving after the dialog does not cut it off.
  // Re-armed only by a new choice, not by a failed refetch in between.
  const announcedRef = useRef(false);
  const hasGroups = groups.length > 0;
  useEffect(() => {
    if (hasGroups) announcedRef.current = false;
    if (!allDone || announcedRef.current) return;
    announcedRef.current = true;
    AccessibilityInfo.announceForAccessibilityWithOptions(t('cloud.conflicts.allDone'), {
      queue: true,
    });
  }, [allDone, hasGroups, t]);

  const handlePhotoPress = (photos: Asset[], index: number) => {
    setViewerPhotos(photos);
    setViewerIndex(index);
    setIsViewerVisible(true);
  };

  const handleEntryPress = (entry: Entry) => {
    // A version is shown as a copy of its entry: open the entry itself.
    const noteId = parseVersionCopyId(entry.note_id)?.entryId ?? entry.note_id;
    router.push({ pathname: '/gratitudeEntry/[noteId]', params: { noteId } });
  };

  const handleKeepPress = (group: OtherVersionGroup, entry: Entry) => {
    setPendingKeep({
      keepId: entry.note_id,
      others: groupMembers(group).filter((member) => member.note_id !== entry.note_id),
    });
  };

  // One new write of the chosen value (cloud sync v2): the other versions of
  // that field go everywhere once it syncs. Two devices keeping different
  // versions at once leave both open, so nothing is lost.
  const handleKeepConfirm = async () => {
    if (!pendingKeep || deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    let kept = true;
    try {
      await keepEntryVersion(pendingKeep.keepId);
    } catch (error) {
      console.error('Failed to keep a version', error);
      kept = false;
    }
    await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] });
    await refetch();
    deletingRef.current = false;
    setIsDeleting(false);
    setPendingKeep(null);
    if (!kept) toast.error(t('mood.failedToSaveEntry'));
  };

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
            {allDone
              ? t('cloud.conflicts.allDone')
              : t('cloud.conflicts.noOtherVersions')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={groupKey}
          ListHeaderComponent={
            <Text className="text-sm text-muted-foreground px-3 py-3">
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
              highlighted={groupKey(item) === focusedKey}
            />
          )}
          contentContainerClassName="pb-safe-or-4"
        />
      )}

      <AlertDialog
        open={pendingKeep !== null}
        // The confirm button closes the dialog before its onPress runs, so the
        // delete works from the closure and `deletingRef` guards repeat taps.
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingKeep(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cloud.conflicts.keepThisOneTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingKeep ? keepMessage(t, pendingKeep.others) : null}
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

const groupKey = (group: OtherVersionGroup) => groupMembers(group)[0].note_id;

const hasMember = (group: OtherVersionGroup, entryId: string) =>
  groupMembers(group).some((member) => member.note_id === entryId);

/**
 * Puts the group with `entryId` first, so the screen opens at the entry the
 * user came from; the rest keep their order.
 */
function focusFirst(groups: OtherVersionGroup[], entryId: string | undefined) {
  const index = entryId ? groups.findIndex((group) => hasMember(group, entryId)) : -1;
  if (index <= 0) return groups;
  return [groups[index], ...groups.slice(0, index), ...groups.slice(index + 1)];
}
