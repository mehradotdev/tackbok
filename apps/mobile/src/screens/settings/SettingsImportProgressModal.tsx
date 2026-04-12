import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from '~/lib/i18n';
import { type BackupImportProgress } from '~/lib/backupImport';
import { Text } from '~/components/ui/text';
import { Dialog, DialogContent } from '~/components/ui/dialog';

interface SettingsImportProgressModalProps {
  visible: boolean;
  progress: BackupImportProgress | null;
}

export function SettingsImportProgressModal({
  visible,
  progress,
}: SettingsImportProgressModalProps) {
  const { t } = useTranslation();

  if (!visible || !progress) return null;

  const percent = Math.max(6, Math.round(progress.progress * 100));
  const stats = [
    progress.totalEntries > 0
      ? {
          label: t('Entries processed'),
          value: `${progress.processedEntries}/${progress.totalEntries}`,
        }
      : null,
    progress.importedTags > 0
      ? { label: t('Tags added'), value: String(progress.importedTags) }
      : null,
    progress.importedPrompts > 0
      ? { label: t('Prompts added'), value: String(progress.importedPrompts) }
      : null,
    progress.importedPhotos > 0
      ? { label: t('Photos restored'), value: String(progress.importedPhotos) }
      : null,
    progress.importedAudio > 0
      ? { label: t('Voice memos restored'), value: String(progress.importedAudio) }
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
                style={{ width: `${percent}%` }}
              />
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-body-semibold text-foreground">
                {percent}%
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

          {progress.phase === 'entries' && progress.totalEntries === 0 ? (
            <View className="rounded-2xl bg-muted/50 px-4 py-3">
              <Text className="text-sm text-muted-foreground">
                {t('No journal entries found in this backup.')}
              </Text>
            </View>
          ) : null}
        </View>
      </DialogContent>
    </Dialog>
  );
}

function getImportTitle(
  source: BackupImportProgress['source'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (source === 'tackbok') return t('Restoring Tackbok backup');
  if (source === 'gratitudeApp') return t('Importing from Gratitude App');
  return t('Import from Presently App');
}

function getPhaseLabel(
  progress: BackupImportProgress,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (progress.source === 'presently') {
    switch (progress.phase) {
      case 'reading':
        return t('Load Presently export');
      case 'entries':
        return t('Import journal entries');
      case 'finishing':
        return t('Refresh journal data');
      default:
        return t('Import journal entries');
    }
  }

  switch (progress.phase) {
    case 'reading':
      return t('Open backup file');
    case 'validating':
      return t('Validate backup contents');
    case 'profile':
      return t('Restore profile');
    case 'taxonomy':
      return t('Import tags and prompts');
    case 'entries':
      return t('Restore entries and media');
    case 'finishing':
      return t('Refresh journal data');
  }
}

function getCurrentDetail(
  progress: BackupImportProgress,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (progress.phase) {
    case 'reading':
      return t('Loading the selected import file.');
    case 'validating':
      return t('Checking backup contents and file structure.');
    case 'profile':
      return t('Restoring profile details and profile photo if available.');
    case 'taxonomy':
      return t('Adding tags and prompts before entries are restored.');
    case 'entries':
      return progress.totalEntries > 0
        ? t('Processing {processed} of {total} journal entries and attached media.', {
            processed: progress.processedEntries,
            total: progress.totalEntries,
          })
        : t('No journal entries found in this backup.');
    case 'finishing':
      return t('Refreshing your journal so imported data appears everywhere.');
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
