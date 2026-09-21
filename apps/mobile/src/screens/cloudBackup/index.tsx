import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  ScrollView,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
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
  Smartphone,
  Trash2,
  Unplug,
  Wifi,
  X,
} from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from '~/lib/i18n';
import { formatLocalizedDate } from '~/lib/i18n/dateFormatting';
import { useSettingsStore } from '~/lib/settings';
import { CloudAuthError } from '~/lib/cloudSync/auth';
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
  retrySyncAttentionReason,
  revokeCloudVault,
  setCloudSyncPaused,
  syncNow,
  useCloudSyncSnapshot,
  type CloudConflictSummary,
  CloudSyncActionError,
  type PreparedGoogleConnection,
} from '~/lib/cloudSync/ui';
import { SnapshotProviderError } from '~/lib/cloudSync/snapshot/sync';
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
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { SetupProgress } from './setup-progress';
import {
  attentionReasonMessage,
  cloudSyncFailureMessage,
  entityTypeLabel,
  recoveryActionLabel,
  statusLabel,
  SYNC_PHASES,
  syncPhaseLabel,
} from './copy';

type SetupStage = 'overview' | 'disclosure' | 'authorizing' | 'choose' | 'working';
type DataAction = 'delete-backup' | 'delete-journal' | 'reset-device';
type DestructiveAction = 'disconnect' | 'finish-journal-deletion' | DataAction;

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
  const manageDataSheetRef = useRef<TrueSheet>(null);
  const [sheetBackgroundColor, themeRadiusStr, mutedForegroundColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;
  const [stage, setStage] = useState<SetupStage>(
    origin === 'onboarding' ? 'disclosure' : 'overview',
  );
  const [prepared, setPrepared] = useState<PreparedGoogleConnection | null>(null);
  const mountedRef = useRef(true);
  const [conflicts, setConflicts] = useState<CloudConflictSummary[]>([]);
  const conflictRefreshSequenceRef = useRef(0);
  const actionRunningRef = useRef(false);
  const [actionRunning, setActionRunning] = useState(false);
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAction | null>(
    null,
  );
  const [deletingJournalEverywhere, setDeletingJournalEverywhere] = useState(false);
  const providerName = t('cloud.googleDrive');
  const disconnectLabel = t('cloud.disconnectProvider', {
    provider: providerName,
  });

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(origin === 'onboarding' ? '/onboarding/welcome' : '/');
  }, [origin, router]);

  const refreshConflicts = useCallback(async () => {
    const sequence = ++conflictRefreshSequenceRef.current;
    const next = await listUnacknowledgedCloudConflicts();
    if (sequence === conflictRefreshSequenceRef.current) setConflicts(next);
  }, []);

  useEffect(() => {
    void refreshConflicts();
  }, [refreshConflicts, snapshot.conflictCount]);

  useEffect(() => {
    if (snapshot.status === 'syncing' || snapshot.status === 'restoring') {
      AccessibilityInfo.announceForAccessibility(statusLabel(snapshot.status, t));
    }
  }, [snapshot.status, t]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void cancelPreparedGoogleDriveConnection();
    };
  }, []);

  const handleAuthorize = useCallback(async () => {
    setStage('authorizing');
    try {
      const connection = await prepareGoogleDriveConnection();
      if (!mountedRef.current) {
        await cancelPreparedGoogleDriveConnection();
        return;
      }
      if (origin === 'onboarding' && connection.availableVaults.length === 0) {
        await cancelPreparedGoogleDriveConnection();
        toast.warning(t('cloud.noTackbokBackupFoundInThisGoogleAccount'));
        handleBack();
        return;
      }
      setPrepared(connection);
      setStage('choose');
    } catch (error) {
      if (!mountedRef.current) {
        await cancelPreparedGoogleDriveConnection();
        return;
      }
      const permissionMissing =
        (error instanceof CloudAuthError && error.code === 'permission-required') ||
        (error instanceof SnapshotProviderError &&
          error.code === 'authorization-required');
      toast.error(
        permissionMissing
          ? t('cloud.googleDriveAccessIsRequiredTryAgainAndSelectThe')
          : t('cloud.googleDriveConnectionWasNotCompleted'),
      );
      if (origin === 'onboarding') handleBack();
      else setStage('disclosure');
    }
  }, [handleBack, origin, t]);

  const handleComplete = useCallback(
    async (vaultId?: string, createNew = false) => {
      setStage('working');
      try {
        await completeGoogleDriveConnection({ origin, vaultId, createNew });
        await refresh();
        // Setup can finish after the user has left. Keep the connection, but
        // do not let this screen's stale callback change their navigation/UI.
        if (!mountedRef.current) return;
        toast.success(
          origin === 'onboarding'
            ? t('cloud.cloudRestoreStarted')
            : t('cloud.cloudBackupConnected'),
        );
        if (origin === 'onboarding') {
          setHasCompletedOnboarding(true);
          router.replace('/');
        } else {
          // Local state is enough to leave setup. Replacing the route here
          // could replace Home if the user backed out while setup was running.
          setPrepared(null);
          setStage('overview');
        }
      } catch {
        if (!mountedRef.current) return;
        setStage('choose');
        toast.error(t('cloud.cloudBackupCouldNotBeUpdated'));
      }
    },
    [origin, refresh, router, setHasCompletedOnboarding, t],
  );

  const runAction = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      if (actionRunningRef.current) return;
      actionRunningRef.current = true;
      setActionRunning(true);
      try {
        const result = await action();
        if (result === false) throw new Error('action did not complete');
        await refresh();
        toast.success(success);
      } catch (error) {
        toast.error(
          error instanceof CloudSyncActionError
            ? cloudSyncFailureMessage(error.category, t)
            : t('cloud.cloudBackupCouldNotBeUpdated'),
        );
      } finally {
        actionRunningRef.current = false;
        if (mountedRef.current) setActionRunning(false);
      }
    },
    [refresh, t],
  );

  const clearLocalPresentation = useCallback(async () => {
    resetSettings();
    queryClient.clear();
    router.replace('/onboarding/welcome');
  }, [queryClient, resetSettings, router]);

  const completeJournalDeletion = useCallback(async () => {
    setDeletingJournalEverywhere(true);
    AccessibilityInfo.announceForAccessibility(t('cloud.deletingJournalEverywhere'));
    try {
      await deleteJournalEverywhere();
      await clearLocalPresentation();
    } catch {
      setDeletingJournalEverywhere(false);
      toast.error(t('cloud.cloudBackupCouldNotBeUpdated'));
    }
  }, [clearLocalPresentation, t]);

  const handleRecoveryAction = useCallback(async () => {
    const reason = snapshot.attentionReason;
    const action = snapshot.recoveryAction;
    if (!reason || !action) return;
    if (
      action === 'choose-connected-account' ||
      action === 'finish-connection' ||
      action === 'reconnect-correct-backup'
    ) {
      await runAction(async () => {
        await disconnectGoogleDrive();
        setPrepared(null);
        setStage('disclosure');
      }, t('cloud.chooseAGoogleAccountToReconnect'));
      return;
    }
    if (action === 'reconnect-google-drive') {
      await runAction(reconnectGoogleDrive, t('cloud.googleDriveReconnected'));
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
      await runAction(
        disconnectGoogleDrive,
        t('cloud.googleDriveDisconnectedOnThisDevice'),
      );
      return;
    }
    if (action === 'review-erase-device') {
      setDestructiveAction('finish-journal-deletion');
      return;
    }
    if (action === 'resume-deletion') {
      if (snapshot.revocationKind === 'journal-deleted') {
        await completeJournalDeletion();
      } else {
        await runAction(
          () => revokeCloudVault('backup-deleted'),
          t('cloud.cloudDeletionCompleted'),
        );
      }
      return;
    }
    if (action === 'export-repair-backup') {
      router.push('/settings');
      toast.warning(t('cloud.exportOrRepairTheAffectedJournalDataThenReturnAnd'));
      return;
    }
    if (action === 'locate-retry-attachment') {
      await runAction(
        () => retrySyncAttentionReason(reason),
        t('cloud.cloudBackupRetryCompleted'),
      );
      return;
    }
    await runAction(
      () => retrySyncAttentionReason(reason),
      t('cloud.cloudBackupRetryCompleted'),
    );
  }, [
    completeJournalDeletion,
    router,
    runAction,
    snapshot.attentionReason,
    snapshot.recoveryAction,
    snapshot.revocationKind,
    t,
  ]);

  const handleDestructiveAction = useCallback(
    async (action: DestructiveAction | null) => {
      setDestructiveAction(null);
      if (!action) return;
      try {
        if (action === 'disconnect') {
          await disconnectGoogleDrive();
          toast.success(t('cloud.googleDriveDisconnectedOnThisDevice'));
        } else if (action === 'delete-backup') {
          await revokeCloudVault('backup-deleted');
          toast.success(t('cloud.cloudBackupDeleted'));
        } else if (action === 'delete-journal') {
          await completeJournalDeletion();
          return;
        } else if (action === 'reset-device') {
          await resetThisDeviceOnly();
          await clearLocalPresentation();
          return;
        } else {
          await completeJournalDeletion();
          return;
        }
        await refresh();
      } catch {
        toast.error(t('cloud.cloudBackupCouldNotBeUpdated'));
      }
    },
    [clearLocalPresentation, completeJournalDeletion, refresh, t],
  );

  const handleChooseDataAction = useCallback(async (action: DataAction) => {
    await manageDataSheetRef.current?.dismiss();
    setDestructiveAction(action);
  }, []);

  const actionCopy =
    destructiveAction === 'disconnect'
      ? {
          title: t('cloud.disconnectProviderFromThisDevice', {
            provider: providerName,
          }),
          description: t('cloud.localDataAndTheCloudBackupWillBothRemainOther'),
          button: t('cloud.disconnect'),
        }
      : destructiveAction === 'delete-backup'
        ? {
            title: t('cloud.deleteCloudBackup2'),
            description: t(
              'cloud.theCloudCopyWillBePermanentlyDeletedAfterVerificationLocal',
            ),
            button: t('cloud.deleteCloudBackup'),
          }
        : destructiveAction === 'delete-journal'
          ? {
              title: t('cloud.deleteJournalEverywhere2'),
              description: t('cloud.theCloudCopyAndThisDevicesJournalWillBePermanently'),
              button: t('cloud.deleteJournalEverywhere'),
            }
          : destructiveAction === 'reset-device'
            ? {
                title: t('cloud.resetThisDeviceOnly2'),
                description: t(
                  'cloud.thisDeviceDisconnectsFirstThenDeletesItsLocalJournalThe',
                ),
                button: t('cloud.resetThisDeviceOnly'),
              }
            : {
                title: t('cloud.finishDeletingThisJournal'),
                description: t(
                  'cloud.cloudDeletionIsAlreadyRecordedEraseTheRemainingJournalData',
                ),
                button: t('cloud.finishDeletion'),
              };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center border-b border-border px-safe-or-4 pt-safe-or-3 pb-3">
        <Button
          variant="ghost"
          className="p-1 mr-1"
          onPress={handleBack}
          accessibilityLabel={t('common.back')}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} className="text-foreground" />
        </Button>
        <Text variant="h2" className="font-heading text-foreground py-1">
          {t('cloud.cloudBackupSync')}
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
                  ? t('cloud.journalDeletionReceived')
                  : t('cloud.cloudBackupDeletionReceived')}
              </Text>
            </View>
            <Text className="text-sm text-foreground">
              {snapshot.revocationKind === 'journal-deleted'
                ? t('cloud.thisJournalWasDeletedEverywhereThisDeviceIsDisconnected')
                : t('cloud.thisCloudBackupWasDeletedLocalJournalDataRemainsOn')}
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
            snapshot={snapshot}
            onChoose={(vaultId) => void handleComplete(vaultId)}
            onCreate={() => void handleComplete(undefined, true)}
          />
        )}

        {stage === 'overview' &&
          (snapshot.configured ||
          snapshot.status === 'paused' ||
          Boolean(snapshot.attentionReason && snapshot.recoveryAction) ? (
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
                        {snapshot.accountLabel ?? t('cloud.googleDrive')}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text className="text-sm text-foreground">
                  {snapshot.queuedCount > 0
                    ? snapshot.status === 'syncing'
                      ? t('cloud.countChangesRemaining', { count: snapshot.queuedCount })
                      : t('cloud.countChangesSafelyQueued', {
                          count: snapshot.queuedCount,
                        })
                    : snapshot.lastSuccessAt
                      ? t('cloud.lastSuccessfulSyncDate', {
                          date: formatLocalizedDate(snapshot.lastSuccessAt, t, {
                            relative: true,
                          }),
                        })
                      : t('cloud.waitingForTheFirstSuccessfulSync')}
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
                      disabled={actionRunning}
                      accessibilityState={{
                        busy: actionRunning,
                        disabled: actionRunning,
                      }}
                      onPress={() => void handleRecoveryAction()}
                      accessibilityLabel={recoveryActionLabel(
                        snapshot.recoveryAction,
                        t,
                      )}>
                      {actionRunning && (
                        <SpinningRefreshIcon className="text-foreground size-5" />
                      )}
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
                    {t('cloud.youCanLeaveThisScreenSyncingResumesWhenTackbokIs')}
                  </Text>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  disabled={
                    actionRunning ||
                    snapshot.status === 'syncing' ||
                    snapshot.status === 'paused' ||
                    snapshot.status === 'warning'
                  }
                  onPress={() => void runAction(syncNow, t('cloud.syncCompleted'))}
                  accessibilityLabel={t('cloud.syncNow')}>
                  {snapshot.status === 'syncing' ? (
                    <SpinningRefreshIcon className="text-primary-foreground size-5" />
                  ) : (
                    <Icon as={RefreshCw} className="text-primary-foreground size-5" />
                  )}
                  <Text>
                    {snapshot.status === 'syncing'
                      ? t('cloud.syncing')
                      : t('cloud.syncNow')}
                  </Text>
                </Button>
              </View>

              <View className="rounded-lg border border-border bg-card overflow-hidden">
                <SettingsRow
                  icon={Wifi}
                  label={t('cloud.syncMediaOnWiFiOnly')}
                  description={t('cloud.journalTextStillSyncsOnMobileData')}
                  onPress={() => setWifiOnly(!wifiOnly)}
                  role="switch"
                  accessibilityLabel={t('cloud.syncMediaOnWiFiOnly')}
                  accessibilityHint={t('cloud.journalTextStillSyncsOnMobileData')}
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
                  label={t('cloud.pauseSync')}
                  description={t('cloud.editsRemainSafelyQueuedOnThisDevice')}
                  onPress={() =>
                    void runAction(
                      () => setCloudSyncPaused(snapshot.status !== 'paused'),
                      snapshot.status !== 'paused'
                        ? t('cloud.syncPaused')
                        : t('cloud.syncResumed'),
                    )
                  }
                  role="switch"
                  accessibilityLabel={t('cloud.pauseSync')}
                  accessibilityHint={t('cloud.editsRemainSafelyQueuedOnThisDevice')}
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

              {conflicts.length > 0 && (
                <View className="rounded-lg border border-border bg-card p-4 gap-3">
                  <View className="flex-row items-center gap-2">
                    <Icon as={FileClock} className="text-foreground size-5" />
                    <Text className="font-body-bold text-foreground">
                      {t('cloud.recoveredConflicts')}
                    </Text>
                  </View>
                  {conflicts.map((conflict) => (
                    <Text key={conflict.conflictId} className="text-sm text-foreground">
                      {t('cloud.recoveredTypeConflictCountPreservedAlternatives', {
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
                      }, t('cloud.recoveredConflictsMarkedAsReviewed'))
                    }>
                    <Text>{t('cloud.markAsReviewed')}</Text>
                  </Button>
                </View>
              )}

              <View className="rounded-lg border border-border bg-card overflow-hidden">
                <SettingsRow
                  icon={Unplug}
                  label={disconnectLabel}
                  description={t('cloud.keepLocalDataAndTheCloudCopy')}
                  onPress={() => setDestructiveAction('disconnect')}
                  accessibilityLabel={disconnectLabel}
                  accessibilityHint={t('cloud.keepLocalDataAndTheCloudCopy')}
                  className="rounded-none px-4"
                  isLast
                />
              </View>

              <View className="rounded-lg border border-destructive/50 bg-card overflow-hidden">
                <SettingsRow
                  icon={Trash2}
                  label={t('cloud.deleteOrResetData')}
                  description={t('cloud.chooseWhichCopiesOfYourJournalToRemove')}
                  onPress={() => void manageDataSheetRef.current?.present()}
                  accessibilityLabel={t('cloud.deleteOrResetData')}
                  accessibilityHint={t('cloud.chooseWhichCopiesOfYourJournalToRemove')}
                  className="rounded-none px-4"
                  showChevron
                  isLast
                />
              </View>
            </>
          ) : (
            <View className="rounded-lg border border-border bg-card p-5 gap-4">
              <View className="items-center gap-3">
                <Icon as={Cloud} className="text-foreground size-10" />
                <Text variant="h3" className="text-center text-foreground">
                  {t('cloud.optionalCloudBackup')}
                </Text>
                <Text className="text-center text-foreground">
                  {t('cloud.backUpAndSyncYourJournalWithYourOwnGoogle')}
                </Text>
              </View>
              <Button variant="primary" size="lg" onPress={() => setStage('disclosure')}>
                <Text>{t('cloud.connectGoogleDrive')}</Text>
              </Button>
            </View>
          ))}
      </ScrollView>

      <TrueSheet
        ref={manageDataSheetRef}
        detents={['auto']}
        cornerRadius={sheetRadius}
        grabber
        grabberOptions={{
          topMargin: 8,
          color: mutedForegroundColor as string,
          adaptive: false,
        }}
        backgroundColor={sheetBackgroundColor as string}>
        <View className="bg-background pt-2 pb-8">
          <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
            <Text className="text-xl font-body-bold text-foreground">
              {t('cloud.deleteOrResetData')}
            </Text>
            <Button
              onPress={() => void manageDataSheetRef.current?.dismiss()}
              variant="ghost"
              className="p-1 -mr-2"
              accessibilityLabel={t('common.close')}>
              <Icon as={X} className="text-foreground" />
            </Button>
          </View>

          <Text className="px-5 pb-3 text-sm text-muted-foreground">
            {t('cloud.chooseWhichCopiesOfYourJournalToRemove')}
          </Text>

          <View className="mx-4 rounded-lg border border-destructive/50 bg-card overflow-hidden">
            <SettingsRow
              icon={CloudOff}
              label={t('cloud.deleteCloudBackup')}
              description={t('cloud.keepLocalJournalData')}
              onPress={() => void handleChooseDataAction('delete-backup')}
              accessibilityLabel={t('cloud.deleteCloudBackup')}
              accessibilityHint={t('cloud.keepLocalJournalData')}
              className="rounded-none px-4"
            />
            <SettingsRow
              icon={Smartphone}
              label={t('cloud.resetThisDeviceOnly')}
              description={t('cloud.keepTheCloudCopyAndOtherDevices')}
              onPress={() => void handleChooseDataAction('reset-device')}
              accessibilityLabel={t('cloud.resetThisDeviceOnly')}
              accessibilityHint={t('cloud.keepTheCloudCopyAndOtherDevices')}
              className="rounded-none px-4"
            />
            <SettingsRow
              icon={Trash2}
              label={t('cloud.deleteJournalEverywhere')}
              description={t('cloud.deleteCloudAndLocalJournalData')}
              onPress={() => void handleChooseDataAction('delete-journal')}
              accessibilityLabel={t('cloud.deleteJournalEverywhere')}
              accessibilityHint={t('cloud.deleteCloudAndLocalJournalData')}
              className="rounded-none px-4"
              isLast
            />
          </View>
        </View>
      </TrueSheet>

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
              <Text>{t('common.cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogDestructiveAction
              delaySeconds={DELETE_CONFIRM_DELAY_SECONDS}
              onPress={() => void handleDestructiveAction(destructiveAction)}>
              <Text>{actionCopy.button}</Text>
            </AlertDialogDestructiveAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deletingJournalEverywhere && (
        <View
          className="absolute inset-0 z-50 items-center justify-center bg-background/95 px-safe-or-6"
          accessibilityViewIsModal
          accessibilityRole="progressbar"
          accessibilityLabel={t('cloud.deletingJournalEverywhere')}
          accessibilityLiveRegion="assertive">
          <View className="w-full max-w-md items-center gap-4 rounded-xl border border-border bg-card p-6">
            <ActivityIndicator size="large" colorClassName="accent-primary" />
            <Text variant="h3" className="text-center text-foreground">
              {t('cloud.deletingJournalEverywhere')}
            </Text>
            <Text className="text-center text-muted-foreground">
              {t('cloud.removingTheCloudBackupAndJournalDataKeepTackbokOpen')}
            </Text>
          </View>
        </View>
      )}
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
            {t('cloud.stepCurrentOfTotalInThisBatch', {
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
        {t('cloud.syncRunsInSafeBatchesYouCanKeepUsingTackbok')}
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
          {t('cloud.beforeYouConnect')}
        </Text>
      </View>
      <Text className="text-foreground">
        {t('cloud.backupsAreEncryptedInTransitAndAtRestByGoogle')}
      </Text>
      <Text className="font-body-semibold text-foreground">
        {t('cloud.ifGoogleShowsADriveAccessCheckboxSelectItBackup')}
      </Text>
      <Text className="text-foreground">
        {t('cloud.yourGoogleEmailIsStoredSecurelyOnThisDeviceTo')}
      </Text>
      <Button variant="primary" size="lg" disabled={busy} onPress={onContinue}>
        {busy && <ActivityIndicator colorClassName="accent-primary-foreground" />}
        <Text>{busy ? t('cloud.connecting') : t('cloud.connectGoogleDrive')}</Text>
      </Button>
    </View>
  );
}

function ConnectionChoice({
  prepared,
  origin,
  busy,
  snapshot,
  onChoose,
  onCreate,
}: {
  prepared: PreparedGoogleConnection;
  origin: 'settings' | 'onboarding';
  busy: boolean;
  snapshot: ReturnType<typeof useCloudSyncSnapshot>['snapshot'];
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
            {t('cloud.googleDriveConnected')}
          </Text>
          <Text selectable className="text-sm text-foreground">
            {prepared.accountLabel}
          </Text>
        </View>
      </View>
      {prepared.availableVaults.length > 0 ? (
        <>
          {!busy && (
            <Text className="text-foreground">
              {prepared.localHasData
                ? t('cloud.chooseABackupToMergeWithThisJournalBothSides')
                : t('cloud.chooseABackupToRestoreOnThisDevice')}
            </Text>
          )}
          {prepared.availableVaults.map((vault, index) => (
            <Button
              key={vault.vaultId}
              variant="outline"
              size="flex"
              className="w-full justify-start px-4 py-3"
              disabled={busy}
              onPress={() => onChoose(vault.vaultId)}
              accessibilityLabel={`${
                prepared.localHasData ? t('cloud.merge') : t('cloud.restoreCloudBackup')
              }. ${
                vault.createdAt
                  ? t('cloud.backupFromDate', {
                      date: formatLocalizedDate(vault.createdAt, t),
                    })
                  : t('cloud.cloudBackupNumber', { number: index + 1 })
              }`}>
              <View className="flex-1 gap-0.5">
                <Text className="font-body-bold text-foreground">
                  {vault.createdAt
                    ? t('cloud.backupFromDate', {
                        date: formatLocalizedDate(vault.createdAt, t),
                      })
                    : t('cloud.cloudBackupNumber', { number: index + 1 })}
                </Text>
                <Text className="text-sm text-foreground">
                  {prepared.localHasData
                    ? t('cloud.merge')
                    : t('cloud.restoreCloudBackup')}
                </Text>
              </View>
            </Button>
          ))}
        </>
      ) : origin === 'settings' ? (
        <>
          <Text className="text-foreground">
            {t('cloud.noExistingTackbokBackupWasFoundCreateOneForThis')}
          </Text>
          <Button variant="primary" size="lg" disabled={busy} onPress={onCreate}>
            <Text>{t('cloud.createCloudBackup')}</Text>
          </Button>
        </>
      ) : null}
      {busy && <SetupProgress snapshot={snapshot} />}
    </View>
  );
}
