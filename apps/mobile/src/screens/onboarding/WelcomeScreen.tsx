import { useCallback, type ComponentType } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { FileInput, ShieldCheck, X } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { BODY_FONT_SIZES, type BodyFontSize } from '~/lib/theme/typography';
import {
  useBackupImportFlow,
  type PendingImportSelection,
} from '~/hooks/useBackupImportFlow';
import { type BackupImportSource } from '~/lib/backupImport';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { TackbokLogo } from '~/components/TackbokLogo';
import { LanguageSelectControl } from '~/components/LanguageSelectControl';
import {
  GratitudeJournalLogoIcon,
  PresentlyLogoIcon,
} from '~/components/ImportSourceIcons';
import { SettingsImportModeModal } from '~/screens/settings/SettingsImportModeModal';
import { SettingsImportProgressModal } from '~/screens/settings/SettingsImportProgressModal';
import { SettingsImportSummaryModal } from '~/screens/settings/SettingsImportSummaryModal';
import { OnboardingScaffold } from './OnboardingScaffold';
import { useOnboardingStepView } from './useOnboardingStepView';

/** Labels shown under each font-size tile (mirrors Settings → Typography). */
const SIZE_LABELS: Record<BodyFontSize, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
};

const TILE_PREVIEW_SIZE: Record<BodyFontSize, number> = {
  small: 16,
  default: 20,
  large: 24,
};

function ImportSourceSheet({
  onSelectSource,
}: {
  onSelectSource: (source: BackupImportSource) => void;
}) {
  const { t } = useTranslation();
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  const sources: {
    source: BackupImportSource;
    label: string;
    description: string;
    icon: ComponentType;
  }[] = [
    {
      source: 'tackbok',
      label: t('Tackbok Backup'),
      description: t('Restore your data from a .zip file'),
      icon: FileInput,
    },
    {
      source: 'gratitudeApp',
      label: t('Gratitude App'),
      description: t('Import data from a Gratitude App .zip backup'),
      icon: GratitudeJournalLogoIcon,
    },
    {
      source: 'presently',
      label: t('Presently App'),
      description: t('Restore your data from a Presently .csv file'),
      icon: PresentlyLogoIcon,
    },
  ];

  return (
    <TrueSheet
      name={SHEET_NAMES.ONBOARDING_IMPORT}
      detents={['auto']}
      cornerRadius={sheetRadius}
      grabber={true}
      grabberOptions={{ topMargin: 8, color: mutedFgColor as string, adaptive: false }}
      backgroundColor={backgroundColor as string}>
      <View className="bg-background pt-2 pb-8">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
          <Text className="text-xl font-body-bold text-foreground">
            {t('Import your journal')}
          </Text>
          <Button
            onPress={() => TrueSheet.dismiss(SHEET_NAMES.ONBOARDING_IMPORT)}
            variant="ghost"
            className="p-1 -mr-2"
            accessibilityLabel={t('Close')}>
            <Icon as={X} className="text-foreground" />
          </Button>
        </View>

        <Text className="px-5 pb-3 text-sm text-muted-foreground">
          {t('Where is your journal coming from?')}
        </Text>

        <View className="mx-4 bg-card rounded-lg border border-border overflow-hidden">
          {sources.map((item, index) => (
            <Button
              key={item.source}
              variant="ghost"
              size="none"
              onPress={() => onSelectSource(item.source)}
              className={cn(
                'w-full flex-row items-center justify-start h-auto px-4 py-3 rounded-none',
                index < sources.length - 1 && 'border-b border-border',
              )}>
              <View className="mr-3">
                <Icon as={item.icon} className="text-foreground size-6" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-body-semibold text-foreground">
                  {item.label}
                </Text>
                <Text className="text-sm text-muted-foreground mt-0.5">
                  {item.description}
                </Text>
              </View>
            </Button>
          ))}
        </View>
      </View>
    </TrueSheet>
  );
}

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const bodyFontSize = useSettingsStore((s) => s.bodyFontSize);
  const setBodyFontSize = useSettingsStore((s) => s.setBodyFontSize);

  useOnboardingStepView('welcome');

  const handleImportDone = useCallback(
    (source: BackupImportSource) => {
      if (source === 'tackbok') {
        // A Tackbok backup also restores profile settings — re-asking for
        // name/theme/focus areas would overwrite what was just restored.
        router.push('/onboarding/privacy');
      } else {
        // Presently / Gratitude App bring entries only; continue the full flow.
        router.push('/onboarding/name');
      }
    },
    [router],
  );

  const {
    importProgress,
    importSummary,
    pendingImportSelection,
    selectImportFile,
    runPendingImport,
    startPresentlyImport,
    clearPendingImport,
    closeImportSummary,
  } = useBackupImportFlow(handleImportDone);

  const handleSelectImportSource = useCallback(
    async (source: BackupImportSource) => {
      await TrueSheet.dismiss(SHEET_NAMES.ONBOARDING_IMPORT);
      if (source === 'presently') {
        await startPresentlyImport();
      } else {
        await selectImportFile(source as PendingImportSelection['source']);
      }
    },
    [selectImportFile, startPresentlyImport],
  );

  return (
    <OnboardingScaffold
      overlays={
        <>
          <ImportSourceSheet onSelectSource={handleSelectImportSource} />

          <SettingsImportModeModal
            visible={pendingImportSelection !== null}
            onClose={clearPendingImport}
            onSelectMode={runPendingImport}
          />
          <SettingsImportProgressModal
            visible={importProgress !== null}
            progress={importProgress}
          />
          <SettingsImportSummaryModal
            visible={importSummary !== null}
            source={importSummary?.source ?? null}
            summary={importSummary?.summary ?? null}
            onDone={closeImportSummary}
          />
        </>
      }
      footer={
        <View className="gap-1">
          <Button
            variant="primary"
            size="lg"
            onPress={() => router.push('/onboarding/name')}>
            <Text className="text-lg">{t('Get started')}</Text>
          </Button>
          <Button
            variant="link"
            onPress={() => TrueSheet.present(SHEET_NAMES.ONBOARDING_IMPORT)}>
            <Text className="text-sm text-muted-foreground">
              {t('Already have a journal? Import it')}
            </Text>
          </Button>
        </View>
      }>
      {/* Logo + value prop */}
      <View className="items-center pt-6 pb-2">
        <TackbokLogoThemed />
        <Text variant="h1" className="text-foreground mt-4">
          Tackbok
        </Text>
        <Text className="text-base text-muted-foreground text-center mt-2 px-4">
          {t('A private place for your gratitude. Free, offline, yours.')}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-3">
          <Icon as={ShieldCheck} className="text-muted-foreground size-4" />
          <Text className="text-sm text-muted-foreground">
            {t('Your journal stays on your device.')}
          </Text>
        </View>
      </View>

      {/* "Make it readable for me" controls */}
      <View className="mt-6 gap-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-body-medium text-foreground">
            {t('Language')}
          </Text>
          <LanguageSelectControl triggerClassName="min-w-[160px]" />
        </View>

        <View>
          <Text className="text-base font-body-medium text-foreground mb-2">
            {t('Font Size')}
          </Text>
          <View
            className="flex-row gap-3 justify-start"
            accessibilityRole="radiogroup"
            accessibilityLabel={t('Font Size')}>
            {BODY_FONT_SIZES.map((size) => {
              const isActive = bodyFontSize === size;
              return (
                <Button
                  key={size}
                  variant="ghost"
                  size="none"
                  onPress={() => setBodyFontSize(size)}
                  role="radio"
                  accessibilityRole="radio"
                  accessibilityLabel={t(SIZE_LABELS[size])}
                  accessibilityState={{ selected: isActive }}
                  className={cn(
                    'flex-1 flex-col items-center justify-center rounded-lg py-2.5',
                    isActive
                      ? 'bg-primary/15 border-2 border-ring'
                      : 'bg-card border-2 border-transparent',
                  )}>
                  <Text
                    className="text-foreground mb-0.5 font-body-semibold"
                    style={{ fontSize: TILE_PREVIEW_SIZE[size] }}>
                    Aa
                  </Text>
                  <Text className="text-xs text-muted-foreground font-body-medium">
                    {t(SIZE_LABELS[size])}
                  </Text>
                </Button>
              );
            })}
          </View>
        </View>
      </View>

    </OnboardingScaffold>
  );
}

/** Logo tinted with the current theme's foreground color. */
function TackbokLogoThemed() {
  const [colorForeground] = useCSSVariable(['--color-foreground']);
  return <TackbokLogo size={88} color={colorForeground as string} />;
}
