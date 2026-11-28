import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { SHEET_NAMES } from '~/constants';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { AppearanceSection } from '~/screens/settings/sections/AppearanceSection';
import { TypographySection } from '~/screens/settings/sections/TypographySection';
import { TimelineSection } from '~/screens/settings/sections/TimelineSection';
import { ThemePickerSheet } from '~/screens/settings/ThemePickerSheet';
import { FontPickerSheet } from '~/screens/settings/FontPickerSheet';
import { AppIconPickerSheet } from '~/screens/settings/AppIconPickerSheet';

export default function AppearanceScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  // "See the new themes" in What's new opens the theme picker straight away.
  const { open } = useLocalSearchParams<{ open?: string }>();
  useEffect(() => {
    if (open !== 'themes') return;
    // After the push transition, so the sheet presents over a settled screen.
    const timer = setTimeout(() => {
      void TrueSheet.present(SHEET_NAMES.THEME_PICKER).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="flex-row items-center px-safe-or-4 pt-safe-or-3 pb-3 border-b border-border">
          <Button
            onPress={() => router.back()}
            variant="ghost"
            className="p-1 mr-1"
            accessibilityLabel={t('common.back')}>
            <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
          </Button>
          <Text variant="h2" className="text-foreground py-1 font-heading">
            {t('appearance.appearance')}
          </Text>
        </View>

        <ScrollView className="px-safe" contentContainerClassName="pt-4">
          <AppearanceSection />
          <TypographySection />
          <TimelineSection />
          <View className="h-8" />
        </ScrollView>
      </View>

      <ThemePickerSheet />
      <FontPickerSheet />
      <AppIconPickerSheet />
    </>
  );
}
