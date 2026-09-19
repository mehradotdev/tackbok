import { useState } from 'react';
import { View, Linking } from 'react-native';
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
import { shareTackbok } from '~/lib/sharing/share-app';

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
      : t('appInfo.never');
  const isUpdateBusy = isManualCheckRunning || isChecking || isDownloading;

  const handleRestart = async () => {
    try {
      await restartToApplyAppUpdate();
    } catch (error) {
      console.warn('Failed to restart to apply the downloaded update:', error);
      toast.error(t('appInfo.unableToUpdate'));
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
        toast.success(t('appInfo.updateDownloadedRestartToApplyIt'), {
          action: {
            label: t('appInfo.restart'),
            onPress: () => void handleRestart(),
          },
        });
      } else {
        toast.success(t('appInfo.youAlreadyHaveTheLatestVersion'));
      }
    } catch (error) {
      console.warn('Failed to check for or download an app update:', error);
      toast.error(t('appInfo.unableToUpdate'));
    } finally {
      setIsManualCheckRunning(false);
    }
  };

  const handleShare = async () => {
    try {
      const message = t(
        'appInfo.practiceGratitudeWithTackbokASimpleFreeAndPrivateGratitude',
      );
      await shareTackbok(message);
    } catch (error) {
      console.warn('Failed to open the share sheet:', error);
      toast.error(t('common.unknownError'));
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
    <SettingsSection title={t('appInfo.appInformation')}>
      <SettingsRow
        label={t('appInfo.shareTackbok')}
        description={t('appInfo.shareTheAppWithFriendsAndFamily')}
        icon={Share2}
        onPress={handleShare}
        showChevron
      />
      <SettingsRow
        label={t('appInfo.faq')}
        description={t('appInfo.readFrequentlyAskedQuestions')}
        icon={HelpCircle}
        onPress={() => {
          Linking.openURL('https://tackbok.org/faq');
        }}
        isExternalLink
      />
      <SettingsRow
        label={t('appInfo.termsConditions')}
        description={t('appInfo.readOurTermsAndConditions')}
        icon={FileText}
        onPress={() => {
          Linking.openURL('https://tackbok.org/terms');
        }}
        isExternalLink
      />
      <SettingsRow
        label={t('appInfo.privacyPolicy')}
        description={t('appInfo.readOurPrivacyPolicy')}
        icon={Shield}
        onPress={() => {
          Linking.openURL('https://tackbok.org/privacy');
        }}
        isExternalLink
      />
      <SettingsRow
        label={t('appInfo.analytics')}
        description={t('appInfo.collectingAnonymizedAnalyticsToHelpDiagnoseProblems')}
        icon={BarChart3}
        onPress={() => setAnalyticsEnabled(!analyticsEnabled)}
        rightElement={
          <View pointerEvents="none">
            <Switch checked={analyticsEnabled} />
          </View>
        }
      />
      <SettingsRow
        label={
          isUpdateBusy ? t('appInfo.checkingForUpdates') : t('appInfo.checkForUpdates')
        }
        description={t('appInfo.lastCheckedTime', { time: lastUpdateCheckTime })}
        icon={CloudDownload}
        onPress={handleCheckForUpdates}
        disabled={isUpdateBusy}
      />
      {isUpdatePending && (
        <SettingsRow
          label={t('appInfo.restartToApply')}
          icon={RefreshCw}
          onPress={handleRestart}
        />
      )}
      <SettingsRow
        label={t('appInfo.version')}
        description={displayedVersion}
        icon={Info}
      />
      <SettingsRow
        label={t('onboarding.replayOnboarding')}
        description={t('onboarding.runTheWelcomeSetupAgain')}
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
            <AlertDialogTitle>{t('onboarding.replayOnboarding2')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('onboarding.theWelcomeSetupWillStartAgainYourJournalEntriesAnd')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('common.cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleReplayOnboarding}>
              <Text>{t('onboarding.replay')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
