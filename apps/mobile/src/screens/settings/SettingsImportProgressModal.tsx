import { ActivityIndicator, View } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { type BackupImportProgress } from '~/lib/backupImport';
import { Text } from '~/components/ui/text';
import { Dialog, DialogContent } from '~/components/ui/dialog';

interface SettingsImportProgressModalProps {
  visible: boolean;
  progress: BackupImportProgress | null;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled BackupImportPhase: ${String(value)}`);
}

export function SettingsImportProgressModal({
  visible,
  progress,
}: SettingsImportProgressModalProps) {
  const { t } = useTranslation();

  if (!visible || !progress) return null;

  // Keep the text label truthful while giving the bar a small visible minimum once work starts.
  const displayPercent = Math.min(100, Math.max(0, Math.round(progress.progress * 100)));
  const barPercent = displayPercent > 0 ? Math.max(6, displayPercent) : 0;
  const skippedMediaCount = progress.failedAssets + progress.failedProfileAssets;
  const stats = [
    progress.totalEntries > 0
      ? {
          label: t('backup.entriesProcessed'),
          value: `${progress.processedEntries}/${progress.totalEntries}`,
        }
      : null,
    progress.importedTags > 0
      ? { label: t('backup.tagsAdded'), value: String(progress.importedTags) }
      : null,
    progress.importedPrompts > 0
      ? { label: t('backup.promptsAdded'), value: String(progress.importedPrompts) }
      : null,
    progress.importedPhotos > 0
      ? { label: t('backup.photosRestored'), value: String(progress.importedPhotos) }
      : null,
    progress.importedAudio > 0
      ? { label: t('backup.voiceMemosRestored'), value: String(progress.importedAudio) }
      : null,
    progress.failedEntries > 0
      ? {
          label: t('backup.entriesSkippedDueToErrors'),
          value: String(progress.failedEntries),
        }
      : null,
    skippedMediaCount > 0
      ? { label: t('backup.mediaSkipped'), value: String(skippedMediaCount) }
      : null,
  ].filter((stat): stat is { label: string; value: string } => stat !== null);

  return (
    <Dialog open={visible} dismissible={false}>
      <DialogContent
        className="w-full max-w-lg rounded-[28px] px-5 py-6"
        showCloseButton={false}>
        <View className="gap-5">
          <View className="items-start gap-4">
            <View className="size-12 items-center justify-center rounded-full bg-primary/10">
              <ActivityIndicator size="small" />
            </View>

            <View className="gap-2">
              <Text className="text-xl font-heading text-foreground">
                {getImportTitle(progress.source, t)}
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                {getCurrentDetail(progress, t)}
              </Text>
            </View>
          </View>

          <View className="gap-2">
            <View className="h-2 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${barPercent}%` }}
              />
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-body-semibold text-foreground">
                {displayPercent}%
              </Text>
              <Text className="text-sm text-muted-foreground">
                {getPhaseLabel(progress, t)}
              </Text>
            </View>
          </View>

          {stats.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {stats.map((stat) => (
                <ProgressStat key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </View>
          ) : null}

          <View className="flex-row items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5">
            <TriangleAlert size={16} className="mt-0.5 text-warning" />
            <Text className="flex-1 text-xs leading-4.5 text-muted-foreground">
              {t('backup.pleaseDoNotCloseOrMinimizeTheAppWhileThe')}
            </Text>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
}

function getImportTitle(
  source: BackupImportProgress['source'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (source === 'tackbok') return t('backup.restoringTackbokBackup');
  if (source === 'gratitudeApp') return t('backup.importingFromGratitudeApp');
  return t('backup.importFromPresentlyApp');
}

function getPhaseLabel(
  progress: BackupImportProgress,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (progress.source === 'presently') {
    const phase = progress.phase;

    switch (phase) {
      case 'reading':
        return t('backup.loadPresentlyExport');
      case 'entries':
        return t('backup.importJournalEntries');
      case 'finishing':
        return t('backup.refreshJournalData');
      default:
        return assertNever(phase);
    }
  }

  const phase = progress.phase;

  switch (phase) {
    case 'reading':
      return t('backup.openBackupFile');
    case 'validating':
      return t('backup.validateBackupContents');
    case 'profile':
      return t('backup.restoreProfile');
    case 'taxonomy':
      return t('backup.importTagsAndPrompts');
    case 'entries':
      return t('backup.restoreEntriesAndMedia');
    case 'finishing':
      return t('backup.refreshJournalData');
    default:
      return assertNever(phase);
  }
}

function getCurrentDetail(
  progress: BackupImportProgress,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const phase = progress.phase;

  switch (phase) {
    case 'reading':
      return t('backup.loadingTheSelectedImportFile');
    case 'validating':
      return t('backup.checkingBackupContentsAndFileStructure');
    case 'profile':
      return t('backup.restoringProfileDetailsAndProfilePhotoIfAvailable');
    case 'taxonomy':
      return t('backup.addingTagsAndPromptsBeforeEntriesAreRestored');
    case 'entries':
      return progress.totalEntries > 0
        ? t('backup.processingProcessedOfTotalJournalEntriesAndAttachedMedia', {
            processed: progress.processedEntries,
            total: progress.totalEntries,
          })
        : t('backup.noJournalEntriesFoundInThisBackup');
    case 'finishing':
      return t('backup.refreshingYourJournalSoImportedDataAppearsEverywhere');
    default:
      return assertNever(phase);
  }
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-28 flex-1 rounded-2xl bg-muted/70 px-3 py-3">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-sm font-body-semibold text-foreground">{value}</Text>
    </View>
  );
}
