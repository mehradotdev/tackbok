import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { formatLocalizedDate, formatLocalizedTime } from '~/lib/i18n/dateFormatting';
import type { TranslationFunction } from '~/lib/i18n';
import {
  BackupHistoryError,
  buildBackupHistoryArchive,
  discardBackupHistoryArchive,
  exportBackupFromHistory,
  listBackupHistory,
  type BackupHistoryItem,
} from '~/lib/cloudSync/ui/backupHistory';
import { useBackupImportFlow } from '~/hooks/useBackupImportFlow';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { ThemeBackdrop } from '~/components/backdrops/ThemeBackdrop';
import { SettingsImportModeModal } from '~/screens/settings/SettingsImportModeModal';
import { SettingsImportProgressModal } from '~/screens/settings/SettingsImportProgressModal';
import { SettingsImportSummaryModal } from '~/screens/settings/SettingsImportSummaryModal';

type Busy = { snapshotId: string; action: 'export' | 'restore' } | null;

function failureMessage(t: TranslationFunction, error: unknown): string {
  if (error instanceof BackupHistoryError) {
    if (error.reason === 'backup-gone') return t('cloud.history.gone');
    if (error.reason === 'unreadable') return t('cloud.history.unreadable');
  }
  return t('cloud.history.failed');
}

/** A file-name-safe day for an exported backup, from its upload time. */
function fileDay(time: number): string {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Backup history (#185 P9): one cloud backup a day for the last 30 days.
 * Export saves one as a ZIP; Restore imports it after a confirmation and the
 * import's own choice for entries in both, and never deletes an entry.
 */
export default function BackupHistoryScreen() {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  // Set synchronously, so a second tap before the re-render starts nothing.
  const busyRef = useRef(false);
  const [pendingRestore, setPendingRestore] = useState<BackupHistoryItem | null>(null);
  // The archive the import reads; deleted once the import is done or cancelled.
  const archiveRef = useRef<string | null>(null);

  const discardArchive = useCallback(() => {
    if (archiveRef.current) discardBackupHistoryArchive(archiveRef.current);
    archiveRef.current = null;
  }, []);
  // An archive built after the screen closed is deleted as soon as it exists.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardArchive();
    };
  }, [discardArchive]);

  const handleImportDone = useCallback(() => {
    discardArchive();
    router.dismissTo('/');
  }, [discardArchive, router]);
  const {
    importProgress,
    importSummary,
    pendingImportSelection,
    selectTackbokArchive,
    runPendingImport,
    clearPendingImport,
    closeImportSummary,
  } = useBackupImportFlow(handleImportDone);

  const history = useQuery({
    queryKey: ['backupHistory'],
    queryFn: listBackupHistory,
    retry: false,
  });
  const items = history.data ?? null;
  const loadFailed = history.isError;
  const load = history.refetch;

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const run = async (
    item: BackupHistoryItem,
    action: 'export' | 'restore',
    work: () => Promise<void>,
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy({ snapshotId: item.snapshotId, action });
    try {
      await work();
    } catch (error) {
      console.warn(`Backup history ${action} failed`, error);
      toast.error(failureMessage(t, error));
      if (error instanceof BackupHistoryError && error.reason === 'backup-gone')
        void load();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const handleExport = (item: BackupHistoryItem) =>
    run(item, 'export', async () => {
      const { missingMedia } = await exportBackupFromHistory(
        item.snapshotId,
        fileDay(item.createdAt),
      );
      toast.success(t('cloud.history.exported'));
      if (missingMedia > 0) toast.info(t('cloud.history.missingMedia'));
    });

  const handleRestoreConfirm = () => {
    const item = pendingRestore;
    setPendingRestore(null);
    if (!item) return;
    void run(item, 'restore', async () => {
      const archive = await buildBackupHistoryArchive(item.snapshotId, 'restore');
      discardArchive();
      if (!mountedRef.current) {
        discardBackupHistoryArchive(archive.file.uri);
        return;
      }
      archiveRef.current = archive.file.uri;
      if (archive.missingMedia > 0) toast.info(t('cloud.history.missingMedia'));
      // The import's mode choice follows: keep entries in both, or take the backup's.
      selectTackbokArchive(archive.file.uri);
    });
  };

  // "Today" and "Yesterday" head a row; sentences take the full date.
  const dateOf = (item: BackupHistoryItem, relative = false) =>
    formatLocalizedDate(item.createdAt, t, { includeWeekday: true, relative });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ThemeBackdrop />
      <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border">
        <Button
          onPress={() => router.back()}
          variant="ghost"
          className="p-1"
          accessibilityLabel={t('common.back')}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text
          variant="h2"
          numberOfLines={2}
          adjustsFontSizeToFit
          className="flex-1 text-foreground font-heading">
          {t('cloud.history.title')}
        </Text>
      </View>

      {items === null && !loadFailed ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator colorClassName="accent-primary" />
        </View>
      ) : items === null ? (
        <View className="flex-1 items-center justify-center gap-4 px-4">
          <Text className="text-muted-foreground text-center">
            {t('cloud.history.loadFailed')}
          </Text>
          <Button variant="outline" onPress={() => void load()}>
            <Text>{t('common.retry')}</Text>
          </Button>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.snapshotId}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
          ListHeaderComponent={
            <Text className="text-sm text-muted-foreground px-1 py-3">
              {t('cloud.history.description')}
            </Text>
          }
          ListEmptyComponent={
            <Text className="text-muted-foreground text-center px-4 py-8">
              {loadFailed ? t('cloud.history.loadFailed') : t('cloud.history.empty')}
            </Text>
          }
          renderItem={({ item }) => {
            const time = formatLocalizedTime(new Date(item.createdAt), t.locale ?? 'en');
            const rowBusy = busy?.snapshotId === item.snapshotId;
            return (
              <View
                className="rounded-lg border border-border bg-card p-4 mb-3 gap-3"
                accessible={false}>
                <View>
                  <Text className="text-base font-body-medium text-foreground">
                    {dateOf(item, true)}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {t('cloud.history.savedAt', { time })}
                  </Text>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="h-auto min-h-10 py-2 flex-grow"
                    disabled={busy !== null}
                    accessibilityLabel={t('cloud.history.exportLabel', {
                      date: dateOf(item),
                    })}
                    accessibilityState={{ busy: rowBusy && busy?.action === 'export' }}
                    onPress={() => void handleExport(item)}>
                    {rowBusy && busy?.action === 'export' ? (
                      <ActivityIndicator size="small" colorClassName="accent-primary" />
                    ) : (
                      <Text className="shrink text-center">
                        {t('cloud.history.export')}
                      </Text>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto min-h-10 py-2 flex-grow"
                    disabled={busy !== null}
                    accessibilityLabel={t('cloud.history.restoreLabel', {
                      date: dateOf(item),
                    })}
                    accessibilityState={{ busy: rowBusy && busy?.action === 'restore' }}
                    onPress={() => setPendingRestore(item)}>
                    {rowBusy && busy?.action === 'restore' ? (
                      <ActivityIndicator size="small" colorClassName="accent-primary" />
                    ) : (
                      <Text className="shrink text-center">
                        {t('cloud.history.restore')}
                      </Text>
                    )}
                  </Button>
                </View>
              </View>
            );
          }}
          contentContainerClassName="px-4 pb-safe-or-4"
        />
      )}

      <AlertDialog
        open={pendingRestore !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRestore(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRestore
                ? t('cloud.history.restoreTitle', { date: dateOf(pendingRestore) })
                : null}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('cloud.history.restoreDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setPendingRestore(null)}>
              <Text>{t('common.cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-auto min-h-10 py-2"
              onPress={handleRestoreConfirm}>
              <Text className="shrink text-center">
                {t('cloud.history.restoreConfirm')}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingsImportModeModal
        visible={pendingImportSelection !== null}
        onClose={() => {
          clearPendingImport();
          discardArchive();
        }}
        onSelectMode={(mode) =>
          // The import has read the archive once it returns, done or failed.
          void runPendingImport(mode)
            .catch((error: unknown) =>
              console.warn('Backup history restore failed', error),
            )
            .finally(discardArchive)
        }
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
    </SafeAreaView>
  );
}
