import { View } from 'react-native';
import { ScopedTheme } from 'uniwind';
import { useSettingsStore } from '~/lib/settings';
import { getThemeConfig, type ThemeId } from '~/lib/theme/themes';

function MiniThemeTile({ theme }: { theme: ThemeId }) {
  return (
    <ScopedTheme theme={theme}>
      <View className="h-[38px] w-[34px] overflow-hidden rounded border border-border bg-background">
        <View className="h-2 bg-primary" />
        <View className="flex-1 flex-row px-1.5">
          <View className="w-px items-center bg-foreground/60">
            <View className="mt-1.5 size-1 rounded-full border border-foreground bg-background" />
            <View className="mt-1.5 size-1 rounded-full border border-foreground bg-background" />
          </View>
          <View className="flex-1 gap-1 pl-1.5 pt-1.5">
            <View className="h-0.5 rounded-full bg-foreground/70" />
            <View className="h-0.5 w-2 rounded-full bg-foreground/30" />
            <View className="size-1.5 rounded-full bg-primary" />
          </View>
        </View>
      </View>
    </ScopedTheme>
  );
}

export function ThemeRowPreview() {
  const currentTheme = useSettingsStore((s) => s.theme);
  const theme = getThemeConfig(currentTheme);
  const alternateTheme = theme.variant === 'dark' ? 'light' : 'dark';

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-11 w-14 shrink-0">
      <View className="absolute right-0 top-0">
        <MiniThemeTile theme={alternateTheme} />
      </View>
      <View className="absolute bottom-0 left-0">
        <MiniThemeTile theme={theme.id} />
      </View>
    </View>
  );
}
