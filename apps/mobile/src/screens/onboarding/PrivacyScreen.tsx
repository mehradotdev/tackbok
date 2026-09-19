import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { BarChart3, Code, ExternalLink, EyeOff, X } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { commitPreConsentBuffer, stopPreConsentBuffering } from '~/lib/analytics';
import { ANALYTICS_SOURCE_URL } from '~/lib/analytics/events';
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
      detents={['auto']}
      cornerRadius={sheetRadius}
      grabber={true}
      grabberOptions={{ topMargin: 8, color: mutedFgColor as string, adaptive: false }}
      backgroundColor={backgroundColor as string}>
      <View className="bg-background pb-8 pt-2">
        <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
          <Text className="text-xl font-body-bold text-foreground">
            {t('onboarding.whatWeCollect')}
          </Text>
          <Button
            onPress={() => TrueSheet.dismiss(SHEET_NAMES.ANALYTICS_DETAILS)}
            variant="ghost"
            className="p-1 -mr-2"
            accessibilityLabel={t('common.close')}>
            <Icon as={X} className="text-foreground" />
          </Button>
        </View>

        <View className="px-5">
          <Text className="text-sm text-foreground mb-3">
            {t(
              'onboarding.withYourPermissionTackbokRecordsLimitedAnonymousUsageInformationThis',
            )}
          </Text>

          <Button
            variant="link"
            size="none"
            className="self-start"
            accessibilityLabel={t('onboarding.auditTheAnalyticsCodeOnGithub')}
            onPress={() => void Linking.openURL(ANALYTICS_SOURCE_URL)}>
            <Text className="text-sm text-muted-foreground underline">
              {t('onboarding.auditTheAnalyticsCodeOnGithub')}
            </Text>
            <Icon as={ExternalLink} className="size-4 text-muted-foreground" />
          </Button>

          <Text className="text-base font-body-semibold text-foreground mt-5 mb-1.5">
            {t('onboarding.neverCollected')}
          </Text>
          <Text className="text-sm text-foreground">
            {t('onboarding.yourJournalTextTitlesPhotosVoiceMemosTagsNameEmail')}
          </Text>
        </View>
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
      text: t('onboarding.anonymousUsageStatsOnlyIncludingWhichScreensAndFeaturesGet'),
    },
    {
      icon: EyeOff,
      text: t('onboarding.neverYourJournalContentPhotosVoiceMemosOrAnythingYou'),
    },
    {
      icon: Code,
      text: t('onboarding.openSourceTheExactEventListIsPublicInThe'),
    },
  ];

  return (
    <OnboardingScaffold
      step={4}
      overlays={<AnalyticsDetailsSheet />}
      footer={
        <View className="gap-2">
          <Button variant="primary" size="lg" onPress={handleAccept}>
            <Text className="text-lg">{t('onboarding.shareAnonymousStats')}</Text>
          </Button>
          <Button variant="outline" size="lg" onPress={handleDecline}>
            <Text className="text-lg">{t('onboarding.noThanks')}</Text>
          </Button>
        </View>
      }>
      <View className="pt-10">
        <Text variant="h2" className="text-foreground">
          {t('onboarding.helpImproveTackbok')}
        </Text>
        <Text className="text-base text-muted-foreground mt-2 mb-6">
          {t('onboarding.tackbokIsFreeAndOpenSourceAnonymousStatsHelpUs')}
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
            {t('onboarding.seeExactlyWhatWeCollect')}
          </Text>
        </Button>
      </View>
    </OnboardingScaffold>
  );
}
