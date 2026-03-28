import React, { useRef } from 'react';
import { Dimensions, Linking, Platform, View } from 'react-native';
import { reloadAppAsync } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import {
  EllipsisVertical,
  Settings,
  Mail,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCSSVariable } from 'uniwind';
import { cn } from 'tailwind-variants';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';

interface ActionRowProps {
  label: string;
  onPress: () => Promise<void> | void;
  isLast?: boolean;
  isBold?: boolean;
  icon?: LucideIcon;
  centered?: boolean;
}

function ActionRow({ label, onPress, isLast, isBold, icon, centered }: ActionRowProps) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      className={cn(
        'py-[18px] px-5 w-full h-auto rounded-none',
        centered ? 'justify-center' : 'justify-start',
        !isLast && 'border-b border-border',
      )}>
      {icon && (
        <View className="mr-4">
          <Icon as={icon} className="text-foreground" size={24} strokeWidth={1.5} />
        </View>
      )}
      <Text
        className={cn(
          'text-lg text-foreground',
          isBold ? 'font-body-semibold' : 'font-body-medium',
        )}>
        {label}
      </Text>
    </Button>
  );
}

function buildSupportBody(): string {
  const appVersion = Constants.expoConfig?.version ?? 'Unknown';
  const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const osVersion = Platform.Version;
  const device = Device.modelName ?? 'Unknown';
  const { width, height } = Dimensions.get('screen');
  const resolution = `${Math.round(width)}x${Math.round(height)}`;

  return [
    '',
    '',
    '',
    '---',
    `App Version: ${appVersion}`,
    `Platform: ${platform}`,
    `OS Version: ${osVersion}`,
    `Device Model: ${device}`,
    `Resolution: ${resolution}`,
  ].join('\n');
}

export function SettingsBottomSheet() {
  const router = useRouter();
  const { t } = useTranslation();
  const sheet = useRef<TrueSheet>(null);
  const [themeRadiusStr] = useCSSVariable(['--theme-radius']);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  const present = () => sheet.current?.present();
  const dismiss = () => sheet.current?.dismiss();

  const handleSettings = async () => {
    await dismiss();
    router.navigate('/settings');
  };

  const handleContactUs = async () => {
    await dismiss();
    const subject = encodeURIComponent('Tackbok - App Support');
    const body = encodeURIComponent(buildSupportBody());
    const url = `mailto:tackbok.support@mehra.dev?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(url);
    } catch {
      // Silently fail if no email client is configured
    }
  };

  const handleReloadApp = async () => {
    await dismiss();
    reloadAppAsync();
  };

  return (
    <>
      <Button
        variant="ghost"
        onPress={present}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('Open Settings')}
        className="py-2 px-2 w-auto h-auto">
        <Icon as={EllipsisVertical} className="text-primary-foreground" />
      </Button>

      <TrueSheet
        ref={sheet}
        detents={['auto']}
        cornerRadius={0}
        grabber={false}
        backgroundColor="transparent"
        maxContentWidth={400}>
        <View className="px-4 pb-8 items-center">
          <View
            className={cn(
              'w-full bg-card overflow-hidden mb-3',
              sheetRadius === 0 ? 'rounded-none border-theme' : 'rounded-xl',
            )}>
            <ActionRow label={t('Settings')} icon={Settings} onPress={handleSettings} />
            <ActionRow label={t('Contact Us')} icon={Mail} onPress={handleContactUs} />
            <ActionRow
              label={t('Reload App')}
              icon={RotateCcw}
              onPress={handleReloadApp}
              isLast
            />
          </View>

          <View
            className={cn(
              'w-full bg-card overflow-hidden',
              sheetRadius === 0 ? 'rounded-none border-theme' : 'rounded-xl',
            )}>
            <ActionRow label={t('Cancel')} onPress={dismiss} isBold centered isLast />
          </View>
        </View>
      </TrueSheet>
    </>
  );
}
