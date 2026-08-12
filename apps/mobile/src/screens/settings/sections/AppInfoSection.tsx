import { useState } from 'react';
import { View, Linking, Share, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import {
  Share2,
  HelpCircle,
  FileText,
  Shield,
  BarChart3,
  Info,
  CloudDownload,
  RefreshCw,
  RotateCcw,
} from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  checkForAppUpdate,
  restartToApplyAppUpdate,
  useAppUpdates,
} from '~/lib/appUpdates';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/components/ui/toast';
import { Text } from '~/components/ui/text';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '~/components/SettingsRow';

export function AppInfoSection() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const {
    analyticsEnabled,
    setAnalyticsEnabled,
    lastUpdateCheckAt,
    setLastUpdateCheckAt,
  } = useSettingsStore();
  const [isManualCheckRunning, setIsManualCheckRunning] = useState(false);
  const [showReplayOnboardingDialog, setShowReplayOnboardingDialog] = useState(false);
  const { isChecking, isDownloading, isUpdatePending } = useAppUpdates();

  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const buildVersion = Application.nativeBuildVersion;
  const displayedVersion = buildVersion ? `${appVersion} (${buildVersion})` : appVersion;
  const lastUpdateCheckDate = lastUpdateCheckAt ? new Date(lastUpdateCheckAt) : null;
  const lastUpdateCheckTime =
    lastUpdateCheckDate && !Number.isNaN(lastUpdateCheckDate.getTime())
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(lastUpdateCheckDate)
      : t('Never');
  const isUpdateBusy = isManualCheckRunning || isChecking || isDownloading;

  const handleRestart = async () => {
    try {
      await restartToApplyAppUpdate();
    } catch (error) {
      console.warn('Failed to restart to apply the downloaded update:', error);
      toast.error(t('Unable to update'));
    }
  };

  const handleCheckForUpdates = async () => {
    setIsManualCheckRunning(true);
    try {
      const result = await checkForAppUpdate();
      if (result === 'current' || result === 'downloaded') {
        setLastUpdateCheckAt(new Date().toISOString());
      }

      if (result === 'unavailable') {
        // This path only runs in Expo Go/development builds, so it does not
        // need to expand the end-user translation catalog.
        toast.info('Updates are unavailable in development builds');
      } else if (result === 'downloaded') {
        toast.success(t('Update downloaded. Restart to apply it.'), {
          action: {
            label: t('Restart'),
            onPress: () => void handleRestart(),
          },
        });
      } else {
        toast.success(t('You already have the latest version'));
      }
    } catch (error) {
      console.warn('Failed to check for or download an app update:', error);
      toast.error(t('Unable to update'));
    } finally {
      setIsManualCheckRunning(false);
    }
  };

  const handleShare = async () => {
    try {
      const message = t(
        'Practice gratitude with Tackbok, a simple, free, and private gratitude journaling app',
      );
      // iOS renders rich link previews only for the dedicated url field;
      // Android ignores it, so the link must stay in the message there.
      await Share.share(
        Platform.OS === 'ios'
          ? { message, url: 'https://tackbok.org' }
          : { message: `${message}\nhttps://tackbok.org` },
      );
    } catch (error) {
      console.warn('Failed to open the share sheet:', error);
      toast.error(t('Unknown error'));
    }
  };

  const handleReplayOnboarding = () => {
    setShowReplayOnboardingDialog(false);
    const settings = useSettingsStore.getState();
    settings.setHasCompletedOnboarding(false);
    settings.setHasSeenHomeCoachMarks(false);
    // Home's gate sees the cleared flag and redirects into the flow.
    router.dismissTo('/');
  };

  return (
    <SettingsSection title={t('App Information')}>
      <SettingsRow
        label={t('Share Tackbok')}
        description={t('Share the app with friends and family')}
        icon={Share2}
        onPress={handleShare}
        showChevron
      />
      <SettingsRow
        label={t('FAQ')}
        description={t('Read frequently asked questions')}
        icon={HelpCircle}
        onPress={() => {
          Linking.openURL('https://tackbok.org/faq');
        }}
        isExternalLink
      />
      <SettingsRow
        label={t('Terms & Conditions')}
        description={t('Read our terms and conditions')}
        icon={FileText}
        onPress={() => {
          Linking.openURL('https://tackbok.org/terms');
        }}
        isExternalLink
      />
      <SettingsRow
        label={t('Privacy Policy')}
        description={t('Read our privacy policy')}
        icon={Shield}
        onPress={() => {
          Linking.openURL('https://tackbok.org/privacy');
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
      <SettingsRow
        label={isUpdateBusy ? t('Checking for updates…') : t('Check for updates')}
        description={t('Last checked: {time}', { time: lastUpdateCheckTime })}
        icon={CloudDownload}
        onPress={handleCheckForUpdates}
        disabled={isUpdateBusy}
      />
      {isUpdatePending && (
        <SettingsRow
          label={t('Restart to apply')}
          icon={RefreshCw}
          onPress={handleRestart}
        />
      )}
      <SettingsRow label={t('Version')} description={displayedVersion} icon={Info} />
      <SettingsRow
        label={t('Replay Onboarding')}
        description={t('Run the welcome setup again')}
        icon={RotateCcw}
        onPress={() => setShowReplayOnboardingDialog(true)}
        showChevron
        isLast
      />

      <AlertDialog
        open={showReplayOnboardingDialog}
        onOpenChange={setShowReplayOnboardingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Replay onboarding?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'The welcome setup will start again. Your journal entries and settings are kept.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleReplayOnboarding}>
              <Text>{t('Replay')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
