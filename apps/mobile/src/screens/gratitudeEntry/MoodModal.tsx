import { View, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { cn } from 'tailwind-variants';
import { MOOD_OPTIONS, SHEET_NAMES } from '~/constants';
import { type Mood } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';

// ============================================================================
// Types
// ============================================================================

interface IMoodModalProps {
  value: Mood | null;
  onChange: (mood: Mood | null) => void;
}

// ============================================================================
// Component
// ============================================================================

export function MoodModal({ value, onChange }: IMoodModalProps) {
  const { t } = useTranslation();
  const [backgroundColor] = useCSSVariable(['--color-background']);

  const handlePress = (mood: Mood) => {
    if (value === mood) {
      onChange(null);
    } else {
      onChange(mood);
      TrueSheet.dismiss(SHEET_NAMES.MOOD);
    }
  };

  return (
    <TrueSheet
      name={SHEET_NAMES.MOOD}
      detents={['auto']}
      cornerRadius={24}
      grabber={true}
      grabberOptions={{
        topMargin: 8,
      }}
      backgroundColor={backgroundColor as string}>
      <View className="pb-4 pt-2">
        <View className="flex-row items-center justify-between px-4 py-4">
          <Text className="text-foreground text-lg font-semibold leading-tight">
            {t('How are you feeling?')}
          </Text>
          <Pressable onPress={() => TrueSheet.dismiss(SHEET_NAMES.MOOD)} hitSlop={10}>
            <Icon as={X} className="text-muted-foreground" size={20} />
          </Pressable>
        </View>
        <View className="px-4 pb-0">
          <View className="flex-row justify-around py-2">
            {MOOD_OPTIONS.map((option) => {
              const isSelected = value === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => handlePress(option.value)}
                  className={cn(
                    'items-center justify-center p-2 rounded-xl min-w-14',
                    isSelected ? 'bg-primary/20' : 'active:bg-muted',
                  )}>
                  <Text className={cn('text-3xl', isSelected && 'scale-125')}>
                    {option.emoji}
                  </Text>
                  <Text
                    className={cn(
                      'text-sm mt-1',
                      isSelected
                        ? 'text-primary-foreground font-semibold'
                        : 'text-foreground/80',
                    )}>
                    {t(option.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </TrueSheet>
  );
}
