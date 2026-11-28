import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  ScrollView,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCSSVariable } from 'uniwind';
import {
  CloudCheck,
  Images,
  Palette,
  Sparkles,
  TreePine,
  type LucideIcon,
} from 'lucide-react-native';
import { useAchievementDialogStore } from '~/lib/achievement-dialog';
import { useAppLockStore } from '~/lib/appLock';
import { useTranslation, type TranslationKey } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { useSplashActive } from '~/lib/splash';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { currentAppVersion } from '~/lib/whatsNew';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { setWhatsNewShowing, somethingElseOnHome, whatsNewFirst } from './homePrompts';

/** Lets Home settle after the launch animation, the lock or an achievement. */
const SETTLE_MS = 800;

const HIGHLIGHTS: readonly {
  icon: LucideIcon;
  title: TranslationKey;
  body: TranslationKey;
}[] = [
  { icon: CloudCheck, title: 'whatsNew.syncTitle', body: 'whatsNew.syncBody' },
  { icon: TreePine, title: 'whatsNew.festiveTitle', body: 'whatsNew.festiveBody' },
  { icon: Palette, title: 'whatsNew.themesTitle', body: 'whatsNew.themesBody' },
  { icon: Sparkles, title: 'whatsNew.freshTitle', body: 'whatsNew.freshBody' },
  { icon: Images, title: 'whatsNew.photosTitle', body: 'whatsNew.photosBody' },
];

/**
 * "What's new in Tackbok 2.0", once, for people updating from 1.x (see
 * `shouldShowWhatsNew`). It waits on Home until nothing else is on screen: the
 * launch animation, the lock, the Home tips, an achievement or one of Home's
 * own pickers (`blocked`). It counts as seen as soon as it shows.
 */
export function WhatsNewSheet({ blocked }: { blocked: boolean }) {
  const router = useRouter();
  const { t } = useTranslation();
  const sheet = useRef<TrueSheet>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  // Re-check whenever one of the things it waits for goes away.
  const splashActive = useSplashActive((s) => s.active);
  const isLocked = useAppLockStore((s) => s.isLocked);
  const pendingAchievement = useSettingsStore((s) => s.pendingAchievement);
  const manualAchievement = useAchievementDialogStore((s) => s.manualAchievement);
  const hasSeenHomeCoachMarks = useSettingsStore((s) => s.hasSeenHomeCoachMarks);
  const lastSeenAppVersion = useSettingsStore((s) => s.lastSeenAppVersion);
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setAppActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (visible || !focused || blocked || !appActive) return;
    if (!whatsNewFirst()) return;
    const timer = setTimeout(() => {
      if (blocked || somethingElseOnHome() || !whatsNewFirst()) return;
      // Counted as seen straight away, so closing the app doesn't bring it back.
      useSettingsStore.getState().setLastSeenAppVersion(currentAppVersion());
      setWhatsNewShowing(true);
      setVisible(true);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [
    appActive,
    blocked,
    focused,
    hasSeenHomeCoachMarks,
    isLocked,
    lastSeenAppVersion,
    manualAchievement,
    pendingAchievement,
    splashActive,
    visible,
  ]);

  // Whether the sheet is up (or on its way), so it is dismissed only once.
  const open = useRef(false);
  const finish = useCallback(() => {
    open.current = false;
    setWhatsNewShowing(false);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible || open.current) return;
    open.current = true;
    sheet.current?.present().catch(finish);
  }, [finish, visible]);

  useEffect(() => () => setWhatsNewShowing(false), []);

  /** A present still pending is cancelled without `onDidDismiss`, so finish here too. */
  const close = async () => {
    if (!open.current) return;
    await sheet.current?.dismiss().catch(() => {});
    finish();
  };

  const seeThemes = async () => {
    await close();
    router.push({ pathname: '/appearance', params: { open: 'themes' } });
  };

  const buttons = visible ? (
    <View className="bg-background w-full max-w-lg gap-2 self-center px-6 pb-2 pt-4">
      {/* Labels can wrap at large text sizes. */}
      <Button
        variant="primary"
        size="lg"
        className="h-auto min-h-11 py-2.5"
        onPress={() => void close()}>
        <Text className="text-center text-lg">{t('whatsNew.continue')}</Text>
      </Button>
      <Button
        variant="ghost"
        size="lg"
        className="h-auto min-h-11 py-2.5"
        onPress={() => void seeThemes()}>
        <Text className="text-center text-lg text-foreground">
          {t('whatsNew.seeThemes')}
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
      // The buttons float in the footer, so they stay in reach at large text
      // sizes or in landscape while the list scrolls above them.
      scrollableRef={scrollRef}
      scrollableOptions={{ contentInsetAdjustment: 'footer' }}
      footer={buttons}
      footerOptions={{ position: 'absolute' }}
      footerStyle={{ backgroundColor: backgroundColor as string }}
      onDidDismiss={finish}
      maxContentWidth={Platform.OS === 'android' ? 480 : undefined}>
      <ScrollView ref={scrollRef} className="bg-background">
        {visible ? (
          // A readable width on iPad, where the sheet spans the page.
          <View className="w-full max-w-lg self-center px-6 pt-9">
            <Text
              variant="h3"
              role="heading"
              className="text-center text-foreground font-heading">
              {t('whatsNew.title')}
            </Text>
            <Text className="mt-2 text-center text-base text-muted-foreground">
              {t('whatsNew.intro')}
            </Text>
            <View className="mt-5 gap-4" role="list">
              {HIGHLIGHTS.map(({ icon, title, body }) => (
                <View
                  key={title}
                  role="listitem"
                  // One stop per highlight for screen readers.
                  accessible
                  accessibilityLabel={`${t(title)}. ${t(body)}`}
                  className="flex-row items-start gap-3">
                  <View className="mt-0.5 rounded-full bg-muted p-2">
                    <Icon as={icon} size={20} className="text-foreground" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">
                      {t(title)}
                    </Text>
                    <Text className="text-sm text-muted-foreground">{t(body)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </TrueSheet>
  );
}
