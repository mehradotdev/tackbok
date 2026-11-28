import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCSSVariable } from 'uniwind';
import { appIconChangeClosesApp, useAppIconStore } from '~/lib/appIcon';
import { useTranslation } from '~/lib/i18n';
import {
  festivePromptFor,
  festiveSwitchFrom,
  type FestivePrompt as Prompt,
} from '~/lib/seasonal/festivePrompt';
import { flushSettings, useSettingsStore } from '~/lib/settings';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { AppIconTile } from '~/screens/settings/AppIconPickerSheet';
import { somethingElseOnHome } from './homePrompts';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

/** Lets the screen transition and any post-save achievement settle first. */
const SETTLE_MS = 800;
/** Android pauses JS timers in the background; a check that fires this late is
 *  running as the app reopens, which is not a moment to ask. */
const LATE_MS = SETTLE_MS + 2000;

type Shown = Exclude<Prompt, { kind: 'forget' }>;

/**
 * The once-per-season "Feeling festive?" suggestion, and from 2 Jan the offer to
 * switch back for people who took it. Never on opening the app and never while
 * writing: it is considered only when Home comes back into focus (after an
 * entry, or settings), and only when nothing else is on screen.
 */
export function FestivePrompt() {
  const router = useRouter();
  const { t } = useTranslation();
  const sheet = useRef<TrueSheet>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [prompt, setPrompt] = useState<Shown | null>(null);
  // One answer per showing: the buttons stay tappable while the sheet slides away.
  const answered = useRef(false);
  // Whether the sheet is up (or on its way), so it is dismissed only once.
  const open = useRef(false);
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  /** Closes the sheet. A present still pending is cancelled without
   *  `onDidDismiss`, so the prompt is cleared here too. */
  const close = async () => {
    if (!open.current) return;
    open.current = false;
    await sheet.current?.dismiss().catch(() => {});
    setPrompt(null);
  };
  // Home's first focus is the app opening; later ones are returns from elsewhere.
  const returned = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!returned.current) {
        return () => {
          returned.current = true;
        };
      }
      let cancelled = false;
      const focusedAt = Date.now();
      const timer = setTimeout(async () => {
        // The OS owns the icon; read it before comparing or remembering it.
        await useAppIconStore.getState().refresh();
        if (cancelled || Date.now() - focusedAt > LATE_MS || somethingElseOnHome())
          return;
        const settings = useSettingsStore.getState();
        const now = new Date();
        const look = {
          festiveTouchesEnabled: settings.festiveTouchesEnabled,
          festivePromptSeason: settings.festivePromptSeason,
          festiveSwitch: settings.festiveSwitch,
          theme: settings.theme,
          icon: useAppIconStore.getState().current,
        };
        let next = festivePromptFor(now, look);
        if (next?.kind === 'forget') {
          settings.setFestiveSwitch(null);
          // This season's suggestion may be due instead.
          next = festivePromptFor(now, { ...look, festiveSwitch: null });
        }
        if (!next || next.kind === 'forget') return;
        // Counted as shown straight away, so closing the app doesn't bring it back.
        if (next.kind === 'suggest') settings.setFestivePromptSeason(next.season);
        answered.current = false;
        setPrompt(next);
      }, SETTLE_MS);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        // Something opened over Home (a reminder tap): don't leave the sheet on top.
        void close();
      };
    }, []),
  );

  useEffect(() => {
    if (!prompt || open.current) return;
    open.current = true;
    sheet.current?.present().catch(() => {
      open.current = false;
      setPrompt(null);
    });
  }, [prompt]);

  const takeALook = async () => {
    if (prompt?.kind !== 'suggest' || answered.current) return;
    answered.current = true;
    const settings = useSettingsStore.getState();
    settings.setFestiveSwitch(
      festiveSwitchFrom(new Date(), prompt, {
        theme: settings.theme,
        icon: useAppIconStore.getState().current,
      }),
    );
    await close();
    router.push('/appearance');
  };

  const switchBack = async () => {
    if (prompt?.kind !== 'switchBack' || answered.current) return;
    answered.current = true;
    const { theme, icon } = prompt;
    await close();
    // The saved look stays until the festive look is really gone: the next return
    // to Home forgets it, or offers again if the icon change failed.
    const settings = useSettingsStore.getState();
    if (theme) settings.setTheme(theme);
    if (icon) {
      // Android closes the app to change the icon: save the theme first.
      await flushSettings();
      await useAppIconStore.getState().setIcon(icon);
    }
  };

  /** "Not now", or "Keep it", which forgets the remembered look. */
  const decline = () => {
    if (!prompt || answered.current) return;
    answered.current = true;
    if (prompt.kind === 'switchBack') useSettingsStore.getState().setFestiveSwitch(null);
    void close();
  };

  const suggest = prompt?.kind === 'suggest';
  const tile = suggest ? prompt.suggestion.icon : prompt?.icon;
  const closesApp =
    prompt?.kind === 'switchBack' && prompt.icon && appIconChangeClosesApp;

  const buttons = prompt ? (
    <View className="bg-background w-full max-w-lg gap-2 self-center px-6 pb-2 pt-5">
      {/* Labels can wrap at large text sizes. */}
      <Button
        variant="primary"
        size="lg"
        className="h-auto min-h-11 py-2.5"
        onPress={() => void (suggest ? takeALook() : switchBack())}>
        <Text className="text-center text-lg">
          {suggest ? t('festive.takeALook') : t('festive.switchBack')}
        </Text>
      </Button>
      <Button
        variant="ghost"
        size="lg"
        className="h-auto min-h-11 py-2.5"
        onPress={decline}>
        <Text className="text-center text-lg text-foreground">
          {suggest ? t('festive.notNow') : t('festive.keepIt')}
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
      // A swipe down or a tap outside just closes it: an unanswered switch-back
      // comes back on the next return to Home.
      onDidDismiss={() => {
        open.current = false;
        setPrompt(null);
      }}
      maxContentWidth={Platform.OS === 'android' ? 480 : undefined}>
      <ScrollView ref={scrollRef} className="bg-background">
        {prompt ? (
          // A readable width on iPad, where the sheet spans the page.
          <View className="w-full max-w-lg items-center self-center px-6 pt-9">
            {tile ? (
              <View
                className="pb-4"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                <AppIconTile name={tile} size={84} />
              </View>
            ) : null}
            <Text variant="h3" className="text-center text-foreground">
              {suggest ? t('festive.promptTitle') : t('festive.switchBackTitle')}
            </Text>
            <Text className="mt-2 text-center text-base text-muted-foreground">
              {suggest ? t('festive.promptMessage') : t('festive.switchBackMessage')}
              {closesApp ? `\n\n${t('appearance.changeAppIconMessage')}` : ''}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </TrueSheet>
  );
}
