import { View, Pressable } from 'react-native';
import { ChevronRight, ChevronLeft } from 'lucide-react-native';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';

interface SettingsRowProps {
  label: string;
  description?: string;
  onPress?: () => void;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
  disabled?: boolean;
}

export function SettingsRow({
  label,
  description,
  onPress,
  showChevron = false,
  rightElement,
  isFirst = false,
  isLast = false,
  disabled = false,
}: SettingsRowProps) {
  const { isRTL } = useTranslation();

  const content = (
    <View
      className={cn(
        'flex-row items-center justify-between px-4 py-3',
        !isLast && 'border-b border-border',
        disabled && 'opacity-50',
      )}>
      <View className="flex-1 mr-3">
        <Text className="text-base text-foreground font-medium">{label}</Text>
        {description && (
          <Text className="text-sm text-foreground mt-0.5">{description}</Text>
        )}
      </View>
      <View className="flex-row items-center">
        {rightElement}
        {showChevron && (
          <Icon
            as={isRTL ? ChevronLeft : ChevronRight}
            className="text-muted-foreground size-5 ml-1"
          />
        )}
      </View>
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable onPress={onPress} disabled={disabled}>
        {content}
      </Pressable>
    );
  }

  return content;
}
