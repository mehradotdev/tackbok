/**
 * Dev-only one-step setup for screenshots and QA (#219). Metro replaces this
 * module with `./disabled` unless APP_VARIANT is `beta` (see metro.config.js),
 * so production bundles contain none of it.
 *
 * iOS reads the `-tackbokDevSetup <value>` launch argument; Android reads
 * `tackbokDevSetup` from the launch URL. See the screenshots README for the
 * commands. This text is for developers only, so it is not localized.
 */
import { useEffect, useState } from 'react';
import { Alert, I18nManager, Linking, Platform, Settings } from 'react-native';
import { reloadAppAsync } from 'expo';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { getLocales } from 'expo-localization';
import { router, useRootNavigationState, type Href } from 'expo-router';
import { importFromTackbokBackup } from '~/lib/backupImport';
import { resetThisDeviceOnly } from '~/lib/cloudSync/ui';
import { getEffectiveSupportedLocale, RTL_LOCALES, useLocaleStore } from '~/lib/i18n';
import { kvStorage } from '~/lib/kvStorage';
import { useSettingsStore } from '~/lib/settings';
import { hideBetaBadge } from '~/screens/home/Header';
import { skipLaunchGreeting } from '~/screens/home/header-greeting';
import { DEV_SETUP_KEY, getDevSetupFromUrl, parseDevSetup, type DevSetup } from './parse';

/** Set before an RTL reload so the reloaded run skips reset and restore. */
const RELOAD_MARKER_KEY = 'dev-setup.reloaded-for';

async function readDevSetupRequest(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const value: unknown = Settings.get(DEV_SETUP_KEY);
    if (typeof value === 'string' && value) return value;
  }
  return getDevSetupFromUrl(await Linking.getInitialURL());
}

/** iOS: the app's Documents folder. Android: its external files folder, which adb can write. */
function getRestoreFile(name: string): File {
  if (Platform.OS === 'android') {
    return new File(
      `file:///sdcard/Android/data/${Application.applicationId}/files/${name}`,
    );
  }
  return new File(Paths.document, name);
}

async function applyDevSetup(setup: DevSetup, raw: string, errors: string[]) {
  const resumed = (await kvStorage.getItem(RELOAD_MARKER_KEY)) === raw;
  if (resumed) await kvStorage.removeItem(RELOAD_MARKER_KEY);

  const settings = useSettingsStore.getState();
  if (setup.reset && !resumed) {
    await resetThisDeviceOnly();
    settings.resetToDefaults();
  }
  if (setup.restore && !resumed) {
    const file = getRestoreFile(setup.restore);
    if (file.exists) {
      const summary = await importFromTackbokBackup(file.uri, 'overwrite');
      console.info(
        `Dev setup restored ${summary.importedEntries + summary.updatedEntries} entries`,
      );
    } else {
      errors.push(`restore: ${file.uri} not found`);
    }
  }

  if (setup.theme) settings.setTheme(setup.theme);
  if (setup.titleFont) settings.setTitleFont(setup.titleFont);
  if (setup.fontSize) settings.setBodyFontSize(setup.fontSize);
  if (setup.onboarding) settings.setHasCompletedOnboarding(setup.onboarding === 'done');
  if (setup.coachMarks !== undefined)
    settings.setHasSeenHomeCoachMarks(!setup.coachMarks);
  if (setup.greeting === false) skipLaunchGreeting();
  if (setup.betaBadge === false) hideBetaBadge();

  // A reset returns to the device language, as a fresh install would.
  const localePreference = setup.locale ?? (setup.reset ? 'device' : undefined);
  if (localePreference) {
    await useLocaleStore.getState().setLocalePreference(localePreference);
    const locale = getEffectiveSupportedLocale(
      getLocales().map(({ languageTag }) => languageTag),
      localePreference,
    );
    const rtl = RTL_LOCALES.includes(locale);
    if (rtl !== I18nManager.isRTL) {
      // Layout direction applies only after a reload, which reads the same
      // launch argument or URL again.
      await kvStorage.setItem(RELOAD_MARKER_KEY, raw);
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
      await reloadAppAsync('Dev setup changed layout direction');
    }
  }
}

let pending: Promise<string | null> | undefined;

/** Runs the setup once per JS runtime and resolves to the screen to open, if any. */
function runDevSetup(): Promise<string | null> {
  pending ??= (async () => {
    let raw: string | null;
    try {
      raw = await readDevSetupRequest();
    } catch (error) {
      console.warn('Dev setup could not read its launch input', error);
      return null;
    }
    if (!raw) return null;
    const { setup, errors } = parseDevSetup(raw);
    try {
      await applyDevSetup(setup, raw, errors);
    } catch (error) {
      // The app still starts: a failed step must not leave it on the loading screen.
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (errors.length > 0) {
      console.warn('Dev setup:', errors.join('; '));
      Alert.alert('Dev setup', errors.join('\n'));
    }
    return setup.screen ?? null;
  })();
  return pending;
}

let screenToOpen: string | null = null;

/**
 * Applies the launch setup once storage and the database are ready. Returns
 * true when the app may render its routes.
 */
export function useDevSetup(ready: boolean): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void runDevSetup().then((screen) => {
      screenToOpen = screen;
      if (!cancelled) setDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return done;
}

/** Rendered inside the navigator: opens the requested screen once. */
export function DevSetupNavigation() {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  useEffect(() => {
    if (!navigationReady || !screenToOpen) return;
    const screen = screenToOpen;
    screenToOpen = null;
    router.push(screen as Href);
  }, [navigationReady]);
  return null;
}
