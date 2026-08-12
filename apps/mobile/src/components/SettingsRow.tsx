import { View } from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { Button, type ButtonProps } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

type IconComponent = LucideIcon | React.ComponentType<LucideProps>;

type SettingsRowProps = Omit<ButtonProps, 'children' | 'size' | 'variant'> & {
  label: string;
  description?: string;
  showChevron?: boolean;
  isExternalLink?: boolean;
  rightElement?: React.ReactNode;
  isLast?: boolean;
  icon?: IconComponent;
};

export function SettingsRow({
  label,
  description,
  showChevron = false,
  isExternalLink = false,
  rightElement,
  isLast = false,
  disabled = false,
  icon,
  className,
  onPress,
  ...props
}: SettingsRowProps) {
  const { isRTL } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="flex"
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'w-full flex-row items-center justify-between gap-2 px-3 py-3',
        !isLast && 'border-b border-border',
        !onPress && 'active:bg-transparent',
        className,
      )}
      {...props}>
      {icon && <Icon as={icon} className="text-foreground size-5" strokeWidth={2} />}
      <View className="min-w-0 flex-1 items-start">
        <View className="flex-row items-center gap-1">
          <Text className="text-base text-foreground font-body-medium">{label}</Text>
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
          <Text className="text-sm text-foreground/75 mt-0.5 text-left">
            {description}
          </Text>
        )}
      </View>
      {(rightElement || showChevron) && (
        <View className="flex-row items-center gap-1">
          {rightElement}
          {showChevron && (
            <Icon
              as={isRTL ? ChevronLeft : ChevronRight}
              strokeWidth={2}
              className="text-muted-foreground"
            />
          )}
        </View>
      )}
    </Button>
  );
}

export type { SettingsRowProps };
