import { View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { authenticate, canUseDeviceAuth, useAppLockStore } from '~/lib/appLock';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/components/ui/toast';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '~/components/SettingsRow';

export function SecuritySection() {
  const { t } = useTranslation();
  const { biometricUnlockEnabled, setBiometricUnlockEnabled } = useSettingsStore();

  const handleToggle = async () => {
    const prompt = {
      promptMessage: t('Unlock Tackbok'),
      cancelLabel: t('Cancel'),
    };

    if (biometricUnlockEnabled) {
      // Standard hardening: disabling the lock requires proving it's you too.
      if (await authenticate(prompt)) {
        setBiometricUnlockEnabled(false);
        useAppLockStore.getState().unlock();
      }
      return;
    }

    if (!(await canUseDeviceAuth())) {
      toast.warning(t('App lock unavailable'), {
        description: t(
          'Set up a screen lock (PIN, pattern, or biometrics) in your device settings first.',
        ),
      });
      return;
    }

    // Require one successful authentication before persisting the setting,
    // so a broken/cancelled prompt can never lock the user out of the app.
    if (await authenticate(prompt)) {
      setBiometricUnlockEnabled(true);
      useAppLockStore.getState().unlock();
    }
  };

  return (
    <SettingsSection title={t('Security')}>
      <SettingsRow
        label={t('Unlock Tackbok')}
        description={t('Lock with your device screen lock')}
        icon={Fingerprint}
        isLast
        onPress={() => void handleToggle()}
        rightElement={
          <View pointerEvents="none">
            <Switch checked={biometricUnlockEnabled} />
          </View>
        }
      />
    </SettingsSection>
  );
}
