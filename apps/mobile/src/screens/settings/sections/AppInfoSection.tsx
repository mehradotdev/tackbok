import { View, Linking } from 'react-native';
import Constants from 'expo-constants';
import {
  Share2,
  HelpCircle,
  FileText,
  Shield,
  BarChart3,
  Info,
} from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Switch } from '~/components/ui/switch';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '../SettingsRow';

export function AppInfoSection() {
  const { t } = useTranslation();
  const { analyticsEnabled, setAnalyticsEnabled } = useSettingsStore();

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

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
      <SettingsRow label={t('Version')} description={appVersion} icon={Info} isLast />
    </SettingsSection>
  );
}
