import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  CloudOff,
  FileClock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
  Wifi,
  type LucideIcon,
} from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { formatLocalizedDate } from '~/lib/i18n/dateFormatting';
import { useSettingsStore } from '~/lib/settings';
import { deleteAllPhotos } from '~/lib/photoUtils';
import { deleteAllVoiceMemos } from '~/lib/voiceMemoUtils';
import {
  acknowledgeCloudConflicts,
  cancelPreparedGoogleDriveConnection,
  completeGoogleDriveConnection,
  deleteJournalEverywhere,
  disconnectGoogleDrive,
  listUnacknowledgedCloudConflicts,
  prepareGoogleDriveConnection,
  reconnectGoogleDrive,
  resetThisDeviceOnly,
  revokeCloudVault,
  setCloudSyncPaused,
  syncNow,
  useCloudSyncSnapshot,
  verifyCloudBackup,
  type CloudConflictSummary,
  type PreparedGoogleConnection,
} from '~/lib/cloudSync/ui';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDestructiveAction,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { DELETE_CONFIRM_DELAY_SECONDS } from '~/constants';

type SetupStage = 'overview' | 'disclosure' | 'authorizing' | 'choose' | 'working';
type DestructiveAction = 'disconnect' | 'delete-backup' | 'delete-journal' | 'reset-device';

function statusLabel(
  status: ReturnType<typeof useCloudSyncSnapshot>['snapshot']['status'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (status) {
    case 'syncing': return t('Syncing…');
    case 'queued': return t('Safely queued');
    case 'paused': return t('Sync paused');
    case 'warning': return t('Attention needed');
    case 'restoring': return t('Restoring…');
    case 'synced': return t('Up to date');
    default: return t('Off');
  }
}

function entityTypeLabel(
  entityType: CloudConflictSummary['entityType'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (entityType) {
    case 'entry': return t('Entry');
    case 'tag': return t('Tag');
    case 'prompt': return t('Prompt');
    case 'profile': return t('Profile');
  }
}

export default function CloudBackupScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ origin?: string }>();
  const origin = params.origin === 'onboarding' ? 'onboarding' : 'settings';
  const { t, isRTL } = useTranslation();
  const { snapshot, refresh } = useCloudSyncSnapshot();
  const wifiOnly = useSettingsStore((state) => state.cloudSyncWifiOnlyMedia);
  const setWifiOnly = useSettingsStore((state) => state.setCloudSyncWifiOnlyMedia);
  const setHasCompletedOnboarding = useSettingsStore(
    (state) => state.setHasCompletedOnboarding,
  );
  const resetSettings = useSettingsStore((state) => state.resetToDefaults);
  const [stage, setStage] = useState<SetupStage>(
    origin === 'onboarding' ? 'disclosure' : 'overview',
  );
  const [prepared, setPrepared] = useState<PreparedGoogleConnection | null>(null);
  const [conflicts, setConflicts] = useState<CloudConflictSummary[]>([]);
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAction | null>(null);

  const refreshConflicts = useCallback(async () => {
    setConflicts(await listUnacknowledgedCloudConflicts());
  }, []);

  useEffect(() => {
    void listUnacknowledgedCloudConflicts().then(setConflicts);
  }, [refreshConflicts, snapshot.conflictCount]);

  useEffect(() => {
    if (snapshot.status === 'syncing' || snapshot.status === 'restoring') {
      AccessibilityInfo.announceForAccessibility(statusLabel(snapshot.status, t));
    }
  }, [snapshot.status, t]);

  useEffect(() => () => {
    if (prepared) void cancelPreparedGoogleDriveConnection();
  }, [prepared]);

  const handleAuthorize = useCallback(async () => {
    setStage('authorizing');
    try {
      const connection = await prepareGoogleDriveConnection();
      if (origin === 'onboarding' && connection.availableVaults.length === 0) {
        await cancelPreparedGoogleDriveConnection();
        toast.warning(t('No Tackbok backup found in this Google account'));
        router.back();
        return;
      }
      setPrepared(connection);
      setStage('choose');
    } catch {
      toast.error(t('Google Drive connection was not completed'));
      if (origin === 'onboarding') router.back();
      else setStage('disclosure');
    }
  }, [origin, router, t]);

  const handleComplete = useCallback(async (vaultId?: string, createNew = false) => {
    setStage('working');
    try {
      await completeGoogleDriveConnection({ origin, vaultId, createNew });
      await refresh();
      toast.success(
        origin === 'onboarding'
          ? t('Cloud restore started')
          : t('Cloud backup connected'),
      );
      if (origin === 'onboarding') {
        setHasCompletedOnboarding(true);
        router.replace('/');
      } else {
        setPrepared(null);
        setStage('overview');
      }
    } catch {
      setStage('choose');
      toast.error(t('Cloud backup could not be updated'));
    }
  }, [origin, refresh, router, setHasCompletedOnboarding, t]);

  const runAction = useCallback(async (action: () => Promise<unknown>, success: string) => {
    try {
      const result = await action();
      if (result === false) throw new Error('action did not complete');
      await refresh();
      toast.success(success);
    } catch {
      toast.error(t('Cloud backup could not be updated'));
    }
  }, [refresh, t]);

  const clearLocalPresentation = useCallback(async () => {
    resetSettings();
    queryClient.clear();
    try { deleteAllPhotos(); } catch { /* DB wipe is already authoritative. */ }
    try { deleteAllVoiceMemos(); } catch { /* DB wipe is already authoritative. */ }
    router.replace('/onboarding/welcome');
  }, [queryClient, resetSettings, router]);

  const handleDestructiveAction = useCallback(async () => {
    const action = destructiveAction;
    setDestructiveAction(null);
    if (!action) return;
    try {
      if (action === 'disconnect') {
        await disconnectGoogleDrive();
        toast.success(t('Google Drive disconnected on this device'));
      } else if (action === 'delete-backup') {
        await revokeCloudVault('backup-deleted');
        toast.success(t('Cloud backup deleted'));
      } else if (action === 'delete-journal') {
        await deleteJournalEverywhere();
        await clearLocalPresentation();
        return;
      } else {
        await resetThisDeviceOnly();
        await clearLocalPresentation();
        return;
      }
      await refresh();
    } catch {
      toast.error(t('Cloud backup could not be updated'));
    }
  }, [clearLocalPresentation, destructiveAction, refresh, t]);

  const actionCopy = destructiveAction === 'disconnect'
    ? {
        title: t('Disconnect Google Drive?'),
        description: t('Local data and the cloud backup will both remain. Other devices stay connected.'),
        button: t('Disconnect'),
      }
    : destructiveAction === 'delete-backup'
      ? {
          title: t('Delete cloud backup?'),
          description: t('The cloud copy will be permanently deleted after verification. Local journal data remains.'),
          button: t('Delete cloud backup'),
        }
      : destructiveAction === 'delete-journal'
        ? {
            title: t('Delete journal everywhere?'),
            description: t('The cloud copy and this device’s journal will be permanently deleted. Other devices will delete their local journal when they sync.'),
            button: t('Delete journal everywhere'),
          }
        : {
            title: t('Reset this device only?'),
            description: t('This device disconnects first, then deletes its local journal. The cloud backup and other devices remain.'),
            button: t('Reset this device only'),
          };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center border-b border-border px-safe-or-4 pt-safe-or-3 pb-3">
        <Button
          variant="ghost"
          className="p-1 mr-1"
          onPress={() => router.back()}
          accessibilityLabel={t('Back')}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text variant="h2" className="font-heading text-foreground py-1">
          {t('Cloud Backup & Sync')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-safe-or-4 py-5 gap-4 pb-safe-or-8">
        {snapshot.revocationKind && (
          <View
            className="rounded-lg border border-destructive bg-destructive/10 p-4 gap-2"
            accessibilityRole="alert">
            <View className="flex-row items-center gap-2">
              <Icon as={AlertTriangle} className="text-destructive size-5" />
              <Text className="font-body-bold text-foreground">
                {snapshot.revocationKind === 'journal-deleted'
                  ? t('Journal deletion received')
                  : t('Cloud backup deletion received')}
              </Text>
            </View>
            <Text className="text-sm text-foreground">
              {snapshot.revocationKind === 'journal-deleted'
                ? t('This journal was deleted everywhere. This device is disconnected.')
                : t('This cloud backup was deleted. Local journal data remains on this device.')}
            </Text>
          </View>
        )}

        {(stage === 'disclosure' || stage === 'authorizing') && (
          <DisclosureCard
            busy={stage === 'authorizing'}
            onContinue={() => void handleAuthorize()}
          />
        )}

        {(stage === 'choose' || stage === 'working') && prepared && (
          <ConnectionChoice
            prepared={prepared}
            origin={origin}
            busy={stage === 'working'}
            onChoose={(vaultId) => void handleComplete(vaultId)}
            onCreate={() => void handleComplete(undefined, true)}
          />
        )}

        {stage === 'overview' && (
          snapshot.configured || snapshot.status === 'paused' ? (
            <>
              <View className="rounded-lg border border-border bg-card p-4 gap-3">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-3 flex-1">
                    <Icon
                      as={snapshot.status === 'warning' ? AlertTriangle : Cloud}
                      className={snapshot.status === 'warning' ? 'text-destructive size-6' : 'text-foreground size-6'}
                    />
                    <View className="flex-1">
                      <Text className="font-body-bold text-foreground">
                        {statusLabel(snapshot.status, t)}
                      </Text>
                      <Text className="text-sm text-muted-foreground">
                        {snapshot.accountLabel ?? t('Google Drive')}
                      </Text>
                    </View>
                  </View>
                  {snapshot.status === 'syncing' && (
                    <ActivityIndicator colorClassName="accent-primary" />
                  )}
                </View>
                <Text className="text-sm text-muted-foreground">
                  {snapshot.queuedCount > 0
                    ? t('{count} changes safely queued', { count: snapshot.queuedCount })
                    : snapshot.lastSuccessAt
                      ? t('Last successful sync: {date}', {
                          date: formatLocalizedDate(snapshot.lastSuccessAt, t, { relative: true }),
                        })
                      : t('Waiting for the first successful sync')}
                </Text>
                {snapshot.status === 'restoring' && (
                  <Text
                    className="text-sm text-foreground"
                    accessibilityLiveRegion="polite">
                    {t('You can leave this screen; syncing resumes when Tackbok is active.')}
                  </Text>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  disabled={snapshot.status === 'syncing' || snapshot.status === 'paused'}
                  onPress={() => void runAction(syncNow, t('Sync completed'))}
                  accessibilityLabel={t('Sync now')}>
                  <Icon as={RefreshCw} className="text-primary-foreground size-5" />
                  <Text>{t('Sync now')}</Text>
                </Button>
              </View>

              <View className="rounded-lg border border-border bg-card overflow-hidden">
                <SettingToggleRow
                  icon={Wifi}
                  label={t('Wi-Fi only for media')}
                  description={t('Text still syncs on mobile data. Photos and voice memos wait for Wi-Fi.')}
                  checked={wifiOnly}
                  onChange={setWifiOnly}
                />
                <SettingToggleRow
                  icon={CloudOff}
                  label={t('Pause sync')}
                  description={t('Edits remain safely queued on this device.')}
                  checked={snapshot.status === 'paused'}
                  onChange={(paused) => void runAction(
                    () => setCloudSyncPaused(paused),
                    paused ? t('Sync paused') : t('Sync resumed'),
                  )}
                  last
                />
              </View>

              <View className="rounded-lg border border-border bg-card overflow-hidden">
                <ActionRow
                  icon={ShieldCheck}
                  label={t('Verify backup health')}
                  description={snapshot.lastVerifiedAt
                    ? t('Last verified: {date}', {
                        date: formatLocalizedDate(snapshot.lastVerifiedAt, t, { relative: true }),
                      })
                    : t('Check the cloud copy and repair if needed')}
                  onPress={() => void runAction(verifyCloudBackup, t('Backup health verified'))}
                />
                <ActionRow
                  icon={RefreshCw}
                  label={t('Reconnect Google Drive')}
                  onPress={() => void runAction(reconnectGoogleDrive, t('Google Drive reconnected'))}
                  last
                />
              </View>

              {conflicts.length > 0 && (
                <View className="rounded-lg border border-border bg-card p-4 gap-3">
                  <View className="flex-row items-center gap-2">
                    <Icon as={FileClock} className="text-foreground size-5" />
                    <Text className="font-body-bold text-foreground">
                      {t('Recovered conflicts')}
                    </Text>
                  </View>
                  {conflicts.map((conflict) => (
                    <Text key={conflict.conflictId} className="text-sm text-foreground">
                      {t('Recovered {type} conflict — {count} preserved alternatives', {
                        type: entityTypeLabel(conflict.entityType, t),
                        count: conflict.recoveredCount + conflict.alternateCount,
                      })}
                    </Text>
                  ))}
                  <Button
                    variant="outline"
                    onPress={() => void runAction(async () => {
                      await acknowledgeCloudConflicts();
                      await refreshConflicts();
                    }, t('Recovered conflicts marked as reviewed'))}>
                    <Text>{t('Mark as reviewed')}</Text>
                  </Button>
                </View>
              )}

              <View className="rounded-lg border border-destructive/50 bg-card overflow-hidden">
                <ActionRow
                  icon={Unplug}
                  label={t('Disconnect provider')}
                  description={t('Keep local data and the cloud copy')}
                  onPress={() => setDestructiveAction('disconnect')}
                />
                <ActionRow
                  icon={Trash2}
                  label={t('Delete cloud backup')}
                  description={t('Keep local journal data')}
                  onPress={() => setDestructiveAction('delete-backup')}
                />
                <ActionRow
                  icon={Trash2}
                  label={t('Delete journal everywhere')}
                  description={t('Delete cloud and local journal data')}
                  onPress={() => setDestructiveAction('delete-journal')}
                />
                <ActionRow
                  icon={CloudOff}
                  label={t('Reset this device only')}
                  description={t('Keep the cloud copy and other devices')}
                  onPress={() => setDestructiveAction('reset-device')}
                  last
                />
              </View>
            </>
          ) : (
            <View className="rounded-lg border border-border bg-card p-5 gap-4">
              <View className="items-center gap-3">
                <Icon as={Cloud} className="text-foreground size-10" />
                <Text variant="h3" className="text-center text-foreground">
                  {t('Optional cloud backup')}
                </Text>
                <Text className="text-center text-muted-foreground">
                  {t('Back up and sync your journal with your own Google Drive. No Tackbok account is created.')}
                </Text>
              </View>
              <Button variant="primary" size="lg" onPress={() => setStage('disclosure')}>
                <Text>{t('Connect Google Drive')}</Text>
              </Button>
            </View>
          )
        )}
      </ScrollView>

      <AlertDialog
        open={destructiveAction !== null}
        onOpenChange={(open) => { if (!open) setDestructiveAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{actionCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><Text>{t('Cancel')}</Text></AlertDialogCancel>
            <AlertDialogDestructiveAction
              delaySeconds={DELETE_CONFIRM_DELAY_SECONDS}
              onPress={() => void handleDestructiveAction()}>
              <Text>{actionCopy.button}</Text>
            </AlertDialogDestructiveAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}

function DisclosureCard({ busy, onContinue }: { busy: boolean; onContinue: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="rounded-lg border border-border bg-card p-5 gap-4">
      <View className="flex-row items-center gap-3">
        <Icon as={ShieldCheck} className="text-foreground size-7" />
        <Text variant="h3" className="text-foreground flex-1">
          {t('Before you connect')}
        </Text>
      </View>
      <Text className="text-foreground">
        {t('Cloud data is protected in transit and by your storage provider. Tackbok does not end-to-end encrypt cloud backups in this version.')}
      </Text>
      <Text className="text-foreground">
        {t('Google shares basic account identity so Tackbok can show a masked account label. Your email is never added to backups, logs, diagnostics, or analytics.')}
      </Text>
      <Text className="text-muted-foreground">
        {t('This connects storage only. It does not create a Tackbok account.')}
      </Text>
      <Button variant="primary" size="lg" disabled={busy} onPress={onContinue}>
        {busy && <ActivityIndicator colorClassName="accent-primary-foreground" />}
        <Text>{busy ? t('Connecting…') : t('Connect Google Drive')}</Text>
      </Button>
    </View>
  );
}

function ConnectionChoice({
  prepared,
  origin,
  busy,
  onChoose,
  onCreate,
}: {
  prepared: PreparedGoogleConnection;
  origin: 'settings' | 'onboarding';
  busy: boolean;
  onChoose: (vaultId: string) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="rounded-lg border border-border bg-card p-5 gap-4">
      <View className="flex-row items-center gap-3">
        <Icon as={CheckCircle2} className="text-foreground size-7" />
        <View className="flex-1">
          <Text variant="h3" className="text-foreground">{t('Google Drive connected')}</Text>
          <Text className="text-sm text-muted-foreground">{prepared.accountLabel}</Text>
        </View>
      </View>
      {prepared.availableVaults.length > 0 ? (
        <>
          <Text className="text-foreground">
            {prepared.localHasData
              ? t('Choose a backup to merge with this journal. Both sides are preserved.')
              : t('Choose a backup to restore on this device.')}
          </Text>
          {prepared.availableVaults.map((vault, index) => (
            <Button
              key={vault.vaultId}
              variant="outline"
              size="lg"
              disabled={busy}
              onPress={() => onChoose(vault.vaultId)}
              accessibilityLabel={t('Cloud backup {number}', { number: index + 1 })}>
              <Text>
                {prepared.localHasData ? t('Restore and merge') : t('Restore cloud backup')}
              </Text>
            </Button>
          ))}
        </>
      ) : origin === 'settings' ? (
        <>
          <Text className="text-foreground">
            {t('No existing Tackbok backup was found. Create one for this journal.')}
          </Text>
          <Button variant="primary" size="lg" disabled={busy} onPress={onCreate}>
            <Text>{t('Create cloud backup')}</Text>
          </Button>
        </>
      ) : null}
      {busy && (
        <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
          <ActivityIndicator colorClassName="accent-primary" />
          <Text className="text-muted-foreground">{t('Setting up cloud sync…')}</Text>
        </View>
      )}
    </View>
  );
}

function SettingToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  last = false,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  last?: boolean;
}) {
  return (
    <View className={cn(
      'flex-row items-center gap-3 px-4 py-3',
      !last && 'border-b border-border',
    )}>
      <Icon as={icon} className="text-foreground size-5" />
      <View className="flex-1">
        <Text className="font-body-medium text-foreground">{label}</Text>
        <Text className="text-sm text-muted-foreground">{description}</Text>
      </View>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        accessibilityLabel={label}
        accessibilityState={{ checked }}
      />
    </View>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onPress,
  last = false,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="flex"
      className={cn(
        'w-full justify-start rounded-none px-4 py-3',
        !last && 'border-b border-border',
      )}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={description}>
      <Icon as={icon} className="text-foreground size-5" />
      <View className="flex-1 items-start">
        <Text className="font-body-medium text-foreground">{label}</Text>
        {description && <Text className="text-sm text-muted-foreground">{description}</Text>}
      </View>
    </Button>
  );
}
