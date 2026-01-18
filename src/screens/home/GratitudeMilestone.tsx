import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { useUniwind } from 'uniwind';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';

export interface IMilestoneItem {
  type: 'milestone';
  milestoneDays: number;
}

interface IGratitudeMilestoneProps {
  milestone: IMilestoneItem;
}

export const GratitudeMilestone: React.FC<IGratitudeMilestoneProps> = ({ milestone }) => {
  const { theme } = useUniwind();
  const { t } = useTranslation();

  const handlePress = () => {
    // TODO: Implement Share Milestone functionality
    console.log('Milestone pressed', milestone);
  };

  return (
    <Pressable onPress={handlePress} className="flex-row w-full active:bg-muted">
      {/* --- Timeline Column --- */}
      <View className="w-14 items-center">
        {/* Continuous Line */}
        <View className={cn('w-[4px] bg-foreground absolute top-0 bottom-0')} />

        {/* The Star/Diamond marker for milestones */}
        <View className="w-5 h-5 rounded-sm border-3 border-foreground bg-background z-10 mt-6 rotate-45" />
      </View>

      {/* --- Milestone Content Column --- */}
      <View className="flex-1 py-4 pr-4">
        <View className="">
          <Text className="text-lg font-bold text-foreground font-serif">
            <Text variant="h2">{milestone.milestoneDays}</Text> {t('days of gratitude')}
          </Text>
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
          {/* <Text className="text-sm font-semibold text-center">
            {getMilestoneMessage(milestone.milestoneDays, t)}
          </Text> */}
        </View>
      </View>
    </Pressable>
  );
};

// Helper function to get celebratory message based on milestone
// function getMilestoneMessage(days: number, t: (key: string) => string): string {
//   if (days === 1000) return t("You're a gratitude legend!");
//   if (days === 365) return t('A full year of gratitude!');
//   if (days === 100) return t('Triple digits! Amazing dedication!');
//   if (days === 30) return t('A month of thankfulness!');
//   if (days === 7) return t('One week strong!');
//   return t('Keep up the great work!');
// }

// Helper function to check if a day count is a milestone
// Milestones: 5, 10, and every multiple of 25 (25, 50, 75, 100, ...)
export function isMilestone(dayCount: number): boolean {
  return dayCount === 5 || dayCount === 10 || (dayCount % 25 === 0 && dayCount > 0);
}
