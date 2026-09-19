import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Bell, Clock } from 'lucide-react-native';
import { useTranslation, formatLocalizedTime } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  cancelDailyReminder,
  requestReminderPermission,
  scheduleDailyReminder,
} from '~/lib/reminders';
import { track } from '~/lib/analytics';
import { Text } from '~/components/ui/text';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/components/ui/toast';
import { TimePickerModal } from '~/components/TimePickerModal';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '~/components/SettingsRow';

export function NotificationsSection() {
  const { t, locale } = useTranslation();
  const { dailyReminderEnabled, setDailyReminderEnabled, reminderTime, setReminderTime } =
    useSettingsStore();

  const [showTimePickerModal, setShowTimePickerModal] = useState(false);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return formatLocalizedTime(date, locale);
  };

  const handleReminderToggle = async () => {
    // Flip the flag only after the OS call succeeds, so the persisted setting
    // never diverges from what is actually scheduled.
    if (dailyReminderEnabled) {
      try {
        await cancelDailyReminder();
        setDailyReminderEnabled(false);
        track('reminder_disabled');
      } catch {
        toast.error(t('notifications.failedToUpdateReminder'));
      }
      return;
    }

    const granted = await requestReminderPermission();
    if (!granted) {
      toast.warning(t('notifications.notificationPermissionNeeded'), {
        description: t(
          'notifications.toGetDailyRemindersAllowNotificationsForTackbokInYour',
        ),
        action: {
          label: t('entry.openSettings'),
          onPress: () => Linking.openSettings(),
        },
      });
      return;
    }

    try {
      await scheduleDailyReminder(reminderTime);
      setDailyReminderEnabled(true);
      track('reminder_enabled');
    } catch {
      toast.error(t('notifications.failedToUpdateReminder'));
    }
  };

  const handleReminderTimeChange = (time: string) => {
    const previousTime = reminderTime;
    setReminderTime(time);
    if (dailyReminderEnabled) {
      scheduleDailyReminder(time).catch(() => {
        setReminderTime(previousTime);
        toast.error(t('notifications.failedToUpdateReminder'));
      });
    }
  };

  return (
    <>
      <SettingsSection title={t('notifications.notifications')} className="pt-4">
        <SettingsRow
          label={t('notifications.dailyReminder')}
          description={
            dailyReminderEnabled
              ? t('notifications.dailyReminderNotificationsAreOn')
              : t('notifications.dailyReminderNotificationsAreOff')
          }
          icon={Bell}
          onPress={() => void handleReminderToggle()}
          rightElement={
            <View pointerEvents="none">
              <Switch checked={dailyReminderEnabled} />
            </View>
          }
        />
        <SettingsRow
          label={t('notifications.adjustReminderTime')}
          description={t('notifications.changeYourDailyReminderTime')}
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
        onValueChange={handleReminderTimeChange}
        title={t('notifications.adjustReminderTime')}
      />
    </>
  );
}
