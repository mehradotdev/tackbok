import { useState } from 'react';
import { View } from 'react-native';
import { Palette, AlignLeft, Calendar, CalendarDays, Table2 } from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { SettingsSlider } from '~/components/ui/slider';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '~/components/SettingsRow';
import { SettingsFirstDayModal } from '../SettingsFirstDayModal';
import SettingsLanguageComp from '../SettingsLanguageComp';

export function AppearanceSection() {
  const { t } = useTranslation();
  const {
    timelineEntryLength,
    setTimelineEntryLength,
    showTimelineBorders,
    setShowTimelineBorders,
    dateIncludesDayOfWeek,
    setDateIncludesDayOfWeek,
    firstDayOfWeek,
    setFirstDayOfWeek,
  } = useSettingsStore();

  const [showFirstDayModal, setShowFirstDayModal] = useState(false);

  const getFirstDayLabel = () => {
    const labels: Record<string, string> = {
      saturday: t('Saturday'),
      sunday: t('Sunday'),
      monday: t('Monday'),
    };
    return labels[firstDayOfWeek] ?? t('Monday');
  };

  return (
    <>
      <SettingsSection title={t('Appearance')}>
        <SettingsLanguageComp />
        <SettingsRow
          label={t('Theme')}
          description={t('Choose from over 10 different themes and color schemes')}
          icon={Palette}
          onPress={() => {
            TrueSheet.present(SHEET_NAMES.THEME_PICKER);
          }}
          showChevron
        />
        <SettingsRow
          label={t('Show Timeline Borders')}
          description={
            showTimelineBorders
              ? t('Show the borders in the timeline')
              : t('Hide the borders in the timeline')
          }
          icon={Table2}
          onPress={() => setShowTimelineBorders(!showTimelineBorders)}
          rightElement={
            <View pointerEvents="none">
              <Switch checked={showTimelineBorders} />
            </View>
          }
        />
        <View className="px-3 py-3 border-b border-border">
          <View className="flex-row items-start">
            <View className="mr-3 mt-0.5">
              <Icon as={AlignLeft} strokeWidth={2} className="text-foreground size-5" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-body-medium text-foreground">
                {t('Timeline Entry Length')}
              </Text>
              <Text className="text-sm text-foreground/80 mt-0.5 mb-2">
                {t('Number of lines shown in the timeline')}
              </Text>
              <SettingsSlider
                value={timelineEntryLength}
                onValueChange={setTimelineEntryLength}
                minimumValue={1}
                maximumValue={50}
                step={1}
              />
            </View>
          </View>
        </View>
        <SettingsRow
          label={t('Date Style')}
          description={t('Date includes day of the week')}
          icon={Calendar}
          onPress={() => setDateIncludesDayOfWeek(!dateIncludesDayOfWeek)}
          rightElement={
            <View pointerEvents="none">
              <Switch checked={dateIncludesDayOfWeek} />
            </View>
          }
        />
        <SettingsRow
          label={t('First Day of Week')}
          description={t('Set the first day of the week in the calendar view')}
          icon={CalendarDays}
          onPress={() => setShowFirstDayModal(true)}
          showChevron
          rightElement={
            <Text className="text-base text-muted-foreground">{getFirstDayLabel()}</Text>
          }
          isLast
        />
      </SettingsSection>

      <SettingsFirstDayModal
        visible={showFirstDayModal}
        onClose={() => setShowFirstDayModal(false)}
        value={firstDayOfWeek}
        onValueChange={setFirstDayOfWeek}
      />
    </>
  );
}
