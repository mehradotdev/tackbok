import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { useUniwind } from 'uniwind';
import { type MilestoneItem } from '~/types';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Text } from '~/components/ui/text';

interface IGratitudeMilestoneProps {
  milestone: MilestoneItem;
}

export const GratitudeMilestone: React.FC<IGratitudeMilestoneProps> = ({ milestone }) => {
  const { theme } = useUniwind();
  const { t } = useTranslation();
  const showTimelineBorders = useSettingsStore((state) => state.showTimelineBorders);

  const handlePress = () => {
    // TODO: Implement Share Milestone functionality
    console.log('Milestone pressed', milestone);
  };

  return (
    <Pressable
      onPress={handlePress}
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
          <Text className="text-lg font-bold text-foreground font-serif">
            <Text variant="h2">{milestone.milestoneDays}</Text> {t('days of gratitude')}
          </Text>
        )}

        {/* TODO: Make a separate component for Tackbok Image */}
        <View className="items-center">
          {theme === 'dark' ? (
            <Image
              source={require('~/../assets/images/logo_transparent_dark.png')}
              className="w-28 h-28 opacity-80"
            />
          ) : (
            <Image
              source={require('~/../assets/images/logo_transparent_light.png')}
              className="w-28 h-28 opacity-80"
            />
          )}
        </View>
      </View>
    </Pressable>
  );
};

// Helper function to check if a day count is a milestone
// Milestones: 5, 10, and every multiple of 25 (25, 50, 75, 100, ...)
export function isMilestone(dayCount: number): boolean {
  return dayCount === 0 || dayCount === 5 || dayCount === 10 || dayCount % 25 === 0;
}
