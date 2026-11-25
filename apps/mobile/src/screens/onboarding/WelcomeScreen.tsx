import type { TranslationKey } from '~/lib/i18n';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { View } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Cloud, FileInput, ShieldCheck, X } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { hasAnyEntries } from '~/db/queries';
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
import { useNavigateOnce } from './useNavigateOnce';

const APP_VERSION =
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '';

/** Labels shown under each font-size tile (mirrors Settings → Typography). */
const SIZE_LABELS: Record<BodyFontSize, TranslationKey> = {
  small: 'typography.small',
  default: 'typography.default',
  large: 'typography.large',
};

const TILE_PREVIEW_SIZE: Record<BodyFontSize, number> = {
  small: 16,
  default: 20,
  large: 24,
};

function ImportSourceSheet({
  onSelectSource,
}: {
  onSelectSource: (source: BackupImportSource | 'google-drive') => void;
}) {
  const { t } = useTranslation();
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  const sources: {
    source: BackupImportSource | 'google-drive';
    label: string;
    description: string;
    icon: ComponentType;
  }[] = [
    {
      source: 'google-drive',
      label: t('backup.googleDriveBackup'),
      description: t('cloud.restoreFromYourCloudBackup'),
      icon: Cloud,
    },
    {
      source: 'tackbok',
      label: t('onboarding.tackbokBackup'),
      description: t('backup.restoreYourDataFromAZipFile'),
      icon: FileInput,
    },
    {
      source: 'gratitudeApp',
      label: t('onboarding.gratitudeApp'),
      description: t('backup.importDataFromAGratitudeAppZipBackup'),
      icon: GratitudeJournalLogoIcon,
    },
    {
      source: 'presently',
      label: t('onboarding.presentlyApp'),
      description: t('backup.restoreYourDataFromAPresentlyCsvFile'),
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
      backgroundStyle={{ backgroundColor: backgroundColor as string }}>
      <View className="bg-background pt-2 pb-8">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
          <Text className="text-xl font-body-bold text-foreground">
            {t('onboarding.importYourJournal')}
          </Text>
          <Button
            onPress={() => TrueSheet.dismiss(SHEET_NAMES.ONBOARDING_IMPORT)}
            variant="ghost"
            className="p-1 -mr-2"
            accessibilityLabel={t('common.close')}>
            <Icon as={X} className="text-foreground" />
          </Button>
        </View>

        <Text className="px-5 pb-3 text-sm text-muted-foreground">
          {t('onboarding.whereIsYourJournalComingFrom')}
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
  const reopenImportSheet = useRef(false);
  const navigateOnce = useNavigateOnce();

  useFocusEffect(
    useCallback(() => {
      if (!reopenImportSheet.current) return;
      reopenImportSheet.current = false;
      // A Drive restore that went through is on its way past this screen.
      if (useSettingsStore.getState().hasCompletedOnboarding) return;
      void TrueSheet.present(SHEET_NAMES.ONBOARDING_IMPORT);
    }, []),
  );

  useOnboardingStepView('welcome');

  const handleImportDone = useCallback(
    (source: BackupImportSource) => {
      if (source === 'tackbok') {
        // A Tackbok backup restores the profile (name, email, photo) but not
        // the theme or focus areas, so only the name step is skipped, and only
        // when the backup brought a name.
        router.push(
          useSettingsStore.getState().profileName
            ? '/onboarding/theme'
            : '/onboarding/name',
        );
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

  // Skip or overwrite only matters for entries and a profile already here
  // (Skip keeps the current profile). On a first run both are empty, so
  // import straight away; a replay with either still asks.
  const [askModeFor, setAskModeFor] = useState<PendingImportSelection | null>(null);
  useEffect(() => {
    if (!pendingImportSelection) return;
    let cancelled = false;
    const { profileName, profileEmail, profileImageUri } = useSettingsStore.getState();
    const hasProfile = Boolean(profileName || profileEmail || profileImageUri);
    hasAnyEntries()
      .catch(() => true)
      .then((hasEntries) => {
        if (cancelled) return;
        if (hasEntries || hasProfile) setAskModeFor(pendingImportSelection);
        else void runPendingImport('skip');
      });
    return () => {
      cancelled = true;
    };
  }, [pendingImportSelection, runPendingImport]);

  const handleSelectImportSource = useCallback(
    async (source: BackupImportSource | 'google-drive') => {
      await TrueSheet.dismiss(SHEET_NAMES.ONBOARDING_IMPORT);
      if (source === 'google-drive') {
        reopenImportSheet.current = true;
        router.push('/cloud-backup?origin=onboarding' as Href);
      } else if (source === 'presently') {
        await startPresentlyImport();
      } else {
        await selectImportFile(source as PendingImportSelection['source']);
      }
    },
    [router, selectImportFile, startPresentlyImport],
  );

  return (
    <OnboardingScaffold
      overlays={
        <>
          <ImportSourceSheet onSelectSource={handleSelectImportSource} />

          <SettingsImportModeModal
            visible={askModeFor !== null && askModeFor === pendingImportSelection}
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
            onPress={() => navigateOnce(() => router.push('/onboarding/name'))}>
            <Text className="text-lg">{t('onboarding.getStarted')}</Text>
          </Button>
          <Button
            variant="link"
            onPress={() => TrueSheet.present(SHEET_NAMES.ONBOARDING_IMPORT)}>
            <Text className="text-sm text-muted-foreground">
              {t('onboarding.alreadyHaveAJournalImportIt')}
            </Text>
          </Button>
          <Text className="text-xs text-muted-foreground text-center">
            {t('onboarding.welcome.version', { version: APP_VERSION })}
          </Text>
        </View>
      }>
      {/* Logo + value prop */}
      <View className="items-center pt-6 pb-2">
        <TackbokLogoThemed />
        <Text variant="h1" className="text-foreground mt-4">
          {t('common.tackbok')}
        </Text>
        <Text className="text-base text-muted-foreground text-center mt-2 px-4">
          {t('onboarding.aPrivatePlaceForYourGratitudeFreeOfflineYours')}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-3 px-4">
          <Icon as={ShieldCheck} className="text-muted-foreground size-4" />
          <Text className="shrink text-sm text-muted-foreground">
            {t('cloud.yourJournalStaysOnYourDeviceCloudBackupIsOptional')}
          </Text>
        </View>
      </View>

      {/* "Make it readable for me" controls */}
      <View className="mt-6 gap-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-body-medium text-foreground">
            {t('settings.language')}
          </Text>
          <LanguageSelectControl triggerClassName="min-w-[160px]" />
        </View>

        <View>
          <Text className="text-base font-body-medium text-foreground mb-2">
            {t('typography.fontSize')}
          </Text>
          <View
            className="flex-row gap-3 justify-start"
            accessibilityRole="radiogroup"
            accessibilityLabel={t('typography.fontSize')}>
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
