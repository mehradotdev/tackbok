import { useEffect } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { create } from 'zustand';
import { ALTERNATE_APP_ICONS, type AlternateAppIconName } from './icons';

export * from './icons';

interface AppIconNativeModule {
  getAppIconName(icons: readonly string[]): Promise<string | null>;
  /**
   * Resolves "pending" when Android applies the change once the app goes to
   * background. iOS and Android binaries built before that resolve null.
   */
  setAppIcon(name: string | null, icons: readonly string[]): Promise<'pending' | null>;
  /** Android binaries with deferred changes only. */
  setPendingIconHeld?(held: boolean): Promise<void>;
}

// Optional so binaries built before the module existed keep working after an OTA.
const AppIconModule =
  Platform.OS === 'web'
    ? null
    : requireOptionalNativeModule<AppIconNativeModule>('AppIconModule');

export const supportsAlternateIcons = AppIconModule != null;

let holds = 0;

/**
 * On Android a pending icon change ends the app's task once it leaves the
 * screen. Hold it while that would lose work; call the returned function to release.
 */
export function holdAppIconChange(): () => void {
  holds++;
  if (holds === 1) setPendingIconHeld(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    if (holds === 0) setPendingIconHeld(false);
  };
}

function setPendingIconHeld(held: boolean) {
  AppIconModule?.setPendingIconHeld?.(held).catch((error: unknown) => {
    console.warn('[appIcon] Failed to hold app icon change', error);
  });
}

/** Holds a pending icon change while `held` is true. */
export function useHoldAppIconChange(held: boolean): void {
  useEffect(() => (held ? holdAppIconChange() : undefined), [held]);
}

// Beta builds ship the Blueprint artwork as their default icon (app.config.ts).
const DEFAULT_APP_ICON_ARTWORK: AlternateAppIconName | null =
  Constants.expoConfig?.extra?.appVariant === 'beta' ? 'Blueprint' : null;

/** Picker choices: null is the default icon. An alternate that looks the same is left out. */
export const APP_ICON_CHOICES: readonly (AlternateAppIconName | null)[] = [
  null,
  ...ALTERNATE_APP_ICONS.filter((name) => name !== DEFAULT_APP_ICON_ARTWORK),
];

/** The artwork a choice shows, or null for the Classic artwork. */
export function getAppIconArtwork(
  name: AlternateAppIconName | null,
): AlternateAppIconName | null {
  return name ?? DEFAULT_APP_ICON_ARTWORK;
}

/** The picker choice for an icon; an alternate that looks like the default reads as the default. */
export function toAppIconChoice(
  name: AlternateAppIconName | null,
): AlternateAppIconName | null {
  return name === DEFAULT_APP_ICON_ARTWORK ? null : name;
}

type AppIconState = {
  /** Active alternate icon, or null for the default icon. */
  current: AlternateAppIconName | null;
  /** True while a change is in flight; further changes are ignored until it settles. */
  isChanging: boolean;
  refresh: () => Promise<void>;
  /** Resolves true when the new icon appears only after the app goes to background. */
  setIcon: (name: AlternateAppIconName | null) => Promise<boolean>;
};

// The OS owns the selection, so it is read from native instead of persisted.
// On Android a choice waiting for the app to go to background reads as current.
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
    if (!AppIconModule || get().isChanging) return false;
    set({ isChanging: true });
    let isPending = false;
    try {
      isPending =
        (await AppIconModule.setAppIcon(name, ALTERNATE_APP_ICONS)) === 'pending';
    } catch (error) {
      console.warn('[appIcon] Failed to change app icon', error);
    }
    await get().refresh();
    set({ isChanging: false });
    return isPending;
  },
}));
