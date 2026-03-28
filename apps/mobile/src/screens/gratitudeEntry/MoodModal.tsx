import { View } from 'react-native';
import { X } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { cn } from 'tailwind-variants';
import { MOOD_OPTIONS, SHEET_NAMES } from '~/constants';
import { type Mood } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';

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
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

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
      cornerRadius={sheetRadius}
      grabber={true}
      grabberOptions={{
        topMargin: 8,
        color: mutedFgColor as string,
        adaptive: false,
      }}
      backgroundColor={backgroundColor as string}>
      <View className="pb-4 pt-2">
        <View className="flex-row items-center justify-between px-4 py-4">
          <Text className="text-foreground text-lg font-body-semibold leading-tight">
            {t('How are you feeling?')}
          </Text>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => TrueSheet.dismiss(SHEET_NAMES.MOOD)}
            hitSlop={10}
            className="w-8 h-8">
            <Icon as={X} className="text-muted-foreground" size={20} />
          </Button>
        </View>
        <View className="px-4 pb-0">
          <View className="flex-row justify-around py-2">
            {MOOD_OPTIONS.map((option) => {
              const isSelected = value === option.value;

              return (
                <Button
                  variant="ghost"
                  key={option.value}
                  onPress={() => handlePress(option.value)}
                  className={cn(
                    'items-center justify-center py-2 px-1 flex-col gap-1 min-w-14 h-auto',
                    isSelected && 'bg-primary/20',
                  )}>
                  <Text className={cn('text-3xl', isSelected && 'scale-125')}>
                    {option.emoji}
                  </Text>
                  <Text
                    className={cn(
                      'text-sm mt-0',
                      isSelected
                        ? 'text-primary-foreground font-body-semibold'
                        : 'text-foreground/80',
                    )}>
                    {t(option.label)}
                  </Text>
                </Button>
              );
            })}
          </View>
        </View>
      </View>
    </TrueSheet>
  );
}
