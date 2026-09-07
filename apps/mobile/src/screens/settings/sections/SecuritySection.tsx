import { View } from 'react-native';
import { Fingerprint, Timer } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { authenticate, canUseDeviceAuth, useAppLockStore } from '~/lib/appLock';
import { normalizeAppLockDelay } from '~/lib/appLockSession';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/components/ui/toast';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '~/components/SettingsRow';

const LOCK_DELAY_OPTIONS = [
  { value: '0', label: '0 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
];

export function SecuritySection() {
  const { t } = useTranslation();
  const { biometricUnlockEnabled, setBiometricUnlockEnabled,
    appLockDelaySeconds, setAppLockDelaySeconds } = useSettingsStore();
  const delay = normalizeAppLockDelay(appLockDelaySeconds);
  const selected = LOCK_DELAY_OPTIONS.find(option => option.value === String(delay))!;

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
        isLast={!biometricUnlockEnabled}
        onPress={() => void handleToggle()}
        rightElement={
          <View pointerEvents="none">
            <Switch checked={biometricUnlockEnabled} />
          </View>
        }
      />
      {biometricUnlockEnabled && (
        <SettingsRow
          label={t('Lock after')}
          description={t('Time away from the app before requiring an unlock.')}
          icon={Timer}
          isLast
          rightElement={
            <Select
              value={{ value: selected.value, label: t(selected.label) }}
              onValueChange={(option) => {
                if (option) setAppLockDelaySeconds(normalizeAppLockDelay(Number(option.value)));
              }}>
              <SelectTrigger className="min-w-30" accessibilityLabel={t('Lock after')}>
                <SelectValue placeholder={t('0 seconds')} />
              </SelectTrigger>
              <SelectContent className="min-w-45">
                {LOCK_DELAY_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value} label={t(option.label)} />
                ))}
              </SelectContent>
            </Select>
          }
        />
      )}
    </SettingsSection>
  );
}
