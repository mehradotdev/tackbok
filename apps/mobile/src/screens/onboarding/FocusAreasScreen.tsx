import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, Plus } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { track } from '~/lib/analytics';
import {
  BUILT_IN_JOURNAL_PROMPT_CATEGORIES,
  type BuiltInJournalPromptCategoryId,
} from '~/lib/journalPrompts';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { OnboardingScaffold } from './OnboardingScaffold';
import { useOnboardingStepView } from './useOnboardingStepView';

/** Onboarding-only rule; the Settings sheet keeps its own minimum. */
const ONBOARDING_MIN_FOCUS_AREAS = 3;

export default function OnboardingFocusAreasScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const setJournalFocusAreas = useSettingsStore((s) => s.setJournalFocusAreas);
  const [selectedAreas, setSelectedAreas] = useState<BuiltInJournalPromptCategoryId[]>(
    () => useSettingsStore.getState().journalFocusAreas,
  );

  useOnboardingStepView('focus-areas');

  const canContinue = selectedAreas.length >= ONBOARDING_MIN_FOCUS_AREAS;

  const handleToggle = (categoryId: BuiltInJournalPromptCategoryId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAreas((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  const handleContinue = () => {
    if (!canContinue) return;
    setJournalFocusAreas(selectedAreas);
    router.push('/onboarding/privacy');
  };

  const handleSkip = () => {
    track('onboarding_skipped', { step: 'focus-areas' });
    router.push('/onboarding/privacy');
  };

  return (
    <OnboardingScaffold
      step={3}
      onSkip={handleSkip}
      footer={
        <View className="gap-1.5">
          {!canContinue && (
            <Text className="text-sm text-muted-foreground text-center">
              {t('Pick at least {count}', { count: ONBOARDING_MIN_FOCUS_AREAS })}
            </Text>
          )}
          <Button
            variant="primary"
            size="lg"
            onPress={handleContinue}
            disabled={!canContinue}
            className={cn(!canContinue && 'opacity-50')}>
            <Text className="text-lg">{t('Continue')}</Text>
          </Button>
        </View>
      }>
      <View className="pt-4">
        <Text variant="h2" className="text-foreground">
          {t('What do you want to be more grateful for?')}
        </Text>
        <Text className="text-base text-muted-foreground mt-1 mb-4">
          {t('We’ll suggest writing prompts from the areas you pick.')}
        </Text>

        {/* Single-column list, styled like Settings → Journal Focus Areas */}
        <View className="bg-card rounded-lg border border-border overflow-hidden">
          {BUILT_IN_JOURNAL_PROMPT_CATEGORIES.map((category, index) => {
            const isSelected = selectedAreas.includes(category.id);
            const isLast = index === BUILT_IN_JOURNAL_PROMPT_CATEGORIES.length - 1;
            return (
              <Button
                key={category.id}
                variant="ghost"
                size="none"
                onPress={() => handleToggle(category.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={t(category.labelKey)}
                className={cn(
                  'w-full flex-row items-center justify-start h-auto px-4 py-3 rounded-none',
                  !isLast && 'border-b border-border',
                  isSelected ? 'bg-primary/50' : 'bg-transparent',
                )}>
                <Text className="text-3xl mr-3">{category.emoji}</Text>
                <View className="flex-1 mr-3">
                  <Text className="text-base font-body-semibold text-foreground">
                    {t(category.labelKey)}
                  </Text>
                  <Text className="text-sm text-muted-foreground mt-0.5">
                    {t(category.descriptionKey)}
                  </Text>
                </View>
                <View className="w-8 h-8 items-center justify-center">
                  <Icon
                    as={isSelected ? Check : Plus}
                    className="text-muted-foreground"
                    size={24}
                    strokeWidth={isSelected ? 3 : 2}
                  />
                </View>
              </Button>
            );
          })}
        </View>
      </View>
    </OnboardingScaffold>
  );
}
