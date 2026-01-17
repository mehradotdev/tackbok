import { useState } from 'react';
import { View, Pressable, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { SettingsSlider } from '~/components/ui/slider';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SettingsTimePickerModal } from './SettingsTimePickerModal';
import { SettingsFirstDayModal } from './SettingsFirstDayModal';
import { SettingsBackupFrequencyModal } from './SettingsBackupFrequencyModal';
import SettingsLanguageComp from './SettingsLanguageComp';

// TODO: Implement actual functionality for all settings
// This is currently a mock UI - switches and sliders work visually but don't trigger real features

export default function SettingsScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();

  // Settings store
  const {
    dailyReminderEnabled,
    setDailyReminderEnabled,
    reminderTime,
    setReminderTime,
    timelineEntryLength,
    setTimelineEntryLength,
    inspirationalQuotesEnabled,
    setInspirationalQuotesEnabled,
    dateIncludesDayOfWeek,
    setDateIncludesDayOfWeek,
    firstDayOfWeek,
    setFirstDayOfWeek,
    biometricUnlockEnabled,
    setBiometricUnlockEnabled,
    googleDriveBackupEnabled,
    setGoogleDriveBackupEnabled,
    backupFrequency,
    setBackupFrequency,
    analyticsEnabled,
    setAnalyticsEnabled,
  } = useSettingsStore();

  // Modal visibility states
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [showFirstDayModal, setShowFirstDayModal] = useState(false);
  const [showBackupFrequencyModal, setShowBackupFrequencyModal] = useState(false);

  // Helper to format time for display in 24-hour format
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  };

  // Helper to get first day label
  const getFirstDayLabel = () => {
    const labels: Record<string, string> = {
      saturday: t('Saturday'),
      sunday: t('Sunday'),
      monday: t('Monday'),
    };
    return labels[firstDayOfWeek];
  };

  // Helper to get backup frequency label
  const getBackupFrequencyLabel = () => {
    const labels: Record<string, string> = {
      daily: t('Daily'),
      weekly: t('Weekly'),
      on_change: t('On Every Change'),
    };
    return labels[backupFrequency];
  };

  // App version
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Button onPress={() => router.back()} variant="ghost" className="p-1 mr-1">
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text variant="h2" className="text-foreground py-1">
          {t('Settings')}
        </Text>
      </View>

      {/* Settings Content */}
      <ScrollView>
        {/* Notifications Section */}
        <SettingsSection title={t('Notifications')} className="pt-4">
          <SettingsRow
            label={t('Daily Reminder Notifications')}
            description={
              dailyReminderEnabled
                ? t('Daily reminder notifications are on')
                : t('Daily reminder notifications are off')
            }
            onPress={() => setDailyReminderEnabled(!dailyReminderEnabled)}
            rightElement={
              // pointerEvents="none" to prevent the switch from being interactable by touch
              <View pointerEvents="none">
                <Switch checked={dailyReminderEnabled} />
              </View>
            }
          />
          <SettingsRow
            label={t('Adjust Reminder Time')}
            description={t('Change your daily reminder time')}
            onPress={() => setShowTimePickerModal(true)}
            showChevron
            disabled={!dailyReminderEnabled}
            isLast
            rightElement={
              <View className="flex-row items-center">
                {/* <Icon as={Clock} className="text-muted-foreground size-4 mr-1" /> */}
                <Text className="text-base text-muted-foreground">
                  {formatTime(reminderTime)}
                </Text>
              </View>
            }
          />
        </SettingsSection>

        {/* Appearance Section */}
        <SettingsSection title={t('Appearance')}>
          <SettingsLanguageComp />
          <SettingsRow
            label={t('Theme')}
            description={t('Choose from over 40 different themes and color schemes')}
            onPress={() => {
              // TODO: Navigate to theme selection page
            }}
            showChevron
          />
          <View className="px-4 py-3 border-b border-border">
            <Text className="text-base font-medium text-foreground">
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
          <SettingsRow
            label={t('Inspirational Quotes')}
            description={t('Gratitude quotes will be shown on entry page')}
            onPress={() => setInspirationalQuotesEnabled(!inspirationalQuotesEnabled)}
            rightElement={
              <View pointerEvents="none">
                <Switch checked={inspirationalQuotesEnabled} />
              </View>
            }
          />
          <SettingsRow
            label={t('Date Style')}
            description={t('Date includes day of the week')}
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
            onPress={() => setShowFirstDayModal(true)}
            showChevron
            rightElement={
              <Text className="text-base text-muted-foreground">
                {getFirstDayLabel()}
              </Text>
            }
            isLast
          />
        </SettingsSection>

        {/* Security Section */}
        <SettingsSection title={t('Security')}>
          <SettingsRow
            label={t('Unlock Tackbok')}
            description={t('Lock with biometric scanner if supported')}
            isLast
            onPress={() => setBiometricUnlockEnabled(!biometricUnlockEnabled)}
            rightElement={
              <View pointerEvents="none">
                <Switch checked={biometricUnlockEnabled} />
              </View>
            }
          />
        </SettingsSection>

        {/* Backup & Restore Section */}
        <SettingsSection title={t('Backup & Restore')}>
          <SettingsRow
            label={t('Google Drive Backup')}
            description={t('Automatically back up your entries with Google Drive')}
            onPress={() => setGoogleDriveBackupEnabled(!googleDriveBackupEnabled)}
            rightElement={
              <View pointerEvents="none">
                <Switch checked={googleDriveBackupEnabled} />
              </View>
            }
          />
          <SettingsRow
            label={t('Backup Frequency')}
            description={getBackupFrequencyLabel()}
            onPress={() => setShowBackupFrequencyModal(true)}
            showChevron
            disabled={!googleDriveBackupEnabled}
          />
          <SettingsRow
            label={t('Export to CSV')}
            description={t('Manually export your entries to CSV format')}
            onPress={() => {
              // TODO: Implement CSV export
            }}
            showChevron
          />
          <SettingsRow
            label={t('Import from Backup')}
            description={t('Select a backed up CSV file to import')}
            onPress={() => {
              // TODO: Implement import functionality
            }}
            showChevron
            isLast
          />
        </SettingsSection>

        {/* App Information Section */}
        <SettingsSection title={t('App Information')}>
          <SettingsRow
            label={t('Share Tackbok')}
            description={t('Share the app with friends and family')}
            onPress={() => {
              // TODO: Implement share functionality
            }}
            showChevron
          />
          <SettingsRow
            label={t('FAQ')}
            description={t('Read frequently asked questions')}
            onPress={() => {
              // TODO: Navigate to FAQ
              Linking.openURL('https://tackbok.app/faq');
            }}
            isExternalLink
          />
          <SettingsRow
            label={t('Terms & Conditions')}
            description={t('Read our terms and conditions')}
            onPress={() => {
              // TODO: Navigate to Terms
              Linking.openURL('https://tackbok.app/terms');
            }}
            isExternalLink
          />
          <SettingsRow
            label={t('Privacy Policy')}
            description={t('Read our privacy policy')}
            onPress={() => {
              // TODO: Navigate to Privacy Policy
              Linking.openURL('https://tackbok.app/privacy');
            }}
            isExternalLink
          />
          <SettingsRow
            label={t('Analytics')}
            description={t('Collecting anonymized analytics to help diagnose problems')}
            onPress={() => setAnalyticsEnabled(!analyticsEnabled)}
            rightElement={
              <View pointerEvents="none">
                <Switch checked={analyticsEnabled} />
              </View>
            }
          />
          <SettingsRow label={t('Version')} description={appVersion} isLast />
        </SettingsSection>

        {/* Bottom spacing */}
        <View className="h-8" />
      </ScrollView>

      {/* Modals */}
      <SettingsTimePickerModal
        visible={showTimePickerModal}
        onClose={() => setShowTimePickerModal(false)}
        value={reminderTime}
        onValueChange={setReminderTime}
      />
      <SettingsFirstDayModal
        visible={showFirstDayModal}
        onClose={() => setShowFirstDayModal(false)}
        value={firstDayOfWeek}
        onValueChange={setFirstDayOfWeek}
      />
      <SettingsBackupFrequencyModal
        visible={showBackupFrequencyModal}
        onClose={() => setShowBackupFrequencyModal(false)}
        value={backupFrequency}
        onValueChange={setBackupFrequency}
      />
    </SafeAreaView>
  );
}
