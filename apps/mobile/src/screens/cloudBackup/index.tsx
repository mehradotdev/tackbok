import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, ScrollView, View } from 'react-native';
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
} from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { formatLocalizedDate } from '~/lib/i18n/dateFormatting';
import { useSettingsStore } from '~/lib/settings';
import { deleteAllPhotos } from '~/lib/photoUtils';
import { deleteAllVoiceMemos } from '~/lib/voiceMemoUtils';
import { CloudAuthError } from '~/lib/cloudSync/auth';
import { ProviderError } from '~/lib/cloudSync/providers';
import {
  acknowledgeCloudConflicts,
  cancelPreparedGoogleDriveConnection,
  completeGoogleDriveConnection,
  deleteJournalEverywhere,
  disconnectGoogleDrive,
  listUnacknowledgedCloudConflicts,
  prepareGoogleDriveConnection,
  reconnectGoogleDrive,
  retryV2AttentionReason,
  resetThisDeviceOnly,
  revokeCloudVault,
  setCloudSyncPaused,
  syncNow,
  useCloudSyncSnapshot,
  verifyCloudBackup,
  type CloudConflictSummary,
  type CloudSyncActionFailureCategory,
  CloudSyncActionError,
  type PreparedGoogleConnection,
} from '~/lib/cloudSync/ui';
import type { V2AttentionReason, V2RecoveryAction } from '~/lib/cloudSync/v2/sync';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { SpinningRefreshIcon } from '~/components/ui/spinning-refresh-icon';
import { SettingsRow } from '~/components/SettingsRow';
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
type DestructiveAction =
  | 'disconnect'
  | 'delete-backup'
  | 'delete-journal'
  | 'reset-device';

function statusLabel(
  status: ReturnType<typeof useCloudSyncSnapshot>['snapshot']['status'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (status) {
    case 'syncing':
      return t('Syncing…');
    case 'queued':
      return t('Safely queued');
    case 'paused':
      return t('Sync paused');
    case 'warning':
      return t('Attention needed');
    case 'restoring':
      return t('Restoring…');
    case 'synced':
      return t('Up to date');
    default:
      return t('Off');
  }
}

const SYNC_PHASES = ['checking', 'preparing', 'uploading', 'finishing'] as const;

function syncPhaseLabel(
  phase: NonNullable<
    ReturnType<typeof useCloudSyncSnapshot>['snapshot']['activityPhase']
  >,
  initialRestore: boolean,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (phase) {
    case 'checking':
      return t('Checking Google Drive for changes');
    case 'preparing':
      return initialRestore
        ? t('Preparing restored journal data')
        : t('Preparing journal changes');
    case 'uploading':
      return t('Merging changes and updating Google Drive');
    case 'finishing':
      return t('Saving synced journal data on this device');
  }
}

function entityTypeLabel(
  entityType: CloudConflictSummary['entityType'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (entityType) {
    case 'entry':
      return t('Entry');
    case 'tag':
      return t('Tag');
    case 'prompt':
      return t('Prompt');
    case 'profile':
      return t('Profile');
  }
}

function cloudSyncFailureMessage(
  category: CloudSyncActionFailureCategory,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (category) {
    case 'auth':
      return t('Google Drive needs to be reconnected.');
    case 'quota':
      return t('Google Drive storage is full.');
    case 'rate-limit':
      return t('Google Drive is busy. Try again shortly.');
    case 'offline':
      return t('No internet connection. Your changes remain safely queued.');
    case 'corrupt':
      return t('This cloud backup contains data Tackbok cannot read.');
    case 'transient':
    case 'unknown':
      return t('Google Drive could not be reached. Your changes remain safely queued.');
  }
}

function attentionReasonMessage(
  reason: V2AttentionReason,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const messages: Record<V2AttentionReason, string> = {
    'authorization-required': t('Google Drive authorization needs attention.'),
    'account-mismatch': t('This backup belongs to a different connected Google account.'),
    'consent-incomplete': t('Google Drive permission was not fully granted.'),
    'wrong-vault': t('The connected cloud backup does not match this journal.'),
    'unsupported-format': t('This backup was created by a newer Tackbok version.'),
    'invalid-remote-snapshot': t('A cloud snapshot failed its safety checks.'),
    'head-snapshot-missing': t('A device backup points to a missing snapshot.'),
    'ambiguous-device-head': t('Two different backups claim the same device version.'),
    'frontier-too-wide': t('Too many independent device backups need consolidation.'),
    'derived-id-collision': t('A recovered item conflicts with an existing stable identifier.'),
    'local-storage-full': t('Tackbok could not safely stage backup data on this device.'),
    'provider-quota-full': t('Google Drive does not have enough free storage.'),
    'provider-permission-denied': t('Google Drive denied access to the app backup folder.'),
    'missing-media': t('A referenced photo or voice memo is unavailable.'),
    'local-media-unreadable': t('A local photo or voice memo could not be verified.'),
    'normalized-model-not-ready': t('Your journal is not ready for cloud sync yet.'),
    'backup-deleted': t('This cloud backup was deleted from another device.'),
    'journal-deleted': t('This journal was deleted everywhere from another device.'),
    'purge-incomplete': t('Cloud deletion stopped before every backup object was removed.'),
    'cleanup-inconsistent': t('Backup cleanup was stopped to protect a current snapshot.'),
  };
  return messages[reason];
}

function recoveryActionLabel(
  action: V2RecoveryAction,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const labels: Record<V2RecoveryAction, string> = {
    'reconnect-google-drive': t('Reconnect Google Drive'),
    'choose-connected-account': t('Choose the connected account'),
    'finish-connection': t('Finish connection'),
    'reconnect-correct-backup': t('Reconnect to the correct backup'),
    'update-tackbok': t('Update Tackbok'),
    'retry-verify-backup': t('Retry and verify backup'),
    'repair-from-verified-backup': t('Repair from verified backup'),
    'inspect-repair-backup': t('Inspect and repair backup'),
    'consolidate-backups': t('Consolidate backups'),
    'export-repair-backup': t('Export journal and repair backup'),
    'free-device-storage': t('Free device storage and retry'),
    'manage-drive-storage': t('Manage Google Drive storage'),
    'retry-missing-media': t('Retry missing media'),
    'locate-retry-attachment': t('Locate or retry attachment'),
    'retry-journal-preparation': t('Retry journal preparation'),
    'acknowledge-disconnect': t('Acknowledge and disconnect'),
    'review-erase-device': t('Review deletion and erase this device'),
    'resume-deletion': t('Resume deletion'),
    'verify-backup-health': t('Verify backup health'),
  };
  return labels[action];
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
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAction | null>(
    null,
  );

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

  useEffect(
    () => () => {
      if (prepared) void cancelPreparedGoogleDriveConnection();
    },
    [prepared],
  );

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
    } catch (error) {
      const permissionMissing =
        (error instanceof CloudAuthError && error.code === 'permission-required') ||
        (error instanceof ProviderError && error.category === 'auth');
      toast.error(
        permissionMissing
          ? t('Google Drive access is required. Try again and select the Drive access checkbox.')
          : t('Google Drive connection was not completed'),
      );
      if (origin === 'onboarding') router.back();
      else setStage('disclosure');
    }
  }, [origin, router, t]);

  const handleComplete = useCallback(
    async (vaultId?: string, createNew = false) => {
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
    },
    [origin, refresh, router, setHasCompletedOnboarding, t],
  );

  const runAction = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      try {
        const result = await action();
        if (result === false) throw new Error('action did not complete');
        await refresh();
        toast.success(success);
      } catch (error) {
        toast.error(
          error instanceof CloudSyncActionError
            ? cloudSyncFailureMessage(error.category, t)
            : t('Cloud backup could not be updated'),
        );
      }
    },
    [refresh, t],
  );

  const handleRecoveryAction = useCallback(async () => {
    const reason = snapshot.attentionReason;
    const action = snapshot.recoveryAction;
    if (!reason || !action) return;
    if (action === 'choose-connected-account' || action === 'finish-connection' ||
        action === 'reconnect-correct-backup') {
      await runAction(async () => {
        await disconnectGoogleDrive();
        setPrepared(null);
        setStage('disclosure');
      }, t('Choose a Google account to reconnect'));
      return;
    }
    if (action === 'reconnect-google-drive') {
      await runAction(reconnectGoogleDrive, t('Google Drive reconnected'));
      return;
    }
    if (action === 'update-tackbok') {
      await Linking.openURL('https://tackbok.org');
      return;
    }
    if (action === 'free-device-storage') {
      await Linking.openSettings();
      return;
    }
    if (action === 'manage-drive-storage') {
      await Linking.openURL('https://drive.google.com/drive/quota');
      return;
    }
    if (action === 'acknowledge-disconnect') {
      await runAction(disconnectGoogleDrive, t('Google Drive disconnected on this device'));
      return;
    }
    if (action === 'review-erase-device') {
      setDestructiveAction('reset-device');
      return;
    }
    if (action === 'resume-deletion') {
      await runAction(
        () => revokeCloudVault(snapshot.revocationKind ?? 'backup-deleted'),
        t('Cloud deletion completed'),
      );
      return;
    }
    if (action === 'export-repair-backup' || action === 'locate-retry-attachment') {
      router.push('/settings');
      toast.warning(t('Export or repair the affected journal data, then return and retry.'));
      return;
    }
    await runAction(
      () => retryV2AttentionReason(reason),
      t('Cloud backup retry completed'),
    );
  }, [router, runAction, snapshot.attentionReason, snapshot.recoveryAction,
    snapshot.revocationKind, t]);

  const clearLocalPresentation = useCallback(async () => {
    resetSettings();
    queryClient.clear();
    try {
      deleteAllPhotos();
    } catch {
      /* DB wipe is already authoritative. */
    }
    try {
      deleteAllVoiceMemos();
    } catch {
      /* DB wipe is already authoritative. */
    }
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

  const actionCopy =
    destructiveAction === 'disconnect'
      ? {
          title: t('Disconnect Google Drive?'),
          description: t(
            'Local data and the cloud backup will both remain. Other devices stay connected.',
          ),
          button: t('Disconnect'),
        }
      : destructiveAction === 'delete-backup'
        ? {
            title: t('Delete cloud backup?'),
            description: t(
              'The cloud copy will be permanently deleted after verification. Local journal data remains.',
            ),
            button: t('Delete cloud backup'),
          }
        : destructiveAction === 'delete-journal'
          ? {
              title: t('Delete journal everywhere?'),
              description: t(
                'The cloud copy and this device’s journal will be permanently deleted. Other devices will delete their local journal when they sync.',
              ),
              button: t('Delete journal everywhere'),
            }
          : {
              title: t('Reset this device only?'),
              description: t(
                'This device disconnects first, then deletes its local journal. The cloud backup and other devices remain.',
              ),
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
                : t(
                    'This cloud backup was deleted. Local journal data remains on this device.',
                  )}
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

        {stage === 'overview' &&
          (snapshot.configured || snapshot.status === 'paused' ? (
            <>
              <View className="rounded-lg border border-border bg-card p-4 gap-3">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-3 flex-1">
                    <Icon
                      as={snapshot.status === 'warning' ? AlertTriangle : Cloud}
                      className={
                        snapshot.status === 'warning'
                          ? 'text-destructive size-6'
                          : 'text-foreground size-6'
                      }
                    />
                    <View className="flex-1">
                      <Text className="font-body-bold text-foreground">
                        {statusLabel(snapshot.status, t)}
                      </Text>
                      <Text selectable className="text-sm text-foreground">
                        {snapshot.accountLabel ?? t('Google Drive')}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text className="text-sm text-foreground">
                  {snapshot.queuedCount > 0
                    ? snapshot.status === 'syncing'
                      ? t('{count} changes remaining', { count: snapshot.queuedCount })
                      : t('{count} changes safely queued', {
                          count: snapshot.queuedCount,
                        })
                    : snapshot.lastSuccessAt
                      ? t('Last successful sync: {date}', {
                          date: formatLocalizedDate(snapshot.lastSuccessAt, t, {
                            relative: true,
                          }),
                        })
                      : t('Waiting for the first successful sync')}
                </Text>
                {snapshot.attentionReason && snapshot.recoveryAction && (
                  <View
                    className="gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-3"
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite">
                    <Text className="text-sm text-foreground">
                      {attentionReasonMessage(snapshot.attentionReason, t)}
                    </Text>
                    <Button
                      variant="outline"
                      onPress={() => void handleRecoveryAction()}
                      accessibilityLabel={recoveryActionLabel(snapshot.recoveryAction, t)}>
                      <Text>{recoveryActionLabel(snapshot.recoveryAction, t)}</Text>
                    </Button>
                  </View>
                )}
                {snapshot.status === 'syncing' && snapshot.activityPhase && (
                  <SyncProgressPanel
                    phase={snapshot.activityPhase}
                    initialRestore={snapshot.initialRestore}
                  />
                )}
                {snapshot.status === 'restoring' && (
                  <Text
                    className="text-sm text-foreground"
                    accessibilityLiveRegion="polite">
                    {t(
                      'You can leave this screen; syncing resumes when Tackbok is active.',
                    )}
                  </Text>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  disabled={snapshot.status === 'syncing' || snapshot.status === 'paused' ||
                    snapshot.status === 'warning'}
                  onPress={() => void runAction(syncNow, t('Sync completed'))}
                  accessibilityLabel={t('Sync now')}>
                  {snapshot.status === 'syncing' ? (
                    <SpinningRefreshIcon className="text-primary-foreground size-5" />
                  ) : (
                    <Icon as={RefreshCw} className="text-primary-foreground size-5" />
                  )}
                  <Text>
                    {snapshot.status === 'syncing' ? t('Syncing…') : t('Sync now')}
                  </Text>
                </Button>
              </View>

              <View className="rounded-lg border border-border bg-card overflow-hidden">
                <SettingsRow
                  icon={Wifi}
                  label={t('Wi-Fi only for media')}
                  description={t(
                    'Text still syncs on mobile data. Photos and voice memos wait for Wi-Fi.',
                  )}
                  onPress={() => setWifiOnly(!wifiOnly)}
                  role="switch"
                  accessibilityLabel={t('Wi-Fi only for media')}
                  accessibilityHint={t(
                    'Text still syncs on mobile data. Photos and voice memos wait for Wi-Fi.',
                  )}
                  accessibilityState={{ checked: wifiOnly }}
                  className="rounded-none px-4"
                  rightElement={
                    <View
                      pointerEvents="none"
                      accessible={false}
                      importantForAccessibility="no-hide-descendants">
                      <Switch checked={wifiOnly} />
                    </View>
                  }
                />
                <SettingsRow
                  icon={CloudOff}
                  label={t('Pause sync')}
                  description={t('Edits remain safely queued on this device.')}
                  onPress={() =>
                    void runAction(
                      () => setCloudSyncPaused(snapshot.status !== 'paused'),
                      snapshot.status !== 'paused' ? t('Sync paused') : t('Sync resumed'),
                    )
                  }
                  role="switch"
                  accessibilityLabel={t('Pause sync')}
                  accessibilityHint={t('Edits remain safely queued on this device.')}
                  accessibilityState={{ checked: snapshot.status === 'paused' }}
                  className="rounded-none px-4"
                  rightElement={
                    <View
                      pointerEvents="none"
                      accessible={false}
                      importantForAccessibility="no-hide-descendants">
                      <Switch checked={snapshot.status === 'paused'} />
                    </View>
                  }
                  isLast
                />
              </View>

              <View className="rounded-lg border border-border bg-card overflow-hidden">
                <SettingsRow
                  icon={ShieldCheck}
                  label={t('Verify backup health')}
                  description={
                    snapshot.lastVerifiedAt
                      ? t('Last verified: {date}', {
                          date: formatLocalizedDate(snapshot.lastVerifiedAt, t, {
                            relative: true,
                          }),
                        })
                      : t('Check the cloud copy and repair if needed')
                  }
                  onPress={() =>
                    void runAction(verifyCloudBackup, t('Backup health verified'))
                  }
                  accessibilityLabel={t('Verify backup health')}
                  className="rounded-none px-4"
                />
                <SettingsRow
                  icon={RefreshCw}
                  label={t('Reconnect Google Drive')}
                  onPress={() =>
                    void runAction(reconnectGoogleDrive, t('Google Drive reconnected'))
                  }
                  accessibilityLabel={t('Reconnect Google Drive')}
                  className="rounded-none px-4"
                  isLast
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
                    onPress={() =>
                      void runAction(async () => {
                        await acknowledgeCloudConflicts();
                        await refreshConflicts();
                      }, t('Recovered conflicts marked as reviewed'))
                    }>
                    <Text>{t('Mark as reviewed')}</Text>
                  </Button>
                </View>
              )}

              <View className="rounded-lg border border-destructive/50 bg-card overflow-hidden">
                <SettingsRow
                  icon={Unplug}
                  label={t('Disconnect provider')}
                  description={t('Keep local data and the cloud copy')}
                  onPress={() => setDestructiveAction('disconnect')}
                  accessibilityLabel={t('Disconnect provider')}
                  accessibilityHint={t('Keep local data and the cloud copy')}
                  className="rounded-none px-4"
                />
                <SettingsRow
                  icon={Trash2}
                  label={t('Delete cloud backup')}
                  description={t('Keep local journal data')}
                  onPress={() => setDestructiveAction('delete-backup')}
                  accessibilityLabel={t('Delete cloud backup')}
                  accessibilityHint={t('Keep local journal data')}
                  className="rounded-none px-4"
                />
                <SettingsRow
                  icon={Trash2}
                  label={t('Delete journal everywhere')}
                  description={t('Delete cloud and local journal data')}
                  onPress={() => setDestructiveAction('delete-journal')}
                  accessibilityLabel={t('Delete journal everywhere')}
                  accessibilityHint={t('Delete cloud and local journal data')}
                  className="rounded-none px-4"
                />
                <SettingsRow
                  icon={CloudOff}
                  label={t('Reset this device only')}
                  description={t('Keep the cloud copy and other devices')}
                  onPress={() => setDestructiveAction('reset-device')}
                  accessibilityLabel={t('Reset this device only')}
                  accessibilityHint={t('Keep the cloud copy and other devices')}
                  className="rounded-none px-4"
                  isLast
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
                  {t(
                    'Back up and sync your journal with your own Google Drive. No Tackbok account is created.',
                  )}
                </Text>
              </View>
              <Button variant="primary" size="lg" onPress={() => setStage('disclosure')}>
                <Text>{t('Connect Google Drive')}</Text>
              </Button>
            </View>
          ))}
      </ScrollView>

      <AlertDialog
        open={destructiveAction !== null}
        onOpenChange={(open) => {
          if (!open) setDestructiveAction(null);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{actionCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
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

function SyncProgressPanel({
  phase,
  initialRestore,
}: {
  phase: NonNullable<
    ReturnType<typeof useCloudSyncSnapshot>['snapshot']['activityPhase']
  >;
  initialRestore: boolean;
}) {
  const { t } = useTranslation();
  const phaseIndex = SYNC_PHASES.indexOf(phase);
  const label = syncPhaseLabel(phase, initialRestore, t);

  return (
    <View
      className="gap-3 rounded-xl bg-primary/10 p-3"
      accessibilityRole="progressbar"
      accessibilityValue={{ text: label }}
      accessibilityLiveRegion="polite">
      <View className="flex-row items-center gap-3">
        <View className="size-9 items-center justify-center rounded-full bg-primary/15">
          <ActivityIndicator size="small" colorClassName="accent-primary" />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="font-body-semibold text-foreground">{label}</Text>
          <Text className="text-xs text-foreground">
            {t('Step {current} of {total} in this batch', {
              current: phaseIndex + 1,
              total: SYNC_PHASES.length,
            })}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-1.5" accessibilityElementsHidden>
        {SYNC_PHASES.map((item, index) => (
          <View
            key={item}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              index < phaseIndex
                ? 'bg-primary/50'
                : index === phaseIndex
                  ? 'bg-primary'
                  : 'bg-muted',
            )}
          />
        ))}
      </View>

      <Text className="text-xs leading-4.5 text-foreground">
        {t('Sync runs in safe batches. You can keep using Tackbok.')}
      </Text>
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
        {t(
          'Backups are encrypted in transit and at rest by Google Drive, but are not end-to-end encrypted.',
        )}
      </Text>
      <Text className="font-body-semibold text-foreground">
        {t(
          'If Google shows a Drive access checkbox, select it. Backup cannot connect without this permission.',
        )}
      </Text>
      <Text className="text-foreground">
        {t(
          'Your Google email is stored securely on this device to identify the connected account, and deleted on Disconnect. It is never included in backups, logs, diagnostics, or analytics.',
        )}
      </Text>
      <Text className="text-foreground/75">
        {t('This connects storage only—not a Tackbok account.')}
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
          <Text variant="h3" className="text-foreground">
            {t('Google Drive connected')}
          </Text>
          <Text selectable className="text-sm text-foreground">
            {prepared.accountLabel}
          </Text>
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
              size="flex"
              className="w-full justify-start px-4 py-3"
              disabled={busy}
              onPress={() => onChoose(vault.vaultId)}
              accessibilityLabel={`${
                prepared.localHasData ? t('Restore and merge') : t('Restore cloud backup')
              }. ${
                vault.createdAt
                  ? t('Backup from {date}', {
                      date: formatLocalizedDate(vault.createdAt, t),
                    })
                  : t('Cloud backup {number}', { number: index + 1 })
              }`}>
              <View className="flex-1 gap-0.5">
                <Text className="font-body-bold text-foreground">
                  {vault.createdAt
                    ? t('Backup from {date}', {
                        date: formatLocalizedDate(vault.createdAt, t),
                      })
                    : t('Cloud backup {number}', { number: index + 1 })}
                </Text>
                <Text className="text-sm text-foreground">
                  {prepared.localHasData
                    ? t('Restore and merge')
                    : t('Restore cloud backup')}
                </Text>
              </View>
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
          <Text className="text-foreground/75">{t('Setting up cloud sync…')}</Text>
        </View>
      )}
    </View>
  );
}
