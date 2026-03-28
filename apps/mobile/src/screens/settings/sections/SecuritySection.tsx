import { View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { Switch } from '~/components/ui/switch';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '../SettingsRow';

export function SecuritySection() {
  const { t } = useTranslation();
  const { biometricUnlockEnabled, setBiometricUnlockEnabled } = useSettingsStore();

  return (
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
  );
}
