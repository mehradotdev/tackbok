import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { FileClock } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useCloudSyncSnapshot } from '~/lib/cloudSync/ui';
import {
  activeConflictItems,
  useCloudConflictItems,
} from '~/screens/cloudBackup/useCloudConflictItems';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

/**
 * Shown above the timeline while the Cloud backup conflicts card has something
 * to show. It has no close button: it goes away once each conflict there is
 * handled, which takes one tap each.
 */
export function ConflictNoticeCard() {
  const { snapshot } = useCloudSyncSnapshot();
  // The count includes records with nothing to act on, so it only gates the load.
  if (snapshot.conflictCount === 0) return null;
  return <ConflictNotice refreshToken={snapshot} />;
}

function ConflictNotice({ refreshToken }: { refreshToken: unknown }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { items, loadFailed } = useCloudConflictItems(refreshToken);
  // A failed load still shows the notice: the card there offers a retry.
  if (!loadFailed && activeConflictItems(items).length === 0) return null;

  return (
    <View className="mx-4 mt-2 mb-1 gap-2 rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
        <Icon as={FileClock} className="text-foreground size-5" />
        <Text className="flex-1 text-sm font-body-semibold text-foreground">
          {t('cloud.conflicts.title')}
        </Text>
      </View>
      <Text className="text-sm text-foreground">{t('cloud.conflicts.homeNotice')}</Text>
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
