import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Check, Plus, X } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  BUILT_IN_JOURNAL_PROMPT_CATEGORIES,
  type BuiltInJournalPromptCategoryId,
} from '~/lib/journalPrompts';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { toast } from '~/components/ui/toast';

const MIN_FOCUS_AREAS = 2;

export function JournalFocusAreasSheet() {
  const { t } = useTranslation();
  const journalFocusAreas = useSettingsStore((s) => s.journalFocusAreas);
  const setJournalFocusAreas = useSettingsStore((s) => s.setJournalFocusAreas);
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  const [selectedAreas, setSelectedAreas] =
    useState<BuiltInJournalPromptCategoryId[]>(journalFocusAreas);

  const canSave = selectedAreas.length >= MIN_FOCUS_AREAS;

  const handlePresent = () => {
    // Sync local state with store when sheet opens
    setSelectedAreas(useSettingsStore.getState().journalFocusAreas);
  };

  const handleToggle = (categoryId: BuiltInJournalPromptCategoryId) => {
    setSelectedAreas((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      }
      return [...prev, categoryId];
    });
  };

  const handleSave = () => {
    if (!canSave) {
      toast.warning(t('Select at least 2 focus areas'));
      return;
    }
    setJournalFocusAreas(selectedAreas);
    TrueSheet.dismiss(SHEET_NAMES.JOURNAL_FOCUS_AREAS);
  };

  return (
    <TrueSheet
      name={SHEET_NAMES.JOURNAL_FOCUS_AREAS}
      detents={['auto']}
      cornerRadius={sheetRadius}
      grabber={true}
      grabberOptions={{
        topMargin: 8,
        color: mutedFgColor as string,
        adaptive: false,
      }}
      backgroundColor={backgroundColor as string}
      onDidPresent={handlePresent}>
      <View className="bg-background pt-2">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <View className="w-10" />

          <Text className="text-foreground text-lg font-body-semibold leading-tight flex-1 text-center">
            {t('Journal Focus Areas')}
          </Text>

          <View className="w-10 items-end">
            <Button
              variant="ghost"
              size="icon"
              onPress={() => TrueSheet.dismiss(SHEET_NAMES.JOURNAL_FOCUS_AREAS)}
              accessibilityLabel={t('Close')}
              hitSlop={10}
              className="w-8 h-8">
              <Icon as={X} className="text-muted-foreground" size={20} />
            </Button>
          </View>
        </View>

        {/* Subtitle */}
        <View className="px-4 pt-3 pb-2">
          <Text className="text-sm text-muted-foreground">
            {t('Pick the topics you want to write about.')}
          </Text>
        </View>

        {/* Category List Container */}
        <View className="px-4 mb-4">
          <View className="bg-card rounded-lg border border-border overflow-hidden">
            <ScrollView
              className="max-h-[60vh]"
              contentContainerClassName="p-0"
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled>
              {BUILT_IN_JOURNAL_PROMPT_CATEGORIES.map((category, index) => {
                const isSelected = selectedAreas.includes(category.id);
                const isLast =
                  index === BUILT_IN_JOURNAL_PROMPT_CATEGORIES.length - 1;

                return (
                  <Button
                    key={category.id}
                    variant="ghost"
                    size="none"
                    onPress={() => handleToggle(category.id)}
                    className={cn(
                      'w-full flex-row items-center justify-start h-auto px-4 py-3 rounded-none',
                      !isLast && 'border-b border-border',
                      isSelected ? 'bg-primary/50' : 'bg-transparent',
                    )}>
                    {/* Emoji */}
                    <Text className="text-3xl mr-3">{category.emoji}</Text>

                    {/* Text */}
                    <View className="flex-1 mr-3">
                      <Text className="text-base font-body-semibold text-foreground">
                        {t(category.labelKey)}
                      </Text>
                      <Text className="text-sm text-muted-foreground mt-0.5">
                        {t(category.descriptionKey)}
                      </Text>
                    </View>

                    {/* Indicator */}
                    <View className="w-8 h-8 items-center justify-center">
                      {isSelected ? (
                        <Icon
                          as={Check}
                          className="text-muted-foreground"
                          size={24}
                          strokeWidth={3}
                        />
                      ) : (
                        <Icon
                          as={Plus}
                          className="text-muted-foreground"
                          size={24}
                          strokeWidth={2}
                        />
                      )}
                    </View>
                  </Button>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Save Button */}
        <View className="px-4 pb-6 pt-2">
          <Button
            variant="primary"
            size="lg"
            onPress={handleSave}
            disabled={!canSave}
            className={cn(!canSave && 'opacity-50')}>
            <Text className="text-lg">{t('Save')}</Text>
          </Button>
        </View>
      </View>
    </TrueSheet>
  );
}
