import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Sparkles } from 'lucide-react-native';
import { useTranslation, formatLocalizedTime } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { track } from '~/lib/analytics';
import { hasAnyEntries } from '~/db/queries';
import { QUERY_KEYS } from '~/hooks/useGratitude';
import { seedSampleEntries } from '~/lib/sampleEntries';
import {
  cancelDailyReminder,
  requestReminderPermission,
  scheduleDailyReminder,
} from '~/lib/reminders';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';
import { TimePickerModal } from '~/components/TimePickerModal';
import { OnboardingScaffold } from './OnboardingScaffold';
import { useOnboardingStepView } from './useOnboardingStepView';

export default function OnboardingFinishScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const profileName = useSettingsStore((s) => s.profileName);
  const { dailyReminderEnabled, setDailyReminderEnabled, reminderTime, setReminderTime } =
    useSettingsStore();
  const setHasCompletedOnboarding = useSettingsStore((s) => s.setHasCompletedOnboarding);

  const [addSampleEntries, setAddSampleEntries] = useState(true);
  // null = unknown (toggle hidden until the check resolves)
  const [dbIsEmpty, setDbIsEmpty] = useState<boolean | null>(null);
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useOnboardingStepView('finish');

  useEffect(() => {
    let cancelled = false;
    hasAnyEntries()
      .then((hasEntries) => {
        if (!cancelled) setDbIsEmpty(!hasEntries);
      })
      .catch(() => {
        if (!cancelled) setDbIsEmpty(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return formatLocalizedTime(date, locale);
  };

  // Mirrors Settings → Notifications: flip the flag only after the OS call
  // succeeds, so the persisted setting never diverges from what is scheduled.
  const handleReminderToggle = async () => {
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

  const handleFinish = async () => {
    if (isFinishing || dbIsEmpty === null) return;
    setIsFinishing(true);
    try {
      if (dbIsEmpty && addSampleEntries) {
        try {
          // seedSampleEntries tracks the seeded ids in the settings store
          // itself (even on partial failure, so the banner can clean up).
          await seedSampleEntries(t);
        } catch (error) {
          // Non-fatal: finish onboarding with an empty timeline instead.
          console.warn('Sample entry seeding failed', error);
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] }),
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.tags] }),
        ]);
      }
      track('onboarding_completed');
      setHasCompletedOnboarding(true);
      router.replace('/');
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <OnboardingScaffold
      step={5}
      overlays={
        <TimePickerModal
          visible={showTimePickerModal}
          onClose={() => setShowTimePickerModal(false)}
          value={reminderTime}
          onValueChange={handleReminderTimeChange}
          title={t('notifications.adjustReminderTime')}
        />
      }
      footer={
        <Button
          variant="primary"
          size="lg"
          onPress={() => void handleFinish()}
          disabled={isFinishing || dbIsEmpty === null}>
          <Text className="text-lg">
            {isFinishing || dbIsEmpty === null
              ? t('onboarding.settingThingsUp')
              : t('onboarding.startJournaling')}
          </Text>
        </Button>
      }>
      <View className="pt-10">
        <Text variant="h2" className="text-foreground">
          {profileName
            ? t('onboarding.youreAllSetName', { name: profileName })
            : t('onboarding.youreAllSet')}
        </Text>
        <Text className="text-base text-muted-foreground mt-2 mb-6">
          {t('onboarding.twoLastThingsYouCanTurnOnBothAreOptional')}
        </Text>

        <View className="gap-3">
          {/* Sample entries opt-in (hidden when the journal already has entries) */}
          {dbIsEmpty === true && (
            <Button
              variant="ghost"
              size="none"
              onPress={() => setAddSampleEntries((prev) => !prev)}
              accessibilityRole="switch"
              accessibilityState={{ checked: addSampleEntries }}
              className="flex-col items-stretch bg-card rounded-lg border border-border p-4">
              <View className="flex-row items-start justify-between">
                <Icon as={Sparkles} className="text-foreground size-6" />
                <View pointerEvents="none">
                  <Switch checked={addSampleEntries} />
                </View>
              </View>
              <Text className="text-base font-body-semibold text-foreground mt-2">
                {t('onboarding.addExampleEntries')}
              </Text>
              <Text className="text-sm text-muted-foreground mt-0.5">
                {t('onboarding.aFewSampleEntriesShowHowPhotosVoiceMemosMoods')}
              </Text>
            </Button>
          )}

          {/* Daily reminder opt-in */}
          <Button
            variant="ghost"
            size="none"
            onPress={() => void handleReminderToggle()}
            accessibilityRole="switch"
            accessibilityState={{ checked: dailyReminderEnabled }}
            className="flex-col items-stretch bg-card rounded-lg border border-border p-4">
            <View className="flex-row items-start justify-between">
              <Icon as={Bell} className="text-foreground size-6" />
              <View pointerEvents="none">
                <Switch checked={dailyReminderEnabled} />
              </View>
            </View>
            <Text className="text-base font-body-semibold text-foreground mt-2">
              {t('onboarding.remindMeDaily')}
            </Text>
            <Text className="text-sm text-muted-foreground mt-0.5">
              {t('onboarding.aGentleNudgeToWriteNeverYourJournalContent')}
            </Text>

            {dailyReminderEnabled && (
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setShowTimePickerModal(true)}
                className="self-start mt-3">
                <Text className="text-sm">
                  {t('onboarding.remindMeAtTime', { time: formatTime(reminderTime) })}
                </Text>
              </Button>
            )}
          </Button>
        </View>
      </View>
    </OnboardingScaffold>
  );
}
