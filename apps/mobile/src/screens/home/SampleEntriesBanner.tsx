import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react-native';
import { QUERY_KEYS } from '~/hooks/useGratitude';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { removeSampleEntries } from '~/lib/sampleEntries';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';

/**
 * Slim banner pinned above the timeline while seeded sample entries exist.
 * "Remove all" deletes the entries, their media files and the sample tags;
 * the X only hides the banner, for users who want to build over the examples.
 */
export function SampleEntriesBanner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const sampleEntryIds = useSettingsStore((s) => s.sampleEntryIds);
  const isDismissed = useSettingsStore((s) => s.sampleEntriesBannerDismissed);
  const setDismissed = useSettingsStore((s) => s.setSampleEntriesBannerDismissed);
  const [isRemoving, setIsRemoving] = useState(false);

  if (sampleEntryIds.length === 0 || isDismissed) return null;

  const handleRemoveAll = async () => {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      await removeSampleEntries();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] }),
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.tags] }),
      ]);
      toast.success(t('Example entries removed'));
    } catch {
      toast.error(t('Failed to remove example entries'));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <View className="mx-4 mt-2 mb-1 flex-row items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
      <View className="flex-row items-center flex-1 mr-2 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 -ml-1"
          onPress={() => setDismissed(true)}
          accessibilityLabel={t('Hide this banner')}
          hitSlop={8}>
          <Icon as={X} className="text-muted-foreground size-4" />
        </Button>
        <Icon as={Sparkles} className="text-muted-foreground size-4" />
        <Text className="text-sm text-muted-foreground flex-1">
          {t('Showing example entries')}
        </Text>
      </View>
      <Button
        variant="secondary"
        size="sm"
        onPress={() => void handleRemoveAll()}
        disabled={isRemoving}>
        <Text className="text-sm">{t('Remove all')}</Text>
      </Button>
    </View>
  );
}
