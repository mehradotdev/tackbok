import { useState, useCallback } from 'react';
import { View, ScrollView, Linking, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Clock,
  Palette,
  AlignLeft,
  Quote,
  Calendar,
  CalendarDays,
  Fingerprint,
  CloudUpload,
  RefreshCw,
  Share2,
  HelpCircle,
  FileText,
  Shield,
  BarChart3,
  Info,
  FileOutput,
  FileInput,
  Upload,
  Trash2,
  Table2,
} from 'lucide-react-native';
import { DELETE_CONFIRM_DELAY_SECONDS } from '~/constants';
import { deleteAllData } from '~/db/queries';
import { deleteAllPhotos } from '~/lib/photoUtils';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  exportToCSV,
  pickCSVFile,
  importFromCSV,
  importFromPresentlyCSV,
} from '~/lib/backup';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { SettingsSlider } from '~/components/ui/slider';
import { toast } from '~/components/ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogDestructiveAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { TimePickerModal } from '~/components/TimePickerModal';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SettingsFirstDayModal } from './SettingsFirstDayModal';
import { SettingsBackupFrequencyModal } from './SettingsBackupFrequencyModal';
import SettingsLanguageComp from './SettingsLanguageComp';

// TODO: Implement actual functionality for all settings
// This is currently a mock UI - switches and sliders work visually but don't trigger real features

export default function SettingsScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const queryClient = useQueryClient();

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
    showTimelineBorders,
    setShowTimelineBorders,
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
  const [showFirstDayModal, setShowFirstDayModal] = useState(false);
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [showBackupFrequencyModal, setShowBackupFrequencyModal] = useState(false);
  const [showImportConfirmDialog, setShowImportConfirmDialog] = useState(false);
  const [showPresentlyImportConfirmDialog, setShowPresentlyImportConfirmDialog] =
    useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Export to Tackbok CSV handler
  const handleExportToCSV = useCallback(async () => {
    try {
      await exportToCSV();
      toast.success(t('Entries exported successfully'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Export failed');
      toast.error(message);
    }
  }, [t]);

  // Shared import handler — parameterized by dialog dismissal and import function
  const handleImport = useCallback(
    async (dismissDialog: () => void, importFn: (uri: string) => Promise<number>) => {
      dismissDialog();
      try {
        const result = await pickCSVFile();
        if (!result) return; // User cancelled

        const asset = result.assets?.[0];
        if (!asset?.uri) throw new Error(t('Import failed'));

        setIsImporting(true);
        const count = await importFn(asset.uri);
        try {
          await queryClient.invalidateQueries();
        } catch (error) {
          console.error('Failed to invalidate queries:', error);
        }
        setIsImporting(false);

        const message =
          count === 1
            ? t('importedCountSingular', { count })
            : t('importedCount', { count });
        toast.success(message);

        // Navigate to home screen
        router.replace('/');
      } catch (error) {
        setIsImporting(false);
        const message = error instanceof Error ? error.message : t('Import failed');
        toast.error(message);
      }
    },
    [t, router, queryClient],
  );

  const handleImportFromCSV = useCallback(
    () => handleImport(() => setShowImportConfirmDialog(false), importFromCSV),
    [handleImport],
  );

  const handleImportFromPresentlyCSV = useCallback(
    () =>
      handleImport(
        () => setShowPresentlyImportConfirmDialog(false),
        importFromPresentlyCSV,
      ),
    [handleImport],
  );

  // Delete all data handler
  const handleDeleteAllData = useCallback(async () => {
    setShowDeleteConfirmDialog(false);
    try {
      await deleteAllPhotos();
      await deleteAllData();
      try {
        await queryClient.invalidateQueries();
      } catch (error) {
        console.error('Failed to invalidate queries:', error);
      }
      toast.success(t('All data deleted'));
      // Navigate to home screen
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Delete failed');
      toast.error(message);
    }
  }, [t, router, queryClient]);

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
    return labels[firstDayOfWeek] ?? t('Monday');
  };

  // Helper to get backup frequency label
  const getBackupFrequencyLabel = () => {
    const labels: Record<string, string> = {
      daily: t('Daily'),
      weekly: t('Weekly'),
      on_change: t('On Every Change'),
    };
    return labels[backupFrequency] ?? t('Daily');
  };

  // App version
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-safe-or-4 pt-safe-or-3 pb-3 border-b border-border">
        <Button onPress={() => router.back()} variant="ghost" className="p-1 mr-1">
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text variant="h2" className="text-foreground py-1">
          {t('Settings')}
        </Text>
      </View>

      {/* Settings Content */}
      <ScrollView className="px-safe">
        {/* Notifications Section */}
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
              // pointerEvents="none" to prevent the switch from being interactable by touch
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

        {/* Appearance Section */}
        <SettingsSection title={t('Appearance')}>
          <SettingsLanguageComp />
          <SettingsRow
            label={t('Theme')}
            description={t('Choose from over 40 different themes and color schemes')}
            icon={Palette}
            onPress={() => {
              // TODO: Navigate to theme selection page
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
            </View>
          </View>
          <SettingsRow
            label={t('Inspirational Quotes')}
            description={t('Gratitude quotes will be shown on entry page')}
            icon={Quote}
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
            icon={Fingerprint}
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
            icon={CloudUpload}
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
            icon={RefreshCw}
            onPress={() => setShowBackupFrequencyModal(true)}
            showChevron
            disabled={!googleDriveBackupEnabled}
          />
          <SettingsRow
            label={t('Export to CSV')}
            description={t('Full backup of entries and tags')}
            icon={FileOutput}
            onPress={handleExportToCSV}
            showChevron
          />
          <SettingsRow
            label={t('Import Entries from CSV')}
            description={t('Restore from a Tackbok backup file')}
            icon={FileInput}
            onPress={() => setShowImportConfirmDialog(true)}
            showChevron
          />
          <SettingsRow
            label={t('Import from Presently App')}
            description={t('Import entries from a Presently CSV export')}
            icon={Upload}
            onPress={() => setShowPresentlyImportConfirmDialog(true)}
            showChevron
            isLast
          />
        </SettingsSection>

        {/* App Information Section */}
        <SettingsSection title={t('App Information')}>
          <SettingsRow
            label={t('Share Tackbok')}
            description={t('Share the app with friends and family')}
            icon={Share2}
            onPress={() => {
              // TODO: Implement share functionality
            }}
            showChevron
          />
          <SettingsRow
            label={t('FAQ')}
            description={t('Read frequently asked questions')}
            icon={HelpCircle}
            onPress={() => {
              // TODO: Navigate to FAQ
              Linking.openURL('https://tackbok.app/faq');
            }}
            isExternalLink
          />
          <SettingsRow
            label={t('Terms & Conditions')}
            description={t('Read our terms and conditions')}
            icon={FileText}
            onPress={() => {
              // TODO: Navigate to Terms
              Linking.openURL('https://tackbok.app/terms');
            }}
            isExternalLink
          />
          <SettingsRow
            label={t('Privacy Policy')}
            description={t('Read our privacy policy')}
            icon={Shield}
            onPress={() => {
              // TODO: Navigate to Privacy Policy
              Linking.openURL('https://tackbok.app/privacy');
            }}
            isExternalLink
          />
          <SettingsRow
            label={t('Analytics')}
            description={t('Collecting anonymized analytics to help diagnose problems')}
            icon={BarChart3}
            onPress={() => setAnalyticsEnabled(!analyticsEnabled)}
            rightElement={
              <View pointerEvents="none">
                <Switch checked={analyticsEnabled} />
              </View>
            }
          />
          <SettingsRow label={t('Version')} description={appVersion} icon={Info} isLast />
        </SettingsSection>

        {/* Danger Zone Section */}
        <SettingsSection title={t('Danger Zone')}>
          <SettingsRow
            label={t('Delete All Data')}
            description={t('Permanently delete all your entries and photos')}
            icon={Trash2}
            onPress={() => setShowDeleteConfirmDialog(true)}
            showChevron
            isLast
          />
        </SettingsSection>

        {/* Bottom spacing */}
        <View className="h-8" />
      </ScrollView>

      {/* Modals */}
      <TimePickerModal
        visible={showTimePickerModal}
        onClose={() => setShowTimePickerModal(false)}
        value={reminderTime}
        onValueChange={setReminderTime}
        title={t('Adjust Reminder Time')}
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

      {/* Import Confirmation Dialog */}
      <AlertDialog
        open={showImportConfirmDialog}
        onOpenChange={setShowImportConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure you want to import?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This will import entries from a Tackbok backup file. Duplicate entries will be skipped.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleImportFromCSV}>
              <Text>{t('Import')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Presently Import Confirmation Dialog */}
      <AlertDialog
        open={showPresentlyImportConfirmDialog}
        onOpenChange={setShowPresentlyImportConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Import from Presently?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleImportFromPresentlyCSV}>
              <Text>{t('Import')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete all data?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This action cannot be undone. All your entries and photos will be permanently deleted.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogDestructiveAction
              onPress={handleDeleteAllData}
              delaySeconds={DELETE_CONFIRM_DELAY_SECONDS}>
              <Text>{t('Delete All Data')}</Text>
            </AlertDialogDestructiveAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Loading Overlay */}
      {isImporting && (
        <View className="absolute inset-0 bg-background/80 items-center justify-center z-50">
          <View className="bg-card p-6 rounded-2xl items-center shadow-lg">
            <ActivityIndicator size="large" className="mb-4" />
            <Text className="text-foreground text-base font-medium">
              {t('Importing entries...')}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
