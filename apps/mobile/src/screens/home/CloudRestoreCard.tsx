import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { NetworkStateType, useNetworkState } from 'expo-network';
import { AlertTriangle, CloudOff, Wifi } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import type { TranslationFunction } from '~/lib/i18n/types';
import { useSettingsStore } from '~/lib/settings';
import {
  deriveCloudRestoreMilestone,
  useCloudSyncSnapshot,
  type CloudRestoreMilestone,
} from '~/lib/cloudSync/ui';
import {
  attentionReasonMessage,
  cloudSyncFailureMessage,
} from '~/screens/cloudBackup/copy';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';

/**
 * Shown above the timeline while a restore from Google Drive runs, so people
 * can keep journaling instead of waiting on the setup screen.
 */
export function CloudRestoreCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { snapshot } = useCloudSyncSnapshot();
  const restore = useSettingsStore((s) => s.cloudRestore);
  const setCloudRestore = useSettingsStore((s) => s.setCloudRestore);
  const wifiOnlyMedia = useSettingsStore((s) => s.cloudSyncWifiOnlyMedia);
  const network = useNetworkState();
  // Unknown network state (before the first reading) is not treated as offline.
  const milestone = deriveCloudRestoreMilestone(
    restore,
    snapshot,
    {
      online: network.isConnected !== false && network.isInternetReachable !== false,
      onWifi: network.type === undefined || network.type === NetworkStateType.WIFI,
    },
    wifiOnlyMedia,
  );
  const complete = milestone?.stage === 'complete';

  useEffect(() => {
    if (!complete) return;
    setCloudRestore(null);
    toast.success(t('cloud.restoreComplete'));
  }, [complete, setCloudRestore, t]);

  if (!milestone || milestone.stage === 'complete') return null;
  const { title, detail } = restoreCardCopy(milestone, t);
  const failed = milestone.stage === 'failed';
  const working = milestone.stage === 'journal' || milestone.stage === 'media';

  return (
    <View
      className={
        failed
          ? 'mx-4 mt-2 mb-1 gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3'
          : 'mx-4 mt-2 mb-1 gap-2 rounded-lg border border-border bg-card p-3'
      }
      accessibilityRole={failed ? 'alert' : undefined}>
      <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
        {working ? (
          <ActivityIndicator size="small" colorClassName="accent-primary" />
        ) : (
          <Icon
            as={
              failed
                ? AlertTriangle
                : milestone.stage === 'waiting-for-wifi' ||
                    (milestone.stage === 'paused' && milestone.reason === 'wifi')
                  ? Wifi
                  : CloudOff
            }
            className={failed ? 'text-destructive size-5' : 'text-foreground size-5'}
          />
        )}
        <Text className="flex-1 text-sm font-body-semibold text-foreground">{title}</Text>
      </View>
      {detail && <Text className="text-sm text-foreground">{detail}</Text>}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onPress={() => router.push('/cloud-backup' as Href)}>
        <Text className="text-sm">{t('cloud.viewCloudBackup')}</Text>
      </Button>
    </View>
  );
}

function restoreCardCopy(
  milestone: Exclude<CloudRestoreMilestone, { stage: 'complete' }>,
  t: TranslationFunction,
): { title: string; detail: string | null } {
  const keepUsing = t('cloud.youCanKeepUsingTackbokWhileItRestores');
  switch (milestone.stage) {
    case 'journal':
      return { title: t('cloud.restoringYourJournalFromGoogleDrive'), detail: keepUsing };
    case 'media':
      return {
        title: t('cloud.yourJournalIsReadyDownloadingPhotosAndVoiceNotesProgress', {
          downloaded: milestone.downloaded,
          total: milestone.total,
        }),
        detail: keepUsing,
      };
    case 'waiting-for-wifi':
      return {
        title: t('cloud.photosAndVoiceNotesWaitingForWiFiCount', {
          number: milestone.remaining,
        }),
        detail: keepUsing,
      };
    case 'paused':
      return {
        title:
          milestone.reason === 'sync-paused'
            ? t('cloud.syncPaused')
            : milestone.reason === 'wifi'
              ? cloudSyncFailureMessage('wifi-only-media', t)
              : t('cloud.restorePausedItContinuesWhenTackbokIsOpenAndOnline'),
        detail: keepUsing,
      };
    case 'failed':
      return {
        title: t('cloud.restoreNeedsAttention'),
        detail: milestone.attentionReason
          ? attentionReasonMessage(milestone.attentionReason, t)
          : milestone.failureCategory
            ? cloudSyncFailureMessage(milestone.failureCategory, t)
            : null,
      };
  }
}
