import { View } from 'react-native';
import { ChevronRight, ChevronLeft, ExternalLink } from 'lucide-react-native';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';

interface SettingsRowProps {
  label: string;
  description?: string;
  onPress?: () => void;
  showChevron?: boolean;
  isExternalLink?: boolean;
  rightElement?: React.ReactNode;
  isLast?: boolean;
  disabled?: boolean;
}

export function SettingsRow({
  label,
  description,
  onPress,
  showChevron = false,
  isExternalLink = false,
  rightElement,
  isLast = false,
  disabled = false,
}: SettingsRowProps) {
  const { isRTL } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="flex"
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'flex-row items-center justify-between px-3 py-3',
        !isLast && 'border-b border-border',
        disabled && 'opacity-50',
        !onPress && 'active:bg-transparent',
      )}>
      <View className="flex-1 mr-3 items-start">
        <View className="flex-row items-center">
          <Text className="text-base text-foreground font-medium mr-1">{label}</Text>
          {isExternalLink && (
            <Icon
              as={ExternalLink}
              className="text-foreground"
              size={16}
              strokeWidth={2}
            />
          )}
        </View>
        {description && (
          <Text className="text-sm text-foreground/80 mt-0.5 text-left">
            {description}
          </Text>
        )}
      </View>
      <View className="flex-row items-center">
        {rightElement}
        {showChevron && (
          <Icon
            as={isRTL ? ChevronLeft : ChevronRight}
            strokeWidth={2}
            className="text-muted-foreground"
          />
        )}
      </View>
    </Button>
  );
}
