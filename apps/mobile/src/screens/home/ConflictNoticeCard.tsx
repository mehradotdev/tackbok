import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { FileClock, X } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { hideConflictNotice, useCloudSyncSnapshot } from '~/lib/cloudSync/ui';
import { useCloudConflictItems } from '~/screens/cloudBackup/useCloudConflictItems';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';
import { conflictNotice } from './conflictNotice';

/**
 * News about conflicts from sync, shown above the timeline. With only entry
 * conflicts open it opens Other versions; otherwise Cloud backup. The close
 * button hides it on every device until a newer version arrives from another
 * device; it does not resolve anything, so the Cloud backup card and Other
 * versions row stay.
 */
export function ConflictNoticeCard() {
  const { snapshot } = useCloudSyncSnapshot();
  // The count includes records with nothing to act on, so it only gates the load.
  if (snapshot.conflictCount === 0) return null;
  return <ConflictNotice refreshToken={snapshot} />;
}

/**
 * The close button on a notice shown because the choices could not be loaded:
 * there is nothing to record as seen, so it stays hidden until the app restarts.
 */
let failedLoadHidden = false;

function ConflictNotice({ refreshToken }: { refreshToken: unknown }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { items, loadFailed, refresh } = useCloudConflictItems(refreshToken);
  const [hiddenFailure, setHiddenFailure] = useState(failedLoadHidden);
  const [hiding, setHiding] = useState(false);
  const notice = loadFailed && hiddenFailure ? null : conflictNotice(items, loadFailed);
  const visible = notice !== null;
  const announcedRef = useRef(false);
  const message =
    notice?.route === 'other-versions'
      ? t('cloud.conflicts.homeNoticeEntries', { count: notice.entryCount })
      : t('cloud.conflicts.homeNotice');

  // Android reads the title through the live region; iOS has none, so announce
  // once each time the notice appears, not on every snapshot refresh.
  useEffect(() => {
    if (!visible) {
      announcedRef.current = false;
      return;
    }
    if (announcedRef.current) return;
    announcedRef.current = true;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [visible, message]);

  if (!notice) return null;

  const toOtherVersions = notice.route === 'other-versions';
  return (
    <View className="mx-4 mt-2 mb-1 gap-2 rounded-lg border border-border bg-card p-3">
      {/* The row is 44pt tall: hitSlop never reaches past the parent row. */}
      <View className="min-h-11 flex-row items-center gap-3">
        <View
          className="flex-1 flex-row items-center gap-3"
          accessibilityLiveRegion="polite">
          <Icon as={FileClock} className="text-foreground size-5" />
          <Text className="flex-1 text-sm font-body-semibold text-foreground">
            {t('cloud.conflicts.title')}
          </Text>
        </View>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 -me-1"
          disabled={hiding}
          onPress={() => {
            if (loadFailed) {
              failedLoadHidden = true;
              setHiddenFailure(true);
              return;
            }
            setHiding(true);
            hideConflictNotice(items)
              .catch(() => toast.error(t('cloud.cloudBackupCouldNotBeUpdated')))
              .finally(() => {
                setHiding(false);
                void refresh();
              });
          }}
          accessibilityLabel={t('cloud.conflicts.hideNotice')}
          accessibilityHint={t('cloud.conflicts.hideNoticeHint')}
          hitSlop={8}>
          <Icon as={X} className="text-muted-foreground size-4" />
        </Button>
      </View>
      <Text className="text-sm text-foreground">{message}</Text>
      <Button
        variant="outline"
        size="sm"
        className="h-auto min-h-10 max-w-full self-start py-2"
        onPress={() =>
          router.push((toOtherVersions ? '/other-versions' : '/cloud-backup') as Href)
        }>
        <Text className="shrink text-center text-sm">
          {toOtherVersions
            ? t('cloud.conflicts.compareVersions')
            : t('cloud.viewCloudBackup')}
        </Text>
      </Button>
    </View>
  );
}
