import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import SettingsLanguageComp from '~/screens/settings/SettingsLanguageComp';

export default function SettingsScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="mr-3">
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Pressable>
        <Text variant="h2" className="text-foreground py-1">
          {t('Settings')}
        </Text>
      </View>

      {/* Settings Content */}
      <View className="flex-1 px-4 py-4">
        {/* Language Setting */}
        <SettingsLanguageComp />
      </View>
    </SafeAreaView>
  );
}
