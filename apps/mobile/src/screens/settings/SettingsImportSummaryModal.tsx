import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { BackupImportSource, BackupImportSummary } from '~/lib/backupImport';
import { useTranslation } from '~/lib/i18n';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

interface SettingsImportSummaryModalProps {
  visible: boolean;
  source: BackupImportSource | null;
  summary: BackupImportSummary | null;
  onDone: () => void;
}

export function SettingsImportSummaryModal({
  visible,
  source,
  summary,
  onDone,
}: SettingsImportSummaryModalProps) {
  const { t } = useTranslation();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onDone();
    }
  };

  if (!visible || !source || !summary) return null;

  const rows = [
    { label: t('New entries'), value: summary.importedEntries, alwaysShow: true },
    { label: t('Updated entries'), value: summary.updatedEntries },
    { label: t('Skipped duplicates'), value: summary.skippedEntries },
    { label: t('Tags added'), value: summary.importedTags },
    { label: t('Prompts added'), value: summary.importedPrompts },
    { label: t('Photos restored'), value: summary.importedPhotos },
    { label: t('Voice memos restored'), value: summary.importedAudio },
  ].filter((row) => row.alwaysShow || row.value > 0);

  return (
    <Dialog open={visible} onOpenChange={handleOpenChange} dismissible={false}>
      <DialogContent
        className="w-full max-w-lg gap-0 rounded-[28px] px-5 py-6"
        showCloseButton={false}>
        <DialogHeader className="mb-5 items-start gap-3 text-left sm:text-left">
          <View className="size-12 items-center justify-center rounded-full bg-primary/15">
            <Icon as={Check} className="size-5 text-primary-foreground" strokeWidth={5} />
          </View>
          <View className="gap-1">
            <DialogTitle className="text-xl font-heading text-foreground">
              {getSummaryTitle(source, t)}
            </DialogTitle>
            <Text className="text-sm text-muted-foreground">
              {getSummarySourceLabel(source, t)}
            </Text>
          </View>
          <DialogDescription className="text-sm leading-5 text-foreground/80">
            {getSummaryMessage(summary, t)}
          </DialogDescription>
        </DialogHeader>

        <View className="gap-2 pb-2">
          {rows.map((row) => (
            <SummaryRow key={row.label} label={row.label} value={row.value} />
          ))}
        </View>

        <DialogFooter className="mt-5 sm:justify-center">
          <Button variant="primary" className="w-full" onPress={onDone}>
            <Text>{t('Done')}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getSummaryTitle(
  source: BackupImportSource,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (source === 'tackbok') return t('Tackbok backup restored');
  if (source === 'gratitudeApp') return t('Gratitude import complete');
  return t('Presently import complete');
}

function getSummarySourceLabel(
  source: BackupImportSource,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (source === 'tackbok') return t('Imported from Tackbok backup');
  if (source === 'gratitudeApp') return t('Imported from Gratitude backup');
  return t('Imported from Presently export');
}

function getSummaryMessage(
  summary: BackupImportSummary,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (summary.importedEntries > 0 || summary.updatedEntries > 0) {
    return t('Your journal data is ready to review.');
  }
  if (summary.skippedEntries > 0) {
    return t('This import finished, but everything already existed in Tackbok.');
  }
  return t('This import finished successfully.');
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-muted/60 px-3 py-3">
      <Text className="text-sm text-foreground">{label}</Text>
      <Text className="text-sm font-body-bold text-foreground">{value}</Text>
    </View>
  );
}
