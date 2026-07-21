import { useState } from 'react';
import { View, Linking } from 'react-native';
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
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '../SettingsRow';

export function AppInfoSection() {
  const { t } = useTranslation();
  const { analyticsEnabled, setAnalyticsEnabled } = useSettingsStore();
  const [isManualCheckRunning, setIsManualCheckRunning] = useState(false);
  const { isChecking, isDownloading, isUpdatePending } = useAppUpdates();

  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const buildVersion = Application.nativeBuildVersion;
  const displayedVersion = buildVersion ? `${appVersion} (${buildVersion})` : appVersion;
  const isUpdateBusy = isManualCheckRunning || isChecking || isDownloading;

  const handleCheckForUpdates = async () => {
    setIsManualCheckRunning(true);
    try {
      const result = await checkForAppUpdate();

      if (result === 'unavailable') {
        // This path only runs in Expo Go/development builds, so it does not
        // need to expand the end-user translation catalog.
        toast.info('Updates are unavailable in development builds');
      } else if (result === 'downloaded') {
        toast.success(t('Update downloaded. Restart to apply it.'));
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

  const handleRestart = async () => {
    try {
      await restartToApplyAppUpdate();
    } catch (error) {
      console.warn('Failed to restart to apply the downloaded update:', error);
      toast.error(t('Unable to update'));
    }
  };

  return (
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
      <SettingsRow
        label={t('Version')}
        description={displayedVersion}
        icon={Info}
        isLast
      />
    </SettingsSection>
  );
}
