import { useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  View,
  type ImageSourcePropType,
  type ScrollViewInstance,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { X } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { APP_ICON_CHOICES, useAppIconStore, type AppIconName } from '~/lib/appIcon';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';

const APP_ICON_PREVIEWS: Record<AppIconName, ImageSourcePropType> = {
  Classic: require('../../../assets/images/app-icons/classic.png'),
  Sage: require('../../../assets/images/app-icons/sage.png'),
  Midnight: require('../../../assets/images/app-icons/midnight.png'),
  Ocean: require('../../../assets/images/app-icons/ocean.png'),
  Terracotta: require('../../../assets/images/app-icons/terracotta.png'),
  Rose: require('../../../assets/images/app-icons/rose.png'),
  Plum: require('../../../assets/images/app-icons/plum.png'),
  Blueprint: require('../../../assets/images/app-icons/blueprint.png'),
};

/** Icon names are proper names, shown in English in every language like theme names. */
export function getAppIconLabel(name: AppIconName): string {
  return name;
}

export function AppIconTile({ name, size }: { name: AppIconName; size: number }) {
  return (
    <Image
      source={APP_ICON_PREVIEWS[name]}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
    />
  );
}

export function AppIconPickerSheet() {
  const { t } = useTranslation();
  const current = useAppIconStore((s) => s.current);
  const setIcon = useAppIconStore((s) => s.setIcon);
  const isChanging = useAppIconStore((s) => s.isChanging);
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  // Android switches the icon once the app leaves the screen.
  const [isWaitingForBackground, setIsWaitingForBackground] = useState(false);
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  return (
    <TrueSheet
      name={SHEET_NAMES.APP_ICON_PICKER}
      detents={['auto']}
      scrollableRef={scrollViewRef}
      cornerRadius={sheetRadius}
      grabber={true}
      grabberOptions={{
        topMargin: 8,
        color: mutedFgColor as string,
        adaptive: false,
      }}
      backgroundStyle={{ backgroundColor: backgroundColor as string }}>
      <View className="bg-background pt-2 pb-8">
        <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
          <Text className="text-xl font-body-bold text-foreground">
            {t('appearance.appIcon')}
          </Text>
          <Button
            onPress={() => TrueSheet.dismiss(SHEET_NAMES.APP_ICON_PICKER)}
            variant="ghost"
            className="p-1 -mr-2"
            accessibilityLabel={t('common.close')}>
            <Icon as={X} className="text-foreground" />
          </Button>
        </View>

        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}>
          <View
            className="flex-row flex-wrap px-3 gap-y-4"
            accessibilityRole="radiogroup"
            accessibilityLabel={t('appearance.appIcon')}>
            {APP_ICON_CHOICES.map((name) => {
              const isActive = name === current;
              const label = getAppIconLabel(name);
              return (
                <Button
                  key={name}
                  variant="ghost"
                  size="none"
                  disabled={isChanging}
                  onPress={async () => {
                    if (!isActive) setIsWaitingForBackground(await setIcon(name));
                  }}
                  className="w-1/4 flex-col items-center gap-2 py-1"
                  role="radio"
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: isActive, disabled: isChanging }}>
                  <View
                    className={cn(
                      'rounded-[20px] border-2 p-0.5',
                      isActive ? 'border-ring' : 'border-transparent',
                    )}>
                    <AppIconTile name={name} size={60} />
                  </View>
                  <Text
                    className={cn(
                      'text-sm',
                      isActive
                        ? 'font-body-bold text-foreground'
                        : 'font-body-medium text-muted-foreground',
                    )}
                    numberOfLines={1}>
                    {label}
                  </Text>
                </Button>
              );
            })}
          </View>
          {/* Stays mounted so the live region announces the note when it appears. */}
          <View accessibilityLiveRegion="polite" className="px-5 pt-4">
            {isWaitingForBackground && (
              <Text className="text-sm text-muted-foreground text-center">
                {t('appearance.appIconChangesAfterLeaving')}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    </TrueSheet>
  );
}
