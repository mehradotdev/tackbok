import { useState } from 'react';
import { View } from 'react-native';
import { Bell, Clock } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Text } from '~/components/ui/text';
import { Switch } from '~/components/ui/switch';
import { TimePickerModal } from '~/components/TimePickerModal';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '../SettingsRow';

export function NotificationsSection() {
  const { t } = useTranslation();
  const {
    dailyReminderEnabled,
    setDailyReminderEnabled,
    reminderTime,
    setReminderTime,
  } = useSettingsStore();

  const [showTimePickerModal, setShowTimePickerModal] = useState(false);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  };

  return (
    <>
      <SettingsSection title={t('Notifications')} className="pt-4">
        <SettingsRow
          label={t('Daily Reminder')}
          description={
            dailyReminderEnabled
              ? t('Daily reminder notifications are on')
              : t('Daily reminder notifications are off')
          }
          icon={Bell}
          onPress={() => setDailyReminderEnabled(!dailyReminderEnabled)}
          rightElement={
            <View pointerEvents="none">
              <Switch checked={dailyReminderEnabled} />
            </View>
          }
        />
        <SettingsRow
          label={t('Adjust Reminder Time')}
          description={t('Change your daily reminder time')}
          icon={Clock}
          onPress={() => setShowTimePickerModal(true)}
          showChevron
          disabled={!dailyReminderEnabled}
          isLast
          rightElement={
            <View className="flex-row items-center">
              <Text className="text-base text-muted-foreground">
                {formatTime(reminderTime)}
              </Text>
            </View>
          }
        />
      </SettingsSection>

      <TimePickerModal
        visible={showTimePickerModal}
        onClose={() => setShowTimePickerModal(false)}
        value={reminderTime}
        onValueChange={setReminderTime}
        title={t('Adjust Reminder Time')}
      />
    </>
  );
}
