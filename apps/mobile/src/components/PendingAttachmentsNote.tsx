import { useCloudSyncSnapshot } from '~/lib/cloudSync/ui';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';

/**
 * Stands in for an entry's photos and voice notes that cloud sync is still
 * downloading. Shown only while downloads are pending, so a file missing for
 * another reason is not described as on its way.
 */
export function PendingAttachmentsNote({ count }: { count: number }) {
  const { t } = useTranslation();
  const { snapshot } = useCloudSyncSnapshot();
  if (count === 0 || snapshot.pendingDownloadCount === 0) return null;
  return (
    <Text className="py-3 text-sm text-muted-foreground">
      {t('cloud.photosAndVoiceNotesToDownloadCount', { number: count })}
    </Text>
  );
}
