import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { BarChart3, Code, EyeOff, X } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { commitPreConsentBuffer, stopPreConsentBuffering } from '~/lib/analytics';
import { ANALYTICS_EVENT_NAMES } from '~/lib/analytics/events';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { OnboardingScaffold } from './OnboardingScaffold';
import { useOnboardingStepView } from './useOnboardingStepView';

function AnalyticsDetailsSheet() {
  const { t } = useTranslation();
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  return (
    <TrueSheet
      name={SHEET_NAMES.ANALYTICS_DETAILS}
      detents={[0.7, 0.85]}
      cornerRadius={sheetRadius}
      grabber={true}
      grabberOptions={{ topMargin: 8, color: mutedFgColor as string, adaptive: false }}
      scrollable
      backgroundColor={backgroundColor as string}>
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Text className="text-xl font-body-bold text-foreground">
            {t('What we collect')}
          </Text>
          <Button
            onPress={() => TrueSheet.dismiss(SHEET_NAMES.ANALYTICS_DETAILS)}
            variant="ghost"
            className="p-1 -mr-2"
            accessibilityLabel={t('Close')}>
            <Icon as={X} className="text-foreground" />
          </Button>
        </View>

        <ScrollView
          nestedScrollEnabled
          contentContainerClassName="px-5 pb-12"
          showsVerticalScrollIndicator={false}>
          <Text className="text-sm text-muted-foreground mb-3">
            {t(
              'These are the only events Tackbok records — anonymous counters with no content attached. The exact list is public in the open-source code.',
            )}
          </Text>

          <View className="bg-card rounded-lg border border-border px-4 py-3 gap-1.5">
            {ANALYTICS_EVENT_NAMES.map((eventName) => (
              <Text key={eventName} className="text-xs text-foreground font-body-medium">
                {eventName}
              </Text>
            ))}
          </View>

          <Text className="text-base font-body-semibold text-foreground mt-5 mb-1.5">
            {t('Never collected')}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {t(
              'Your journal text, titles, photos, voice memos, tags, name, email, or anything you type. No ads, no selling data, no third-party tracking.',
            )}
          </Text>

          <Text className="text-sm text-muted-foreground mt-4">
            {t(
              'If you opt in, the anonymous steps you took during this setup are included. If you decline, they are discarded and never leave your device.',
            )}
          </Text>
        </ScrollView>
      </View>
    </TrueSheet>
  );
}

export default function OnboardingPrivacyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const setAnalyticsEnabled = useSettingsStore((s) => s.setAnalyticsEnabled);

  useOnboardingStepView('privacy');

  const handleAccept = () => {
    setAnalyticsEnabled(true);
    // Replays the buffered onboarding funnel into the SDK (original timestamps).
    void commitPreConsentBuffer();
    router.push('/onboarding/finish');
  };

  const handleDecline = () => {
    setAnalyticsEnabled(false);
    // Decline clears the RAM buffer immediately — nothing ever leaves the device.
    stopPreConsentBuffering();
    router.push('/onboarding/finish');
  };

  const bullets = [
    {
      icon: BarChart3,
      text: t('Anonymous usage stats only — which screens and features get used.'),
    },
    {
      icon: EyeOff,
      text: t('Never your journal content, photos, voice memos, or anything you type.'),
    },
    {
      icon: Code,
      text: t('Open source — the exact event list is public in the repo.'),
    },
  ];

  return (
    <OnboardingScaffold
      step={4}
      overlays={<AnalyticsDetailsSheet />}
      footer={
        <View className="gap-2">
          <Button variant="primary" size="lg" onPress={handleAccept}>
            <Text className="text-lg">{t('Share anonymous stats')}</Text>
          </Button>
          <Button variant="outline" size="lg" onPress={handleDecline}>
            <Text className="text-lg">{t('No thanks')}</Text>
          </Button>
        </View>
      }>
      <View className="pt-10">
        <Text variant="h2" className="text-foreground">
          {t('Help improve Tackbok?')}
        </Text>
        <Text className="text-base text-muted-foreground mt-2 mb-6">
          {t('Tackbok is free and open source. Anonymous stats help us find bugs and see which features matter.')}
        </Text>

        <View className="gap-4">
          {bullets.map((bullet, index) => (
            <View key={index} className="flex-row items-start gap-3">
              <Icon as={bullet.icon} className="text-foreground size-5 mt-0.5" />
              <Text className="text-base text-foreground flex-1">{bullet.text}</Text>
            </View>
          ))}
        </View>

        <Button
          variant="link"
          className="self-start mt-5 -ml-1"
          onPress={() => TrueSheet.present(SHEET_NAMES.ANALYTICS_DETAILS)}>
          <Text className="text-sm text-muted-foreground underline">
            {t('See exactly what we collect')}
          </Text>
        </Button>
      </View>
    </OnboardingScaffold>
  );
}
