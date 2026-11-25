import { useEffect } from 'react';
import { View } from 'react-native';
import { Palette, LayoutGrid, Sparkles } from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Switch } from '~/components/ui/switch';
import { supportsAlternateIcons, useAppIconStore } from '~/lib/appIcon';
import { THEMES } from '~/lib/theme/themes';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '~/components/SettingsRow';
import SettingsLanguageComp from '../SettingsLanguageComp';
import { ThemeRowPreview } from '../ThemeRowPreview';
import { AppIconTile, getAppIconLabel } from '../AppIconPickerSheet';

export function AppearanceSection() {
  const { t } = useTranslation();
  const currentAppIcon = useAppIconStore((s) => s.current);
  const refreshAppIcon = useAppIconStore((s) => s.refresh);
  const festiveTouches = useSettingsStore((s) => s.festiveTouchesEnabled);
  const setFestiveTouches = useSettingsStore((s) => s.setFestiveTouchesEnabled);

  useEffect(() => {
    void refreshAppIcon();
  }, [refreshAppIcon]);

  return (
    <SettingsSection title={t('appearance.appearance')}>
      <SettingsLanguageComp />
      <SettingsRow
        label={t('appearance.theme')}
        description={t('appearance.countThemesAndColorSchemes', {
          count: THEMES.length,
        })}
        icon={Palette}
        rightElement={<ThemeRowPreview />}
        onPress={() => {
          TrueSheet.present(SHEET_NAMES.THEME_PICKER);
        }}
        showChevron
      />
      {supportsAlternateIcons && (
        <SettingsRow
          label={t('appearance.appIcon')}
          description={getAppIconLabel(currentAppIcon)}
          icon={LayoutGrid}
          rightElement={<AppIconTile name={currentAppIcon} size={36} />}
          onPress={() => {
            TrueSheet.present(SHEET_NAMES.APP_ICON_PICKER);
          }}
          showChevron
        />
      )}
      <SettingsRow
        label={t('appearance.festiveTouches')}
        description={t('appearance.festiveTouchesDescription')}
        icon={Sparkles}
        onPress={() => setFestiveTouches(!festiveTouches)}
        role="switch"
        accessibilityLabel={t('appearance.festiveTouches')}
        accessibilityHint={t('appearance.festiveTouchesDescription')}
        accessibilityState={{ checked: festiveTouches }}
        rightElement={
          <View
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <Switch checked={festiveTouches} />
          </View>
        }
        isLast
      />
    </SettingsSection>
  );
}
