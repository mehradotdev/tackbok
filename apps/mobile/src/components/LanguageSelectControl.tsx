import { useState } from 'react';
import { I18nManager, Platform } from 'react-native';
import { reloadAppAsync } from 'expo';
import { useTranslation, languages, type LanguageInfo } from '~/lib/i18n';
import { track } from '~/lib/analytics';
import { Text } from '~/components/ui/text';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  NativeSelectScrollView,
  type Option,
} from '~/components/ui/select';
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

const getLanguageLabel = (language: LanguageInfo): string =>
  `${language.displayName} (${language.nativeName})`;

/**
 * Language dropdown + RTL restart confirmation dialog.
 *
 * Single code path for changing the app language — used by the Settings
 * language row and the onboarding Welcome screen. Switching to/from an RTL
 * locale requires an app reload (I18nManager changes only apply on restart).
 */
export function LanguageSelectControl({
  triggerClassName = 'min-w-[180px]',
}: {
  triggerClassName?: string;
}) {
  const {
    t,
    localePreference,
    setLocale,
    deviceDefaultLocale,
    isDeviceDefaultLocaleSupported,
  } = useTranslation();

  // State for confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<LanguageInfo | null>(null);

  // Get display name for current preference
  const getCurrentLanguageLabel = (): string => {
    if (localePreference === 'device') {
      return t('Device Default');
    }
    const lang = languages.find((l) => l.code === localePreference);
    return lang ? getLanguageLabel(lang) : 'English';
  };

  // Get LanguageInfo from a language code
  const getLanguageInfo = (code: string): LanguageInfo | null => {
    if (code === 'device') {
      // Return device default lang info
      const baseLang =
        languages.find((l) => l.code === deviceDefaultLocale) ||
        ({
          code: 'en',
          displayName: 'English',
          nativeName: 'English',
          isRTL: false,
        } as LanguageInfo);
      return { ...baseLang, code: 'device' };
    }
    return languages.find((l) => l.code === code) || null;
  };

  // Current value for the Select component
  const currentValue: Option = {
    value: localePreference,
    label: getCurrentLanguageLabel(),
  };

  // Check if changing to this language would require an app restart (RTL change)
  const willRequireRestart = (lang: LanguageInfo): boolean => {
    const currentIsRTL = I18nManager.isRTL;
    return lang.isRTL !== currentIsRTL;
  };

  const handleLanguageSelect = (option: Option) => {
    if (!option) return;

    const lang = getLanguageInfo(option.value);
    if (!lang) return;

    // Check if this change requires a restart
    if (willRequireRestart(lang)) {
      // Show confirmation dialog
      setPendingLanguage(lang);
      setShowConfirmDialog(true);
    } else {
      // Apply change immediately
      setLocale(lang.code);
      track('language_changed', { locale: lang.code });
    }
  };

  const handleConfirmLanguageChange = () => {
    if (!pendingLanguage) return;
    const shouldBeRTL = pendingLanguage.isRTL;
    // Update the locale preference
    setLocale(pendingLanguage.code);
    track('language_changed', { locale: pendingLanguage.code });

    // Close the dialog first, then reload after a short delay.
    // reloadAppAsync() fires synchronously, so if we call it before
    // the native overlay has been dismissed, the dialog stays stuck
    // on screen after reload and both buttons become unresponsive.
    setShowConfirmDialog(false);
    setPendingLanguage(null);

    // Configure I18nManager for RTL if needed (only on native platforms)
    if (Platform.OS === 'web') return;
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);

    // Reload app for RTL changes to take effect
    // Note: Per Expo docs, I18nManager changes require app restart
    // Give the dialog's native overlay time to fully dismiss before reloading
    setTimeout(() => {
      reloadAppAsync('Language change confirmed');
    }, 500);
  };

  const handleCancelLanguageChange = () => {
    setShowConfirmDialog(false);
    setPendingLanguage(null);
  };

  return (
    <>
      <Select value={currentValue} onValueChange={handleLanguageSelect}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={t('Select Language')} />
        </SelectTrigger>
        <SelectContent className="min-w-[220px]">
          <NativeSelectScrollView className="max-h-72">
            {/* Device Default Option - only show if device language is supported */}
            {isDeviceDefaultLocaleSupported && deviceDefaultLocale && (
              <SelectItem value="device" label={t('Device Default')} />
            )}

            {/* Language Options */}
            {[...languages]
              .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en'))
              .map((lang) => (
                <SelectItem
                  key={lang.code}
                  value={lang.code}
                  label={getLanguageLabel(lang)}
                />
              ))}

            {/* Promotional placeholder — Hindi translations are not available yet. */}
            <SelectItem value="hi-coming-soon" label="Hindi (हिन्दी) — SOON" disabled />
          </NativeSelectScrollView>
        </SelectContent>
      </Select>

      {/* Language Change Confirmation Dialog */}
      <AlertDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        dismissible={true}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Restart Required')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Language change requires app restart. Proceed?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={handleCancelLanguageChange}>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleConfirmLanguageChange}>
              <Text>{t('Proceed')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
