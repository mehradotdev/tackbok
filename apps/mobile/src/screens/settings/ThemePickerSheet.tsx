import { useRef, useEffect } from 'react';
import {
  Platform,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Check, X } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { ScopedTheme, useCSSVariable } from 'uniwind';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  THEMES,
  DEFAULT_THEME_SHEET_RADIUS,
  type ThemeConfig,
  isThemeDark,
} from '~/lib/theme/themes';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { TackbokLogo } from '~/components/TackbokLogo';

/** Rendered inside ScopedTheme so useCSSVariable resolves per-theme. */
function ThemeCardContent({
  theme,
  isActive,
}: {
  theme: ThemeConfig;
  isActive: boolean;
}) {
  const [colorForeground] = useCSSVariable(['--color-foreground']);

  return (
    <View
      className={cn(
        'rounded-(--theme-radius) overflow-hidden border-2 bg-background shadow-theme',
        isActive ? 'border-ring' : 'border-transparent',
      )}>
      {/* Header bar showing primary color */}
      <View className="px-3 py-2 flex-row items-center justify-between bg-primary">
        {/* Left spacer for perfect centering */}
        <View className="w-4" />

        <Text className="text-sm font-heading font-bold text-primary-foreground">
          Tackbok
        </Text>

        <View className="w-4 h-4 items-center justify-center">
          {isActive && <Icon as={Check} className="size-4 text-primary-foreground" />}
        </View>
      </View>

      {/* Body preview */}
      <View className="flex-1 flex-row">
        {/* Mini Timeline Column */}
        <View className="w-6 items-end">
          {/* Continuous Line */}
          <View className="w-[3px] bg-foreground absolute top-0 bottom-0 right-0" />
          {/* Timeline Dot */}
          <View className="w-2.5 h-2.5 rounded-full z-10 mt-4 right-[-3.5px] bg-background border-[1.5px] border-foreground" />
          {/* Timeline Dot */}
          <View className="w-2.5 h-2.5 rounded-full z-10 mt-6 right-[-3.5px] bg-background border-[1.5px] border-foreground" />
        </View>

        {/* Content Column */}
        <View className="flex-1 pl-4 pr-3 py-3 gap-1.5">
          <Text className="text-base font-heading font-bold text-foreground">
            {theme.name}
          </Text>

          {/* Color dot row */}
          <View className="flex-row gap-1.5 mt-0.5">
            <View className="w-5 h-5 rounded-full bg-primary" />
            <View className="w-5 h-5 rounded-full bg-foreground" />
            <View className="w-5 h-5 rounded-full bg-card shadow-sm border border-foreground/70" />
          </View>

          {/* Mini logo preview */}
          <View className="items-center py-2 pr-4">
            <TackbokLogo size={44} color={colorForeground as string} />
          </View>
        </View>
      </View>
    </View>
  );
}

function ThemeCard({
  theme,
  isActive,
  onSelect,
}: {
  theme: ThemeConfig;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="none"
      onPress={onSelect}
      className="flex-1 min-w-[44%] max-w-[48%] flex-col items-stretch justify-start"
      role="radio"
      accessibilityRole="radio"
      accessibilityLabel={theme.name}
      accessibilityState={{ selected: isActive }}>
      <ScopedTheme theme={theme.id}>
        <ThemeCardContent theme={theme} isActive={isActive} />
      </ScopedTheme>
    </Button>
  );
}

export function ThemePickerSheet() {
  const { t } = useTranslation();
  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const isDark = isThemeDark(currentTheme);
  const setShowTimelineBorders = useSettingsStore((s) => s.setShowTimelineBorders);
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  // Track scroll position so we can restore it after key-triggered remount
  const scrollOffsetRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollOffsetRef.current > 0) {
      const raf = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: scrollOffsetRef.current, animated: false });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [currentTheme]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  };

  return (
    <TrueSheet
      name={SHEET_NAMES.THEME_PICKER}
      detents={Platform.OS === 'android' ? [0.65, 0.87] : [0.7, 0.85]}
      cornerRadius={sheetRadius}
      grabber={true}
      grabberOptions={{
        topMargin: 8,
        color: mutedFgColor as string,
        adaptive: false,
      }}
      scrollable
      backgroundColor={backgroundColor as string}>
      <View
        key={currentTheme}
        className={cn(
          'flex-1 bg-background overflow-hidden',
          isDark && 'border border-foreground',
        )}
        style={{
          borderTopLeftRadius: sheetRadius,
          borderTopRightRadius: sheetRadius,
        }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
          <Text className="text-xl font-body-bold text-foreground">
            {t('Select a theme')}
          </Text>
          <Button
            onPress={() => TrueSheet.dismiss(SHEET_NAMES.THEME_PICKER)}
            variant="ghost"
            className="p-1 -mr-2"
            accessibilityLabel={t('Close')}>
            <Icon as={X} className="text-foreground" />
          </Button>
        </View>

        {/* Theme grid */}
        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          nestedScrollEnabled
          contentContainerClassName="px-4 pb-12 gap-3"
          showsVerticalScrollIndicator={false}>
          <View
            className="flex-row flex-wrap gap-3 justify-between"
            accessibilityRole="radiogroup"
            accessibilityLabel={t('Select a theme')}>
            {THEMES.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                isActive={currentTheme === theme.id}
                onSelect={() => {
                  setTheme(theme.id);
                  setShowTimelineBorders(theme.enableTimelineBorders);
                }}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </TrueSheet>
  );
}
