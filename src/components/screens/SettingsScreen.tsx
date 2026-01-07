import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, ChevronDown, Check } from 'lucide-react-native';
import { useTranslation, languages, type LocalePreference } from '~/lib/i18n';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

export default function SettingsScreen() {
  const router = useRouter();
  const { t, localePreference, setLocale, isRTL } = useTranslation();

  // Get display name for current preference
  const getCurrentLanguageDisplay = () => {
    if (localePreference === 'device') {
      return t('Device Default');
    }
    const lang = languages.find((l) => l.code === localePreference);
    return lang?.nativeName || 'English';
  };

  const handleLanguageSelect = (preference: LocalePreference) => {
    setLocale(preference);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Pressable>
        <Text variant="h2" className="text-foreground">
          {t('Settings')}
        </Text>
      </View>

      {/* Settings Content */}
      <View className="flex-1 px-4 py-4">
        {/* Language Setting */}
        <View className="flex-row items-center justify-between py-3">
          <Text className="text-base text-foreground">{t('Language')}</Text>

          <DropdownMenu>
            <DropdownMenuTrigger>
              <View className="flex-row items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                <Text className="text-foreground">{getCurrentLanguageDisplay()}</Text>
                <Icon as={ChevronDown} size={16} className="text-muted-foreground" />
              </View>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-background min-w-[180px]">
              {/* Device Default Option */}
              <DropdownMenuItem onPress={() => handleLanguageSelect('device')}>
                <View className="flex-row items-center justify-between flex-1">
                  <Text className="text-foreground">{t('Device Default')}</Text>
                  {localePreference === 'device' && (
                    <Icon as={Check} size={16} className="text-primary-foreground" />
                  )}
                </View>
              </DropdownMenuItem>

              {/* Language Options */}
              {languages.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onPress={() => handleLanguageSelect(lang.code)}>
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
      </View>
    </SafeAreaView>
  );
}
