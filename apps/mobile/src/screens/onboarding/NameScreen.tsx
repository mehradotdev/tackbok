import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { track } from '~/lib/analytics';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { OnboardingScaffold } from './OnboardingScaffold';
import { useOnboardingStepView } from './useOnboardingStepView';

export default function OnboardingNameScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const setProfileName = useSettingsStore((s) => s.setProfileName);
  // Initialize from the store so a restored/re-run flow shows the saved name.
  const [name, setName] = useState(
    () => useSettingsStore.getState().profileName ?? '',
  );

  useOnboardingStepView('name');

  const handleContinue = () => {
    setProfileName(name);
    router.push('/onboarding/theme');
  };

  const handleSkip = () => {
    track('onboarding_skipped', { step: 'name' });
    router.push('/onboarding/theme');
  };

  return (
    <OnboardingScaffold
      step={1}
      onSkip={handleSkip}
      footer={
        <Button variant="primary" size="lg" onPress={handleContinue}>
          <Text className="text-lg">{t('Continue')}</Text>
        </Button>
      }>
      <View className="pt-10">
        <Text variant="h2" className="text-foreground">
          {t('What should we call you?')}
        </Text>
        <Text className="text-base text-muted-foreground mt-2">
          {t('Your name is only used to greet you inside the app.')}
        </Text>

        <Input
          className="mt-8"
          placeholder={t('Your name (optional)')}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />

        <View className="flex-row items-center gap-1.5 mt-4">
          <Icon as={ShieldCheck} className="text-muted-foreground size-4" />
          <Text className="text-sm text-muted-foreground">
            {t('Stays on your device.')}
          </Text>
        </View>
      </View>
    </OnboardingScaffold>
  );
}
