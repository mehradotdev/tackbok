import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCSSVariable } from 'uniwind';
import { useAchievementDialogStore } from '~/lib/achievement-dialog';
import { useAppIconStore } from '~/lib/appIcon';
import { useAppLockStore } from '~/lib/appLock';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { useSplashActive } from '~/lib/splash';
import {
  checkForStoreUpdate,
  setNotNowVersion,
  type StoreUpdatePrompt as Prompt,
} from '~/lib/storeUpdate';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { AppIconTile } from '~/screens/settings/AppIconPickerSheet';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { somethingElseOnHome } from './homePrompts';

/** Lets Home settle after the launch animation, the lock or an achievement. */
const SETTLE_MS = 800;
/** Once per JS runtime, so a remount of Home doesn't ask again. */
let offeredThisLaunch = false;
/** For tests, which stand in for separate launches. */
export function resetStoreUpdateOffer() {
  offeredThisLaunch = false;
}

/**
 * "A new version of Tackbok is available", with a button to this build's store.
 * Checked once per launch, and only offered on the Home the app opened on:
 * leaving Home (to write, or to settings) ends the chance until the next launch,
 * so it never interrupts an entry and never meets the festive prompt, which
 * waits for a return to Home. `blocked` covers Home's own pickers.
 */
export function StoreUpdatePrompt({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const sheet = useRef<TrueSheet>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [due, setDue] = useState<Prompt | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  // The opening Home only: false for good once it loses focus.
  const [onOpeningHome, setOnOpeningHome] = useState(true);
  const icon = useAppIconStore((s) => s.current);
  // Re-check whenever one of the things it waits for goes away.
  const splashActive = useSplashActive((s) => s.active);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const pendingAchievement = useSettingsStore((s) => s.pendingAchievement);
  const manualAchievement = useAchievementDialogStore((s) => s.manualAchievement);
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  useEffect(() => {
    if (offeredThisLaunch) return;
    let cancelled = false;
    void checkForStoreUpdate()
      .then((next) => {
        if (!cancelled) setDue(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Whether the sheet is up (or on its way), so it is dismissed only once.
  const open = useRef(false);
  // One answer per showing: the buttons stay tappable while the sheet slides away.
  const answered = useRef(false);

  /** A present still pending is cancelled without `onDidDismiss`, so clear here too. */
  const close = useCallback(async () => {
    if (!open.current) return;
    open.current = false;
    await sheet.current?.dismiss().catch(() => {});
    setPrompt(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setOnOpeningHome(false);
        // Something opened over Home (a reminder tap): don't leave the sheet on top.
        void close();
      };
    }, [close]),
  );

  useEffect(() => {
    if (!due || !onOpeningHome || blocked) return;
    const timer = setTimeout(() => {
      if (somethingElseOnHome() || offeredThisLaunch) return;
      offeredThisLaunch = true;
      setDue(null);
      setPrompt(due);
    }, SETTLE_MS);
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
    if (!prompt || open.current) return;
    open.current = true;
    answered.current = false;
    sheet.current?.present().catch(() => {
      open.current = false;
      setPrompt(null);
    });
  }, [prompt]);

  const update = async () => {
    if (!prompt || answered.current) return;
    answered.current = true;
    const { storeUrl } = prompt;
    await close();
    await Linking.openURL(storeUrl).catch(() => {});
  };

  const notNow = () => {
    if (!prompt || answered.current) return;
    answered.current = true;
    if (!prompt.required) void setNotNowVersion(prompt.latest);
    void close();
  };

  const buttons = prompt ? (
    <View className="bg-background w-full max-w-lg gap-2 self-center px-6 pb-2 pt-5">
      {/* Labels can wrap at large text sizes. */}
      <Button
        variant="primary"
        size="lg"
        className="h-auto min-h-11 py-2.5"
        onPress={() => void update()}>
        <Text className="text-center text-lg">{t('storeUpdate.update')}</Text>
      </Button>
      <Button
        variant="ghost"
        size="lg"
        className="h-auto min-h-11 py-2.5"
        onPress={notNow}>
        <Text className="text-center text-lg text-foreground">
          {t('storeUpdate.notNow')}
        </Text>
      </Button>
    </View>
  ) : undefined;

  return (
    <TrueSheet
      ref={sheet}
      detents={['auto']}
      cornerRadius={sheetRadius}
      grabber
      grabberOptions={{ topMargin: 8, color: mutedFgColor as string, adaptive: false }}
      backgroundStyle={{ backgroundColor: backgroundColor as string }}
      // The buttons float in the footer, which takes the bottom inset, so they stay
      // in reach in landscape or at large text sizes; the text scrolls above them.
      scrollableRef={scrollRef}
      scrollableOptions={{ contentInsetAdjustment: 'footer' }}
      footer={buttons}
      footerOptions={{ position: 'absolute' }}
      footerStyle={{ backgroundColor: backgroundColor as string }}
      // A swipe down or a tap outside closes it for this launch only.
      onDidDismiss={() => {
        open.current = false;
        setPrompt(null);
      }}
      maxContentWidth={Platform.OS === 'android' ? 480 : undefined}>
      <ScrollView ref={scrollRef} className="bg-background">
        {prompt ? (
          // A readable width on iPad, where the sheet spans the page.
          <View className="w-full max-w-lg items-center self-center px-6 pt-9">
            <View
              className="pb-4"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <AppIconTile name={icon} size={84} />
            </View>
            <Text variant="h3" role="heading" className="text-center text-foreground">
              {t('storeUpdate.title')}
            </Text>
            <Text className="mt-2 text-center text-base text-muted-foreground">
              {prompt.required
                ? t('storeUpdate.requiredMessage', { version: prompt.latest })
                : t('storeUpdate.message', { version: prompt.latest })}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </TrueSheet>
  );
}
