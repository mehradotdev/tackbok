import { useState } from 'react';
import { View, I18nManager, Platform } from 'react-native';
import { reloadAppAsync } from 'expo';
import { ChevronDown, Check } from 'lucide-react-native';
import { useTranslation, languages, type LanguageInfo } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
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

export default function SettingsLanguageComp() {
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
  const getCurrentLanguageDisplay = () => {
    if (localePreference === 'device') {
      return t('Device Default');
    }
    const lang = languages.find((l) => l.code === localePreference);
    return lang?.nativeName || 'English';
  };

  // Get display name for device default. If not supported, use English.
  const deviceDefaultLangInfo = (): LanguageInfo => {
    const baseLang =
      languages.find((l) => l.code === deviceDefaultLocale) ||
      ({
        code: 'en',
        displayName: 'English',
        nativeName: 'English',
        isRTL: false,
      } as LanguageInfo);

    return { ...baseLang, code: 'device' };
  };

  // Check if changing to this language would require an app restart (RTL change)
  const willRequireRestart = (lang: LanguageInfo): boolean => {
    const currentIsRTL = I18nManager.isRTL;
    return lang.isRTL !== currentIsRTL;
  };

  const handleLanguageSelect = (lang: LanguageInfo) => {
    // Check if this change requires a restart
    if (willRequireRestart(lang)) {
      // Show confirmation dialog
      setPendingLanguage(lang);
      setShowConfirmDialog(true);
    } else {
      // Apply change immediately
      setLocale(lang.code);
    }
  };

  const handleConfirmLanguageChange = () => {
    if (!pendingLanguage) return;
    // Update the locale preference
    setLocale(pendingLanguage.code);
    setShowConfirmDialog(false);
    setPendingLanguage(null);

    // Configure I18nManager for RTL if needed (only on native platforms)
    if (Platform.OS === 'web') return;
    const shouldBeRTL = pendingLanguage.isRTL;
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);

    // Reload app for RTL changes to take effect
    // Note: Per Expo docs, I18nManager changes require app restart
    reloadAppAsync('Language change confirmed');
  };

  const handleCancelLanguageChange = () => {
    setShowConfirmDialog(false);
    setPendingLanguage(null);
  };

  return (
    <>
      <View className="flex-row items-center justify-between py-3">
        <Text className="text-base text-foreground">{t('Language')}</Text>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <View className="flex-row items-center gap-2 px-3 py-2 rounded-lg bg-muted">
              <Text className="text-foreground">{getCurrentLanguageDisplay()}</Text>
              <Icon as={ChevronDown} size={16} className="text-muted-foreground" />
            </View>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="bg-background min-w-[220px]"
            scrollable
            maxScrollableHeight={300}>
            {/* Device Default Option - only show if device language is supported */}
            {isDeviceDefaultLocaleSupported && deviceDefaultLocale && (
              <DropdownMenuItem
                onPress={() => handleLanguageSelect(deviceDefaultLangInfo())}>
                <View className="flex-row items-center justify-between flex-1">
                  <Text className="text-foreground">{t('Device Default')}</Text>
                  {localePreference === 'device' && (
                    <Icon as={Check} size={16} className="text-primary-foreground" />
                  )}
                </View>
              </DropdownMenuItem>
            )}

            {/* Language Options */}
            {languages.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onPress={() => handleLanguageSelect(lang)}>
                <View className="flex-row items-center justify-between flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-foreground">{lang.nativeName}</Text>
                    <Text className="text-muted-foreground text-sm">
                      ({lang.displayName})
                    </Text>
                  </View>
                  {localePreference === lang.code && (
                    <Icon as={Check} size={16} className="text-primary-foreground" />
                  )}
                </View>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </View>

      {/* Language Change Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
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
