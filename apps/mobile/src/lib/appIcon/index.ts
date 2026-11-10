import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { create } from 'zustand';
import { ALTERNATE_APP_ICONS, type AlternateAppIconName } from './icons';

export * from './icons';

interface AppIconNativeModule {
  getAppIconName(icons: readonly string[]): Promise<string | null>;
  setAppIcon(name: string | null, icons: readonly string[]): Promise<void>;
}

// Optional so binaries built before the module existed keep working after an OTA.
const AppIconModule =
  Platform.OS === 'web'
    ? null
    : requireOptionalNativeModule<AppIconNativeModule>('AppIconModule');

export const supportsAlternateIcons = AppIconModule != null;

type AppIconState = {
  /** Active alternate icon, or null for the default icon. */
  current: AlternateAppIconName | null;
  /** True while a change is in flight; further changes are ignored until it settles. */
  isChanging: boolean;
  refresh: () => Promise<void>;
  setIcon: (name: AlternateAppIconName | null) => Promise<void>;
};

// The OS owns the selection, so it is read from native instead of persisted.
export const useAppIconStore = create<AppIconState>((set, get) => ({
  current: null,
  isChanging: false,
  refresh: async () => {
    if (!AppIconModule) return;
    try {
      const name = await AppIconModule.getAppIconName(ALTERNATE_APP_ICONS);
      set({ current: ALTERNATE_APP_ICONS.find((icon) => icon === name) ?? null });
    } catch (error) {
      console.warn('[appIcon] Failed to read app icon', error);
    }
  },
  setIcon: async (name) => {
    if (!AppIconModule || get().isChanging) return;
    set({ isChanging: true });
    try {
      await AppIconModule.setAppIcon(name, ALTERNATE_APP_ICONS);
    } catch (error) {
      console.warn('[appIcon] Failed to change app icon', error);
    }
    await get().refresh();
    set({ isChanging: false });
  },
}));
