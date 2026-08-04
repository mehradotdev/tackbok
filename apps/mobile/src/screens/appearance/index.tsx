import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { AppearanceSection } from '~/screens/settings/sections/AppearanceSection';
import { TypographySection } from '~/screens/settings/sections/TypographySection';
import { ThemePickerSheet } from '~/screens/settings/ThemePickerSheet';
import { FontPickerSheet } from '~/screens/settings/FontPickerSheet';

export default function AppearanceScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="flex-row items-center px-safe-or-4 pt-safe-or-3 pb-3 border-b border-border">
          <Button
            onPress={() => router.back()}
            variant="ghost"
            className="p-1 mr-1"
            accessibilityLabel={t('Back')}>
            <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
          </Button>
          <Text variant="h2" className="text-foreground py-1 font-heading">
            {t('Appearance')}
          </Text>
        </View>

        <ScrollView className="px-safe" contentContainerClassName="pt-4">
          <AppearanceSection />
          <TypographySection />
          <View className="h-8" />
        </ScrollView>
      </View>

      <ThemePickerSheet />
      <FontPickerSheet />
    </>
  );
}
