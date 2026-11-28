import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useAchievementDialogStore } from '~/lib/achievement-dialog';
import { useAppLockStore } from '~/lib/appLock';
import { useSettingsStore } from '~/lib/settings';
import { useSplashActive } from '~/lib/splash';
import { checkForStoreUpdate, type StoreUpdatePrompt } from '~/lib/storeUpdate';
import { somethingElseOnHome } from './homePrompts';

/** Lets Home settle after the launch animation, the lock or an achievement. */
const SETTLE_MS = 800;
/**
 * One opening-Home sheet per JS runtime, shared by "What's new" and the store
 * update, so they never meet and a remount of Home doesn't ask again.
 */
let offeredThisLaunch = false;
export const openingHomeSheetOffered = () => offeredThisLaunch;
let storeCheck: Promise<StoreUpdatePrompt | null> | undefined;
/** The store check, once per launch: both sheets need its answer to take turns. */
export function storeUpdateThisLaunch(): Promise<StoreUpdatePrompt | null> {
  storeCheck ??= checkForStoreUpdate().catch(() => null);
  return storeCheck;
}
/** For tests, which stand in for separate launches. */
export function resetOpeningHomeSheet() {
  offeredThisLaunch = false;
  storeCheck = undefined;
}

/**
 * Offers `due` in a sheet, only on the Home the app opened on: leaving Home (to
 * write, or to settings) ends the chance until the next launch, so it never
 * interrupts an entry and never meets the festive prompt, which waits for a
 * return to Home. It waits for whatever else owns Home (`somethingElseOnHome`)
 * and `blocked` (Home's own pickers).
 */
export function useOpeningHomeSheet<T>(due: T | null, blocked: boolean) {
  const sheet = useRef<TrueSheet>(null);
  const [offer, setOffer] = useState<T | null>(null);
  // The opening Home only: false for good once it loses focus.
  const [onOpeningHome, setOnOpeningHome] = useState(true);
  // The same, at once: a settle timer can fire before the blur re-renders.
  const leftHome = useRef(false);
  // Re-check whenever one of the things it waits for goes away.
  const splashActive = useSplashActive((s) => s.active);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const pendingAchievement = useSettingsStore((s) => s.pendingAchievement);
  const manualAchievement = useAchievementDialogStore((s) => s.manualAchievement);

  // Whether the sheet is up (or on its way), so it is dismissed only once.
  const open = useRef(false);
  // One answer per showing: the buttons stay tappable while the sheet slides away.
  const answered = useRef(false);

  /** A present still pending is cancelled without `onDidDismiss`, so clear here too. */
  const close = useCallback(async () => {
    if (!open.current) return;
    open.current = false;
    await sheet.current?.dismiss().catch(() => {});
    setOffer(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        leftHome.current = true;
        setOnOpeningHome(false);
        // Something opened over Home (a reminder tap): don't leave the sheet on top.
        void close();
      };
    }, [close]),
  );

  useEffect(() => {
    if (due === null || !onOpeningHome || blocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (offeredThisLaunch || leftHome.current) return;
      // Some of these (the Home tips, the profile sheet) can't be watched, so
      // look again until they're gone.
      if (somethingElseOnHome()) {
        timer = setTimeout(attempt, SETTLE_MS);
        return;
      }
      offeredThisLaunch = true;
      setOffer(due);
    };
    timer = setTimeout(attempt, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [
    blocked,
    due,
    isLocked,
    manualAchievement,
    onOpeningHome,
    pendingAchievement,
    splashActive,
  ]);

  useEffect(() => {
    if (offer === null || open.current || leftHome.current) return;
    open.current = true;
    answered.current = false;
    sheet.current?.present().catch(() => {
      open.current = false;
      setOffer(null);
    });
  }, [offer]);

  /** Claims this showing's one answer: false if a button already answered it. */
  const answer = useCallback(() => {
    if (offer === null || answered.current) return false;
    answered.current = true;
    return true;
  }, [offer]);

  /** A swipe down or a tap outside closes it for this launch only. */
  const onDidDismiss = useCallback(() => {
    open.current = false;
    setOffer(null);
  }, []);

  return { sheet, offer, close, answer, onDidDismiss };
}
