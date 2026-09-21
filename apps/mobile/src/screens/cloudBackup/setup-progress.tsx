import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '~/components/ui/text';
import { useTranslation } from '~/lib/i18n';
import type { CloudSyncSnapshot } from '~/lib/cloudSync/ui';
import { attentionReasonMessage, syncPhaseLabel } from './copy';

export function SetupProgress({
  snapshot,
}: {
  snapshot: Pick<
    CloudSyncSnapshot,
    'configured' | 'activityPhase' | 'initialRestore' | 'attentionReason'
  >;
}) {
  const { t } = useTranslation();
  const [startedAt] = useState(Date.now);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const label = snapshot.attentionReason
    ? attentionReasonMessage(snapshot.attentionReason, t)
    : snapshot.activityPhase
      ? syncPhaseLabel(snapshot.activityPhase, snapshot.initialRestore, t)
      : snapshot.configured && snapshot.initialRestore
        ? t('cloud.restoring')
        : t('cloud.settingUpCloudSync');

  return (
    <View className="gap-3 rounded-xl bg-primary/10 p-4">
      <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
        {!snapshot.attentionReason && (
          <ActivityIndicator colorClassName="accent-primary" />
        )}
        <Text className="flex-1 font-body-semibold text-foreground">{label}</Text>
      </View>
      <Text className="text-sm text-foreground">
        {t('cloud.setupElapsedSeconds', { seconds: elapsedSeconds })}
      </Text>
      <Text className="text-sm text-foreground">{t('cloud.setupProgressHelp')}</Text>
      {elapsedSeconds >= 90 && !snapshot.attentionReason && (
        <Text className="text-sm text-foreground" accessibilityLiveRegion="polite">
          {t('cloud.setupTakingLonger')}
        </Text>
      )}
    </View>
  );
}
