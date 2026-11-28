/**
 * Dev-only one-step setup for screenshots and QA (#219). Metro replaces this
 * module with `./disabled` unless APP_VARIANT is `beta` (see metro.config.js),
 * so production bundles contain none of it.
 *
 * iOS reads only the `-tackbokDevSetup <value>` launch argument; Android reads
 * `tackbokDevSetup` from the launch URL. See the screenshots README for the
 * commands. This text is for developers only, so it is not localized.
 */
import { useEffect, useState } from 'react';
import { Alert, I18nManager, Linking, Platform, Settings } from 'react-native';
import { reloadAppAsync } from 'expo';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { getLocales } from 'expo-localization';
import { router, useRootNavigationState, type Href } from 'expo-router';
import { importFromTackbokBackup } from '~/lib/backupImport';
import { stopProductionSyncRuntime } from '~/lib/cloudSync/runtime';
import { resetThisDeviceOnly } from '~/lib/cloudSync/ui';
import { getEffectiveSupportedLocale, RTL_LOCALES, useLocaleStore } from '~/lib/i18n';
import { kvStorage } from '~/lib/kvStorage';
import { recordLastSeenAppVersion, resetAppUpdatedThisLaunch } from '~/lib/appVersion';
import { useSettingsStore } from '~/lib/settings';
import { hideBetaBadge } from '~/screens/home/Header';
import { skipLaunchGreeting } from '~/screens/home/header-greeting';
import { DEV_SETUP_KEY, getDevSetupFromUrl, parseDevSetup, type DevSetup } from './parse';

/** The last request applied on this device; see applyDevSetup. */
const APPLIED_KEY = 'dev-setup.applied-request';
const IS_BETA_BUILD = Constants.expoConfig?.extra?.appVariant === 'beta';

async function readDevSetupRequest(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    // Only the launch argument: a tapped link must never reset or restore.
    const value: unknown = Settings.get(DEV_SETUP_KEY);
    return typeof value === 'string' && value ? value : null;
  }
  // Android opens the launch URL without a prompt; see the screenshots README.
  return getDevSetupFromUrl(await Linking.getInitialURL());
}

/**
 * The app's documents folder: the simulator's app container on iOS, and
 * `files/` on Android, which `adb shell run-as` can write in debuggable builds.
 */
function getRestoreFile(name: string): File {
  return new File(Paths.document, name);
}

/**
 * Applies a request once. Reloads keep the iOS launch argument and the Android
 * launch URL, so the marker stops a language change in Settings, or this
 * setup's own direction reload, from repeating a reset, a restore or a setting.
 * A request with a new `run=` value applies again.
 */
async function applyDevSetup(setup: DevSetup, raw: string, errors: string[]) {
  const alreadyApplied = (await kvStorage.getItem(APPLIED_KEY)) === raw;
  if (!alreadyApplied) {
    await applySavedSettings(setup, errors);
    await kvStorage.setItem(APPLIED_KEY, raw);
  }
  // These last for one JS runtime, so they apply on every run.
  if (setup.greeting === false) skipLaunchGreeting();
  if (setup.betaBadge === false) hideBetaBadge();

  // A reset returns to the device language, as a fresh install would.
  const localePreference = setup.locale ?? (setup.reset ? 'device' : undefined);
  if (!localePreference) return;
  const locale = getEffectiveSupportedLocale(
    getLocales().map(({ languageTag }) => languageTag),
    localePreference,
  );
  const rtl = RTL_LOCALES.includes(locale);
  if (rtl === I18nManager.isRTL) return;
  if (alreadyApplied) {
    // Never reload twice for one request: a direction that did not apply
    // would otherwise reload forever.
    errors.push(`locale: layout direction did not change to ${rtl ? 'RTL' : 'LTR'}`);
    return;
  }
  if (errors.length > 0) {
    // A reload would hide the alert that explains the errors.
    errors.push('locale: skipped the layout direction reload; launch again');
    return;
  }
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  await reloadAppAsync('Dev setup changed layout direction');
  // Keep the loading screen up while the reload tears this runtime down. If no
  // reload happens, the app still starts and the next launch reports it.
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

async function applySavedSettings(setup: DevSetup, errors: string[]) {
  const settings = useSettingsStore.getState();
  if (setup.reset) {
    await resetThisDeviceOnly();
    settings.resetToDefaults();
    // The reset restarts sync; the layout starts it once the setup finishes.
    stopProductionSyncRuntime();
  }
  if (setup.restore) {
    // A failed restore must not stop the settings below.
    try {
      const file = getRestoreFile(setup.restore);
      if (file.exists) {
        const summary = await importFromTackbokBackup(file.uri, 'overwrite');
        console.info(
          `Dev setup restored ${summary.importedEntries + summary.updatedEntries} entries`,
        );
      } else {
        errors.push(`restore: ${file.uri} not found`);
      }
    } catch (error) {
      errors.push(`restore: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (setup.theme) settings.setTheme(setup.theme);
  if (setup.titleFont) settings.setTitleFont(setup.titleFont);
  if (setup.fontSize) settings.setBodyFontSize(setup.fontSize);
  if (setup.onboarding) settings.setHasCompletedOnboarding(setup.onboarding === 'done');
  if (setup.coachMarks !== undefined) {
    settings.setHasSeenHomeCoachMarks(!setup.coachMarks);
  }
  if (setup.whatsNew) {
    // As if 1.x had run before this launch, which then records itself again.
    settings.setLastSeenAppVersion(null);
    resetAppUpdatedThisLaunch();
    recordLastSeenAppVersion();
  }
  const localePreference = setup.locale ?? (setup.reset ? 'device' : undefined);
  if (localePreference) {
    await useLocaleStore.getState().setLocalePreference(localePreference);
  }
}

let pending: Promise<string | null> | undefined;

/** Runs the setup once per JS runtime and resolves to the screen to open, if any. */
function runDevSetup(): Promise<string | null> {
  pending ??= (async () => {
    // Metro already leaves this module out of non-beta bundles; this guards
    // against a bundle built with the wrong variant.
    if (!IS_BETA_BUILD) return null;
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

// Outside the component: React Compiler assumes module variables never change,
// so it may reread `screenToOpen` after a component clears it.
function takeScreenToOpen(): string | null {
  const screen = screenToOpen;
  screenToOpen = null;
  return screen;
}

/**
 * Applies the launch setup once storage and the database are ready. Returns
 * true when the app may render its routes.
 */
export function useDevSetup(ready: boolean): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void runDevSetup()
      .then((screen) => {
        screenToOpen = screen;
      })
      .catch((error: unknown) => console.warn('Dev setup failed', error))
      .finally(() => {
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
    if (!navigationReady) return;
    const screen = takeScreenToOpen();
    if (screen) router.push(screen as Href);
  }, [navigationReady]);
  return null;
}
