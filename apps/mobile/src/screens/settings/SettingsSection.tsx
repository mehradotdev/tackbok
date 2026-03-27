import { View } from 'react-native';
import { cn } from 'tailwind-variants';
import { Text } from '~/components/ui/text';

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({ title, children, className }: SettingsSectionProps) {
  return (
    <View className={cn('px-4 mb-6', className)}>
      <Text className="text-xs font-body-bold uppercase tracking-wider leading-relaxed text-foreground mb-2 px-1">
        {title}
      </Text>
      <View className="bg-card rounded-lg border-theme border-border shadow-theme overflow-hidden">
        {children}
      </View>
    </View>
  );
}
