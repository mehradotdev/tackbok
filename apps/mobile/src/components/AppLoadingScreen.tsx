import React from 'react';
import { Modal, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCSSVariable } from 'uniwind';
import { useSettingsStore } from '~/lib/settings';
import { getThemeConfig } from '~/lib/theme/themes';
import { TackbokLogo } from '~/components/TackbokLogo';
import { SafeAreaView } from '~/components/ui/safe-area-view';

/** Square logo — matches default in `TackbokLogo`; used for vertical centering math. */
const LOADING_LOGO_SIZE = 108;
/** Tailwind `mt-8` — space from logo bottom to spinner. */
const LOGO_TO_SPINNER_GAP = 32;

export interface AppLoadingScreenProps {
  /**
   * Present as a full-screen native modal (e.g. over home header + FAB) instead of inline.
   */
  modal?: boolean;
}

/**
 * Shown while fonts load and DB migrations run (after the native splash has dismissed),
 * or while the gratitude timeline query is still loading.
 * Matches header chrome (`bg-primary`) and logo treatment used on milestones (`--color-foreground`).
 */
export const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({ modal = false }) => {
  const theme = useSettingsStore((s) => s.theme);
  const themeConfig = getThemeConfig(theme);
  const [foregroundColor] = useCSSVariable(['--color-foreground']);
  const statusBarStyle = themeConfig.variant === 'dark' ? 'light' : 'dark';

  const content = (
    <SafeAreaView className="flex-1 bg-background dark:bg-primary" edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style={statusBarStyle} />
      <View className="flex-1">
        <View
          className="absolute inset-x-0 items-center"
          style={{ top: '50%', marginTop: -LOADING_LOGO_SIZE / 2 }}>
          <TackbokLogo size={LOADING_LOGO_SIZE} color={foregroundColor as string} />
        </View>
        <View
          className="absolute inset-x-0 items-center"
          style={{ top: '50%', marginTop: LOADING_LOGO_SIZE / 2 + LOGO_TO_SPINNER_GAP }}>
          <ActivityIndicator size="large" color={foregroundColor as string} />
        </View>
      </View>
    </SafeAreaView>
  );

  if (modal) {
    return (
      <Modal
        visible
        animationType="none"
        presentationStyle="fullScreen"
        onRequestClose={() => {}}>
        {content}
      </Modal>
    );
  }

  return content;
};
