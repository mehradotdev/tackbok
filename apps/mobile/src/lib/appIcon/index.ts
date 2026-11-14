import { useEffect } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { create } from 'zustand';
import { ALTERNATE_APP_ICONS, BETA_ALTERNATE_APP_ICONS, type AppIconName } from './icons';

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

const IS_BETA_BUILD = Constants.expoConfig?.extra?.appVariant === 'beta';

/** Alternate icons registered in this build's binary (app.config.ts). */
const NATIVE_ICONS: readonly AppIconName[] = IS_BETA_BUILD
  ? BETA_ALTERNATE_APP_ICONS
  : ALTERNATE_APP_ICONS;

/** The artwork of the bundled default icon: beta builds ship Blueprint. */
const DEFAULT_ICON: AppIconName = IS_BETA_BUILD ? 'Blueprint' : 'Classic';

/** Picker choices, the same in every build. */
export const APP_ICON_CHOICES: readonly AppIconName[] = [
  'Classic',
  ...ALTERNATE_APP_ICONS,
];

/** The icon the OS reports: null is the bundled default. */
function fromNative(name: string | null): AppIconName {
  return NATIVE_ICONS.find((icon) => icon === name) ?? DEFAULT_ICON;
}

/** The default artwork is set as the bundled default, not as its alternate twin. */
function toNative(name: AppIconName): AppIconName | null {
  return name === DEFAULT_ICON ? null : name;
}

type AppIconState = {
  /** Artwork of the active icon. */
  current: AppIconName;
  /** True while a change is in flight; further changes are ignored until it settles. */
  isChanging: boolean;
  refresh: () => Promise<void>;
  /** Resolves true when the new icon appears only after the app goes to background. */
  setIcon: (name: AppIconName) => Promise<boolean>;
};

// The OS owns the selection, so it is read from native instead of persisted.
// On Android a choice waiting for the app to go to background reads as current.
export const useAppIconStore = create<AppIconState>((set, get) => ({
  current: DEFAULT_ICON,
  isChanging: false,
  refresh: async () => {
    if (!AppIconModule) return;
    try {
      set({ current: fromNative(await AppIconModule.getAppIconName(NATIVE_ICONS)) });
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
        (await AppIconModule.setAppIcon(toNative(name), NATIVE_ICONS)) === 'pending';
    } catch (error) {
      console.warn('[appIcon] Failed to change app icon', error);
    }
    await get().refresh();
    set({ isChanging: false });
    return isPending;
  },
}));
