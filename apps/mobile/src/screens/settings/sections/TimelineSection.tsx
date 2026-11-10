import { useState } from 'react';
import { View } from 'react-native';
import { AlignLeft, Calendar, CalendarDays, Table2 } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { SettingsSlider } from '~/components/ui/slider';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '~/components/SettingsRow';
import { SettingsFirstDayModal } from '../SettingsFirstDayModal';

export function TimelineSection() {
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
      saturday: t('calendar.saturday'),
      sunday: t('calendar.sunday'),
      monday: t('calendar.monday'),
    };
    return labels[firstDayOfWeek] ?? t('calendar.monday');
  };

  return (
    <>
      <SettingsSection title={t('appearance.timelineAndCalendar')}>
        <SettingsRow
          label={t('appearance.showTimelineBorders')}
          description={
            showTimelineBorders
              ? t('appearance.showTheBordersInTheTimeline')
              : t('appearance.hideTheBordersInTheTimeline')
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
                {t('appearance.timelineEntryLength')}
              </Text>
              <Text className="text-sm text-foreground/80 mt-0.5 mb-2">
                {t('appearance.numberOfLinesShownInTheTimeline')}
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
          label={t('appearance.dateStyle')}
          description={t('appearance.dateIncludesDayOfTheWeek')}
          icon={Calendar}
          onPress={() => setDateIncludesDayOfWeek(!dateIncludesDayOfWeek)}
          rightElement={
            <View pointerEvents="none">
              <Switch checked={dateIncludesDayOfWeek} />
            </View>
          }
        />
        <SettingsRow
          label={t('appearance.firstDayOfWeek')}
          description={t('appearance.setTheFirstDayOfTheWeekInTheCalendar')}
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
