import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { NotificationsSection } from './sections/NotificationsSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { JournalingSection } from './sections/JournalingSection';
import { SecuritySection } from './sections/SecuritySection';
import { BackupRestoreSection } from './sections/BackupRestoreSection';
import { AppInfoSection } from './sections/AppInfoSection';
import { DangerZoneSection } from './sections/DangerZoneSection';
import { ThemePickerSheet } from './ThemePickerSheet';
import { JournalFocusAreasSheet } from './JournalFocusAreasSheet';

export default function SettingsScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();

  return (
    <>
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center px-safe-or-4 pt-safe-or-3 pb-3 border-b border-border">
          <Button
            onPress={() => router.back()}
            variant="ghost"
            className="p-1 mr-1"
            accessibilityLabel={t('Back')}>
            <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
          </Button>
          <Text variant="h2" className="text-foreground py-1 font-heading">
            {t('Settings')}
          </Text>
        </View>

        {/* Settings Content */}
        <ScrollView className="px-safe">
          <NotificationsSection />
          <AppearanceSection />
          <JournalingSection />
          <SecuritySection />
          <BackupRestoreSection />
          <AppInfoSection />
          <DangerZoneSection />

          {/* Bottom spacing */}
          <View className="h-8" />
        </ScrollView>
      </View>

      <ThemePickerSheet />
      <JournalFocusAreasSheet />
    </>
  );
}
