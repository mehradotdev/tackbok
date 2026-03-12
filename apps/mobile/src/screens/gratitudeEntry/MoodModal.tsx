import { View, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { MOOD_OPTIONS } from '~/constants';
import { type Mood } from '~/types';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { BottomSheet } from '~/components/ui/BottomSheet';

// ============================================================================
// Types
// ============================================================================

interface IMoodModalProps {
  visible: boolean;
  onClose: () => void;
  value: Mood | null;
  onChange: (mood: Mood | null) => void;
}

// ============================================================================
// Component
// ============================================================================

export function MoodModal({ visible, onClose, value, onChange }: IMoodModalProps) {
  const { t } = useTranslation();

  const handlePress = (mood: Mood) => {
    if (value === mood) {
      onChange(null);
    } else {
      onChange(mood);
      onClose();
    }
  };

  return (
    <BottomSheet isOpen={visible} onClose={onClose}>
      <View className="pb-4">
        <View className="flex-row items-center justify-between px-4 py-2">
          <Text className="text-foreground text-lg font-semibold leading-none">
            {t('How are you feeling?')}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
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
    </BottomSheet>
  );
}
