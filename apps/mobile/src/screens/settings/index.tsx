import { Platform, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';
import { NotificationsSection } from './sections/NotificationsSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { SecuritySection } from './sections/SecuritySection';
import { BackupRestoreSection } from './sections/BackupRestoreSection';
import { AppInfoSection } from './sections/AppInfoSection';
import { DangerZoneSection } from './sections/DangerZoneSection';
import { ThemePickerSheet } from './ThemePickerSheet';

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <>
      <View collapsable={false} className="flex-1 bg-background">
        {/* Grabber — MD3 drag handle (32×4dp, centered) */}
        <View className="items-center pt-2">
          <View
            style={{ width: 32, height: 4, borderRadius: 2 }}
            className="bg-muted-foreground"
          />
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between px-safe-or-4 pt-4 pb-3 border-b border-border">
          <Text variant="h2" className="text-foreground py-1 font-heading">
            {t('Settings')}
          </Text>
          <Button
            onPress={() => router.back()}
            variant="ghost"
            className="p-1 ml-1"
            accessibilityLabel={t('Close')}>
            <Icon as={X} className="text-foreground" />
          </Button>
        </View>

        {/* Settings Content */}
        <ScrollView className="px-safe" nestedScrollEnabled>
          <NotificationsSection />
          <AppearanceSection />
          <SecuritySection />
          <BackupRestoreSection />
          <AppInfoSection />
          <DangerZoneSection />

          {/* Bottom spacing */}
          <View className="h-8" />
        </ScrollView>
      </View>

      <ThemePickerSheet />
    </>
  );
}
