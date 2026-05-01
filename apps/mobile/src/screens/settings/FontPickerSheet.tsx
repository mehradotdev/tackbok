import { View, ScrollView } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Check, X } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import {
  DEFAULT_TITLE_FONT_SELECTION,
  TITLE_FONTS,
  getThemeDefaultTitleFontId,
  getTitleFont,
  getTitleFontPreviewStyle,
  resolveTitleFontId,
  type TitleFontSelection,
} from '~/lib/typography';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';

function FontCard({
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
        'flex-1 min-w-[28%] max-w-[32%] flex-col items-center justify-start rounded-lg p-3',
        isActive
          ? 'bg-primary/15 border-2 border-ring'
          : 'bg-card border-2 border-transparent',
      )}
      role="radio"
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}>
      {/* Font preview */}
      <Text
        className="text-2xl text-foreground mb-1.5"
        style={getTitleFontPreviewStyle(previewFontFamily, 24)}>
        Aa
      </Text>
      {/* Label */}
      <Text
        className={cn('text-[12px] text-muted-foreground font-body-medium')}
        numberOfLines={1}>
        {label}
      </Text>
      {/* Selection indicator */}
      {isActive && (
        <View className={cn('absolute top-1.5 right-1.5')}>
          <Icon as={Check} className="text-ring size-4" strokeWidth={3} />
        </View>
      )}
    </Button>
  );
}

export function FontPickerSheet() {
  const { t } = useTranslation();
  const themeId = useSettingsStore((s) => s.theme);
  const currentFont = useSettingsStore((s) => s.titleFont);
  const setTitleFont = useSettingsStore((s) => s.setTitleFont);
  const themeDefaultFont = getTitleFont(getThemeDefaultTitleFontId(themeId));
  const activeFontConfig = getTitleFont(resolveTitleFontId(themeId, currentFont));
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  return (
    <TrueSheet
      name={SHEET_NAMES.FONT_PICKER}
      detents={['auto']}
      cornerRadius={sheetRadius}
      grabber={true}
      grabberOptions={{
        topMargin: 8,
        color: mutedFgColor as string,
        adaptive: false,
      }}
      backgroundColor={backgroundColor as string}>
      <View className="bg-background pt-2 pb-6">
        {/* Header */}
        <View className={cn('items-center justify-between px-5 pt-3 pb-3', 'flex-row')}>
          <Text className={cn('text-xl font-body-bold text-foreground')}>
            {t('Title Font')}
          </Text>
          <Button
            onPress={() => TrueSheet.dismiss(SHEET_NAMES.FONT_PICKER)}
            variant="ghost"
            className={cn('p-1 -mr-2')}
            accessibilityLabel={t('Close')}>
            <Icon as={X} className="text-foreground" />
          </Button>
        </View>

        {/* Live preview */}
        <View className="px-5 py-4 mx-4 mb-4 bg-card rounded-lg border border-border">
          <Text
            className={cn('text-xl text-foreground mb-1')}
            style={getTitleFontPreviewStyle(activeFontConfig.fontFamily, 20)}>
            {t('Gratitude makes today brighter')}
          </Text>
          <Text className={cn('text-sm text-muted-foreground')}>
            {t('Preview of the selected font')}
          </Text>
        </View>

        {/* Font grid */}
        <ScrollView
          horizontal={false}
          contentContainerClassName="px-4 gap-3"
          showsVerticalScrollIndicator={false}>
          <View
            className={cn('flex-row flex-wrap gap-3', 'justify-start')}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('Title Font')}>
            <FontCard
              label={t('Default')}
              previewFontFamily={themeDefaultFont.fontFamily}
              isActive={currentFont === DEFAULT_TITLE_FONT_SELECTION}
              onSelect={() => setTitleFont(DEFAULT_TITLE_FONT_SELECTION)}
            />
            {TITLE_FONTS.map((font) => (
              <FontCard
                key={font.id}
                label={font.label}
                previewFontFamily={font.fontFamily}
                isActive={currentFont === font.id}
                onSelect={() => setTitleFont(font.id as TitleFontSelection)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </TrueSheet>
  );
}
