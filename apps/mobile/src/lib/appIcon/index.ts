import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { create } from 'zustand';
import { ALTERNATE_APP_ICONS, BETA_ALTERNATE_APP_ICONS, type AppIconName } from './icons';

export * from './icons';

interface AppIconNativeModule {
  /** Android only, and only in binaries built after it was added. */
  readonly registeredIcons?: readonly string[];
  getAppIconName(icons: readonly string[]): Promise<string | null>;
  setAppIcon(name: string | null, icons: readonly string[]): Promise<void>;
  /** Android only, newer binaries: switch once the user next leaves the app. */
  setAppIconOnLeave?(name: string | null, icons: readonly string[]): Promise<void>;
  cancelAppIconOnLeave?(): Promise<void>;
}

// Optional so binaries built before the module existed keep working after an OTA.
const AppIconModule =
  Platform.OS === 'web'
    ? null
    : requireOptionalNativeModule<AppIconNativeModule>('AppIconModule');

export const supportsAlternateIcons = AppIconModule != null;

/**
 * Switching icons on Android ends the app's task, so the app closes: the
 * picker asks first. iOS shows its own alert instead.
 */
export const appIconChangeClosesApp = Platform.OS === 'android';

/**
 * Onboarding offers the icon only where choosing it never closes the app: iOS
 * switches straight away, and Android binaries that can wait until the user
 * leaves the app.
 */
export const canChooseIconInOnboarding =
  Platform.OS === 'android'
    ? typeof AppIconModule?.setAppIconOnLeave === 'function'
    : supportsAlternateIcons;

const IS_BETA_BUILD = Constants.expoConfig?.extra?.appVariant === 'beta';

/** Alternate icons this build registers (app.config.ts). */
const BUILD_ICONS: readonly AppIconName[] = IS_BETA_BUILD
  ? BETA_ALTERNATE_APP_ICONS
  : ALTERNATE_APP_ICONS;

// Android binaries report the icons they registered. Older ones predate the beta
// Classic alternate and fail midway on an unknown alias, leaving two launcher
// icons, so they get the original list (frozen: later icons such as Christmas
// are not in them). Older iOS binaries just reject an icon they lack.
const ORIGINAL_ANDROID_ICONS: readonly AppIconName[] = [
  'Sage',
  'Midnight',
  'Ocean',
  'Terracotta',
  'Rose',
  'Plum',
  'Blueprint',
];
const NATIVE_ICONS: readonly AppIconName[] =
  Platform.OS === 'android'
    ? BUILD_ICONS.filter((icon) =>
        (AppIconModule?.registeredIcons ?? ORIGINAL_ANDROID_ICONS).includes(icon),
      )
    : BUILD_ICONS;

/** The artwork of the bundled default icon: beta builds ship Blueprint. */
const DEFAULT_ICON: AppIconName = IS_BETA_BUILD ? 'Blueprint' : 'Classic';

/** Picker choices: every icon the binary can show. */
export const APP_ICON_CHOICES: readonly AppIconName[] = (
  ['Classic', ...ALTERNATE_APP_ICONS] as const
).filter((icon) => icon === DEFAULT_ICON || NATIVE_ICONS.includes(icon));

/** The icon the OS reports: null is the bundled default. */
function fromNative(name: string | null): AppIconName {
  return NATIVE_ICONS.find((icon) => icon === name) ?? DEFAULT_ICON;
}

/**
 * The default artwork is set as the bundled default, not as its alternate twin.
 * A beta install with the Blueprint alternate active therefore switches once more,
 * to an icon that looks the same.
 */
function toNative(name: AppIconName): AppIconName | null {
  return name === DEFAULT_ICON ? null : name;
}

type AppIconState = {
  /** Artwork of the active icon. */
  current: AppIconName;
  /** True while a change is in flight; further changes are ignored until it settles. */
  isChanging: boolean;
  /**
   * Android: the icon picked during onboarding. It is handed to native once
   * onboarding is done and switches when the user next leaves the app.
   */
  pending: AppIconName | null;
  refresh: () => Promise<void>;
  setIcon: (name: AppIconName) => Promise<void>;
  /** Onboarding's choice: right away on iOS, after leaving the app on Android. */
  chooseInOnboarding: (name: AppIconName) => Promise<void>;
  /**
   * Android: once onboarding is done, switch to the pending icon when the user
   * next leaves the app. While onboarding runs (also when replayed or after a
   * reset), nothing may switch, so any queued switch is cancelled.
   */
  syncPendingOnLeave: (onboardingDone: boolean) => Promise<void>;
};

async function cancelIconOnLeave() {
  try {
    await AppIconModule?.cancelAppIconOnLeave?.();
  } catch (error) {
    console.warn('[appIcon] Failed to cancel the pending icon', error);
  }
}

// The OS owns the selection, so it is read from native instead of persisted.
export const useAppIconStore = create<AppIconState>((set, get) => ({
  current: DEFAULT_ICON,
  isChanging: false,
  pending: null,
  refresh: async () => {
    if (!AppIconModule) return;
    try {
      const current = fromNative(await AppIconModule.getAppIconName(NATIVE_ICONS));
      set({ current, pending: get().pending === current ? null : get().pending });
    } catch (error) {
      console.warn('[appIcon] Failed to read app icon', error);
    }
  },
  setIcon: async (name) => {
    if (!AppIconModule || get().isChanging) return;
    set({ isChanging: true });
    if (get().pending) {
      // A choice made here replaces the one still waiting from onboarding.
      set({ pending: null });
      await cancelIconOnLeave();
    }
    try {
      await AppIconModule.setAppIcon(toNative(name), NATIVE_ICONS);
    } catch (error) {
      console.warn('[appIcon] Failed to change app icon', error);
    }
    await get().refresh();
    set({ isChanging: false });
  },
  chooseInOnboarding: async (name) => {
    if (Platform.OS !== 'android') {
      await get().setIcon(name);
      return;
    }
    set({ pending: name === get().current ? null : name });
    // Drop any choice handed over earlier (a replayed onboarding).
    await cancelIconOnLeave();
  },
  syncPendingOnLeave: async (onboardingDone) => {
    if (!onboardingDone) {
      await cancelIconOnLeave();
      return;
    }
    // Drops a choice that already switched (the app reopened after the switch).
    await get().refresh();
    const { pending } = get();
    if (!pending || !AppIconModule?.setAppIconOnLeave) return;
    try {
      await AppIconModule.setAppIconOnLeave(toNative(pending), NATIVE_ICONS);
    } catch (error) {
      console.warn('[appIcon] Failed to queue the app icon', error);
    }
  },
}));
