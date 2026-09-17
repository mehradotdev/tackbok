import { useEffect } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { StatusBar } from 'expo-status-bar';

export function AppStatusBar({ style }: { style: 'light' | 'dark' }) {
  useEffect(() => {
    if (process.env.EXPO_OS !== 'android') return;
    // Keep Expo's normal behavior in older binaries that lack the native workaround.
    // Android needs the controller on the attached view after runtime theme changes.
    void requireOptionalNativeModule<{ setStyle(darkIcons: boolean): Promise<void> }>(
      'SystemBarAppearanceModule',
    )?.setStyle(style === 'dark').catch(() => {
      // The activity may have gone away while the update was queued.
    });
  }, [style]);

  return <StatusBar style={style} />;
}
