import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { ScopedTheme } from 'uniwind';
import { SHEET_NAMES, MOOD_EMOJI } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { track } from '~/lib/analytics';
import { getThemeConfig, type ThemeConfig } from '~/lib/theme/themes';
import {
  DEFAULT_TITLE_FONT_SELECTION,
  TITLE_FONTS,
  getThemeDefaultTitleFontId,
  getTitleFont,
  getTitleFontPreviewStyle,
  resolveTitleFontId,
  type TitleFontSelection,
} from '~/lib/theme/typography';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { ThemeBackdrop } from '~/components/backdrops/ThemeBackdrop';
import { ThemePickerSheet } from '~/screens/settings/ThemePickerSheet';
import { OnboardingScaffold } from './OnboardingScaffold';
import { useOnboardingStepView } from './useOnboardingStepView';

/**
 * Curated subset shown as swatches (distinct hues).
 * The full theme grid lives behind "More themes…" (ThemePickerSheet).
 */
const CURATED_THEME_IDS = ['light', 'dark', 'peach', 'lavender', 'navy', 'clemens'];

function ThemeSwatch({
  theme,
  isActive,
  onSelect,
}: {
  theme: ThemeConfig;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="none"
      onPress={onSelect}
      className="flex-col items-center gap-1.5 w-[30%]"
      role="radio"
      accessibilityRole="radio"
      accessibilityLabel={theme.name}
      accessibilityState={{ selected: isActive }}>
      <ScopedTheme theme={theme.id}>
        <View
          className={cn(
            'w-14 h-14 rounded-full border-2 bg-background items-center justify-center',
            isActive ? 'border-ring' : 'border-border',
          )}>
          <View className="w-9 h-9 rounded-full bg-primary items-center justify-center">
            {isActive && (
              <Icon
                as={Check}
                className="text-primary-foreground size-4"
                strokeWidth={3}
              />
            )}
          </View>
        </View>
      </ScopedTheme>
      <Text className="text-xs text-muted-foreground">{theme.name}</Text>
    </Button>
  );
}

function FontChip({
  label,
  previewFontFamily,
  isActive,
  onSelect,
}: {
  label: string;
  previewFontFamily: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="none"
      onPress={onSelect}
      className={cn(
        'w-[31%] flex-col items-center justify-center rounded-lg py-2',
        isActive
          ? 'bg-primary/15 border-2 border-ring'
          : 'bg-card border-2 border-transparent',
      )}
      role="radio"
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}>
      <Text
        className="text-foreground mb-0.5"
        style={getTitleFontPreviewStyle(previewFontFamily, 20)}>
        Aa
      </Text>
      <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </Button>
  );
}

/** Mock timeline entry that re-renders live as theme/font/borders change. */
function ThemePreviewCard() {
  const { t } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const titleFont = useSettingsStore((s) => s.titleFont);
  const showTimelineBorders = useSettingsStore((s) => s.showTimelineBorders);
  const activeTitleFont = getTitleFont(resolveTitleFontId(theme, titleFont));

  return (
    <View
      className={cn(
        'bg-card rounded-lg p-4',
        showTimelineBorders
          ? 'border-2 border-border'
          : 'border border-border/40 shadow-theme',
      )}>
      <View className="flex-row items-start justify-between">
        <Text
          className="text-lg text-foreground flex-1"
          style={getTitleFontPreviewStyle(activeTitleFont.fontFamily, 18)}>
          {t('A walk in the morning sun')}
        </Text>
        <Text className="text-2xl ml-2">{MOOD_EMOJI.HAPPY}</Text>
      </View>
      <Text className="text-base text-foreground mt-2">
        {t('Grateful for quiet streets, warm coffee, and a sky full of color.')}
      </Text>
    </View>
  );
}

export default function OnboardingThemeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const titleFont = useSettingsStore((s) => s.titleFont);
  const setTitleFont = useSettingsStore((s) => s.setTitleFont);
  const setShowTimelineBorders = useSettingsStore((s) => s.setShowTimelineBorders);

  useOnboardingStepView('theme');

  const themeDefaultFont = getTitleFont(getThemeDefaultTitleFontId(currentTheme));
  const curatedThemes = CURATED_THEME_IDS.map((id) => getThemeConfig(id));

  const handleSelectTheme = (theme: ThemeConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTheme(theme.id);
    setShowTimelineBorders(theme.enableTimelineBorders);
    track('theme_changed', { theme: theme.id });
  };

  const handleSkip = () => {
    track('onboarding_skipped', { step: 'theme' });
    router.push('/onboarding/focus-areas');
  };

  return (
    <OnboardingScaffold
      step={2}
      onSkip={handleSkip}
      overlays={<ThemePickerSheet />}
      backdrop={<ThemeBackdrop />}
      footer={
        <Button
          variant="primary"
          size="lg"
          onPress={() => router.push('/onboarding/focus-areas')}>
          <Text className="text-lg">{t('Continue')}</Text>
        </Button>
      }>
      <View className="pt-4">
        <Text variant="h2" className="text-foreground">
          {t('Make it yours')}
        </Text>
        <Text className="text-base text-muted-foreground mt-1 mb-4">
          {t('Pick a look — you can change everything later in Settings.')}
        </Text>

        <ThemePreviewCard />

        {/* Theme swatches */}
        <View
          className="flex-row flex-wrap justify-between gap-y-4 mt-6"
          accessibilityRole="radiogroup"
          accessibilityLabel={t('Theme')}>
          {curatedThemes.map((theme) => (
            <ThemeSwatch
              key={theme.id}
              theme={theme}
              isActive={currentTheme === theme.id}
              onSelect={() => handleSelectTheme(theme)}
            />
          ))}
        </View>
        <Button
          variant="link"
          className="self-center mt-1"
          onPress={() => TrueSheet.present(SHEET_NAMES.THEME_PICKER)}>
          <Text className="text-sm text-muted-foreground underline">
            {t('More themes…')}
          </Text>
        </Button>

        {/* Title font */}
        <Text className="text-base font-body-medium text-foreground mt-4 mb-2">
          {t('Title Font')}
        </Text>
        <View
          className="flex-row flex-wrap justify-between gap-y-2"
          accessibilityRole="radiogroup"
          accessibilityLabel={t('Title Font')}>
          <FontChip
            label={t('Theme Default')}
            previewFontFamily={themeDefaultFont.fontFamily}
            isActive={titleFont === DEFAULT_TITLE_FONT_SELECTION}
            onSelect={() => setTitleFont(DEFAULT_TITLE_FONT_SELECTION)}
          />
          {TITLE_FONTS.map((font) => (
            <FontChip
              key={font.id}
              label={font.label}
              previewFontFamily={font.fontFamily}
              isActive={titleFont === font.id}
              onSelect={() => setTitleFont(font.id as TitleFontSelection)}
            />
          ))}
        </View>
      </View>
    </OnboardingScaffold>
  );
}
