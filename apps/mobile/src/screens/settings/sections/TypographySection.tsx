import { View } from 'react-native';
import { Type, ALargeSmall } from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { cn } from 'tailwind-variants';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  BODY_FONT_SIZES,
  DEFAULT_TITLE_FONT_SELECTION,
  getTitleFont,
  resolveTitleFontId,
  type BodyFontSize,
} from '~/lib/theme/typography';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '../SettingsRow';

/** Labels shown under each font-size tile. */
const SIZE_LABELS: Record<BodyFontSize, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
};

/**
 * The "Aa" preview size rendered in each tile — deliberately different from
 * the actual font-size setting so the difference between tiles is visible.
 */
const TILE_PREVIEW_SIZE: Record<BodyFontSize, number> = {
  small: 16,
  default: 20,
  large: 24,
};

export function TypographySection() {
  const { t } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const titleFont = useSettingsStore((s) => s.titleFont);
  const bodyFontSize = useSettingsStore((s) => s.bodyFontSize);
  const setBodyFontSize = useSettingsStore((s) => s.setBodyFontSize);

  const activeTitleFont = getTitleFont(resolveTitleFontId(theme, titleFont));

  return (
    <SettingsSection title={t('Typography')}>
      {/* Title font row */}
      <SettingsRow
        label={t('Title Font')}
        description={t('Choose a font for titles and headings')}
        icon={Type}
        onPress={() => TrueSheet.present(SHEET_NAMES.FONT_PICKER)}
        showChevron
        rightElement={
          <Text className="text-base text-muted-foreground">
            {titleFont === DEFAULT_TITLE_FONT_SELECTION
              ? t('Default')
              : activeTitleFont.label}
          </Text>
        }
      />

      {/* Body font size — tile picker */}
      <View className="px-3 py-3 border-b-0">
        <View className={cn('items-start flex-row')}>
          <View className={cn('mt-0.5 mr-3')}>
            <Icon as={ALargeSmall} strokeWidth={2} className="text-foreground size-5" />
          </View>
          <View className={cn('flex-1')}>
            <Text className={cn('text-base font-body-medium text-foreground')}>
              {t('Font Size')}
            </Text>
            <Text className={cn('text-sm text-foreground/80 mt-0.5 mb-3')}>
              {t('Adjust the size of body text')}
            </Text>

            {/* Size tiles */}
            <View
              className={cn('flex-row gap-3 justify-start')}
              accessibilityRole="radiogroup"
              accessibilityLabel={t('Font Size')}>
              {BODY_FONT_SIZES.map((size) => {
                const isActive = bodyFontSize === size;
                return (
                  <Button
                    key={size}
                    variant="ghost"
                    size="none"
                    onPress={() => setBodyFontSize(size)}
                    role="radio"
                    accessibilityRole="radio"
                    accessibilityLabel={t(SIZE_LABELS[size])}
                    accessibilityState={{ selected: isActive }}
                    className={cn(
                      'flex-1 flex-col items-center justify-center rounded-lg py-3',
                      isActive
                        ? 'bg-primary/15 border-2 border-ring'
                        : 'bg-card border-2 border-transparent',
                    )}>
                    <Text
                      className={cn('text-foreground mb-1 font-body-semibold')}
                      style={{ fontSize: TILE_PREVIEW_SIZE[size] }}>
                      Aa
                    </Text>
                    <Text
                      className={cn('text-xs text-muted-foreground font-body-medium')}>
                      {t(SIZE_LABELS[size])}
                    </Text>
                  </Button>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}
