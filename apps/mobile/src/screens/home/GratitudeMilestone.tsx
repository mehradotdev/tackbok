import React from 'react';
import { View, Pressable } from 'react-native';
import { cn } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { type MilestoneItem } from '~/types';
import { formatLocalizedNumber, useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Text } from '~/components/ui/text';
import { TackbokLogo } from '~/components/TackbokLogo';
import { getAchievement, isAchievementDay } from '~/lib/achievements';
import { useAchievementDialogStore } from '~/lib/achievement-dialog';

interface IGratitudeMilestoneProps {
  milestone: MilestoneItem;
}

export const GratitudeMilestone: React.FC<IGratitudeMilestoneProps> = ({ milestone }) => {
  const { t, locale } = useTranslation();
  const showTimelineBorders = useSettingsStore((state) => state.showTimelineBorders);
  const [foregroundColor] = useCSSVariable(['--color-foreground']);

  const handlePress = () => {
    const achievement = getAchievement(milestone.milestoneDays);
    if (achievement) {
      useAchievementDialogStore.getState().openManualAchievement(achievement);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={milestone.milestoneDays === 0}
      accessibilityRole={milestone.milestoneDays === 0 ? undefined : 'button'}
      accessibilityLabel={
        milestone.milestoneDays === 0
          ? undefined
          : t('Open {count} day achievement', {
              count: formatLocalizedNumber(milestone.milestoneDays, locale),
            })
      }
      className={cn(
        'flex-row w-full active:bg-muted',
        showTimelineBorders && !milestone.isLast && 'border-b-2 border-border',
      )}>
      {/* --- Timeline Column --- */}
      <View className="w-6 items-end">
        {/* Continuous Line */}
        <View
          className={cn(
            'w-[4px] bg-foreground absolute top-0 bottom-0',
            milestone.isLast && 'bottom-4',
          )}
        />

        {/* The Star/Diamond marker for milestones */}
        {milestone.milestoneDays !== 0 && (
          <View className="w-5 h-5 rounded-sm border-3 border-foreground bg-background z-10 mt-6 right-[-8px] rotate-45" />
        )}

        {/* Milestone 0 Dot */}
        {milestone.milestoneDays === 0 && (
          <View
            className={cn(
              'w-5 h-5 rounded-full bg-foreground z-10 absolute bottom-4 right-[-8px]',
            )}
          />
        )}
      </View>

      {/* --- Milestone Content Column --- */}
      <View className="flex-1 py-4 px-4">
        {milestone.milestoneDays !== 0 && (
          <Text className="text-lg font-body-bold text-foreground">
            <Text variant="h2">{milestone.milestoneDays}</Text> {t('days of gratitude')}
          </Text>
        )}

        {/* Tackbok Logo */}
        <View className="items-center">
          <TackbokLogo size={112} color={foregroundColor as string} />
        </View>
      </View>
    </Pressable>
  );
};

// Helper function to check if a day count is a milestone
// Milestones: 5, 10, and every multiple of 25 (25, 50, 75, 100, ...)
export function isMilestone(dayCount: number): boolean {
  return dayCount === 0 || (dayCount !== 1 && isAchievementDay(dayCount));
}
