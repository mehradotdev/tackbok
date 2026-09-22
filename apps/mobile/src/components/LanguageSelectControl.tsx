import { useRef, useState } from 'react';
import { I18nManager, Platform } from 'react-native';
import { reloadAppAsync } from 'expo';
import { useTranslation, languages, type LanguageInfo } from '~/lib/i18n';
import { track } from '~/lib/analytics';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';
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
  const changingLanguage = useRef(false);

  const applyLanguage = async (lang: LanguageInfo, restart: boolean) => {
    if (changingLanguage.current) return;
    changingLanguage.current = true;
    try {
      await setLocale(lang.code);
      track('language_changed', { locale: lang.code });
      if (!restart || Platform.OS === 'web') return;

      I18nManager.allowRTL(lang.isRTL);
      I18nManager.forceRTL(lang.isRTL);
      // The save has completed. This delay is only for dismissing the overlay.
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      await reloadAppAsync('Language change confirmed');
    } catch (error) {
      console.warn('Language change failed:', error);
      toast.error(t('common.unknownError'));
    } finally {
      changingLanguage.current = false;
    }
  };

  // Get display name for current preference
  const getCurrentLanguageLabel = (): string => {
    if (localePreference === 'device') {
      return t('settings.deviceDefault');
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
      void applyLanguage(lang, false);
    }
  };

  const handleConfirmLanguageChange = () => {
    if (!pendingLanguage) return;
    const lang = pendingLanguage;
    // Dismiss the dialog before saving; restart only after the save completes.
    setShowConfirmDialog(false);
    setPendingLanguage(null);

    void applyLanguage(lang, true);
  };

  const handleCancelLanguageChange = () => {
    setShowConfirmDialog(false);
    setPendingLanguage(null);
  };

  return (
    <>
      <Select value={currentValue} onValueChange={handleLanguageSelect}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={t('settings.selectLanguage')} />
        </SelectTrigger>
        <SelectContent className="min-w-[220px]">
          <NativeSelectScrollView className="max-h-72">
            {/* Device Default Option - only show if device language is supported */}
            {isDeviceDefaultLocaleSupported && deviceDefaultLocale && (
              <SelectItem value="device" label={t('settings.deviceDefault')} />
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
            <AlertDialogTitle>{t('settings.restartRequired')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.languageChangeRequiresAppRestartProceed')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={handleCancelLanguageChange}>
              <Text>{t('common.cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={handleConfirmLanguageChange}>
              <Text>{t('settings.proceed')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
