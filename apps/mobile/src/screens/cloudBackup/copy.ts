import type {
  CloudSyncActionFailureCategory,
  CloudSyncSnapshot,
  SyncProgress,
  SyncWait,
} from '~/lib/cloudSync/ui';
import { formatByteSize } from '~/lib/i18n/numberFormatting';
import type { SupportedLocale, TranslationFunction } from '~/lib/i18n/types';
import type {
  SyncAttentionReason,
  SyncRecoveryAction,
} from '~/lib/cloudSync/snapshot/sync';

export function statusLabel(
  status: CloudSyncSnapshot['status'],
  t: TranslationFunction,
): string {
  switch (status) {
    case 'syncing':
      return t('cloud.syncing');
    case 'queued':
      return t('cloud.safelyQueued');
    case 'paused':
      return t('cloud.syncPaused');
    case 'warning':
      return t('cloud.attentionNeeded');
    case 'restoring':
      return t('cloud.restoring');
    case 'synced':
      return t('cloud.upToDate');
    default:
      return t('journaling.off');
  }
}

/** One plain line for what sync is doing now. Phases have no reliable total. */
export function syncPhaseLabel(
  phase: NonNullable<CloudSyncSnapshot['activityPhase']>,
  initialRestore: boolean,
  t: TranslationFunction,
): string {
  switch (phase) {
    case 'checking':
      return t('cloud.checkingGoogleDriveForChanges');
    case 'preparing':
      return t('cloud.preparingYourChanges');
    case 'uploading':
      return t('cloud.savingYourChangesToGoogleDrive');
    case 'downloading':
      return initialRestore
        ? t('cloud.restoringYourJournalFromGoogleDrive')
        : t('cloud.gettingChangesFromYourOtherDevices');
    case 'downloading-media':
      return t('cloud.downloadingPhotosAndVoiceNotes');
  }
}

/** The headline for a pass with detailed progress. */
export function syncProgressLabel(
  phase: SyncProgress['phase'],
  initialRestore: boolean,
  t: TranslationFunction,
): string {
  switch (phase) {
    case 'merging':
      return t('cloud.progress.combiningChanges');
    case 'uploading-media':
      return t('cloud.progress.uploadingPhotosAndVoiceNotes');
    default:
      return syncPhaseLabel(phase, initialRestore, t);
  }
}

/** How much of the current step is done, when its total is known. */
export function syncProgressDetail(
  progress: Pick<SyncProgress, 'phase' | 'items' | 'bytes'>,
  locale: SupportedLocale,
  t: TranslationFunction,
): string | null {
  const { phase, items, bytes } = progress;
  const amount = bytes && {
    done: formatByteSize(bytes.done, locale),
    total: formatByteSize(bytes.total, locale),
  };
  switch (phase) {
    case 'checking':
      return items
        ? t('cloud.progress.devicesChecked', { done: items.done, count: items.total })
        : null;
    case 'downloading':
      // Bytes when every file's size is known; otherwise count files.
      if (amount) return t('cloud.progress.doneOfTotal', amount);
      return items
        ? t('cloud.progress.filesDownloaded', { done: items.done, count: items.total })
        : null;
    case 'uploading':
      return amount ? t('cloud.progress.doneOfTotal', amount) : null;
    case 'uploading-media':
    case 'downloading-media':
      if (items && amount) {
        return t('cloud.progress.doneOfTotalWithAmount', {
          done: items.done,
          total: items.total,
          doneAmount: amount.done,
          totalAmount: amount.total,
        });
      }
      if (items) return t('cloud.progress.doneOfTotal', { ...items });
      return amount ? t('cloud.progress.doneOfTotal', amount) : null;
    default:
      return null;
  }
}

/** "Step 2 of 4", with time left only when the tracker could estimate it. */
export function syncProgressOverall(
  progress: Pick<SyncProgress, 'step' | 'totalSteps' | 'etaMs'>,
  t: TranslationFunction,
): string {
  const { step, totalSteps: total, etaMs } = progress;
  if (etaMs === undefined) return t('cloud.progress.stepOfTotal', { step, total });
  const timeLeft =
    etaMs < 60_000
      ? t('cloud.progress.lessThanAMinuteLeft')
      : t('cloud.progress.aboutMinutesLeft', { minutes: Math.round(etaMs / 60_000) });
  return t('cloud.progress.stepOfTotalWithTimeLeft', { step, total, timeLeft });
}

/** Why sync is waiting, with a countdown when the wait has a known end. */
export function syncWaitMessage(
  waiting: SyncWait,
  now: number,
  t: TranslationFunction,
): string {
  const seconds = Math.max(1, Math.ceil(((waiting.until ?? now) - now) / 1_000));
  switch (waiting.reason) {
    case 'rate-limited':
      return t('cloud.progress.rateLimitedRetryingInSeconds', { seconds });
    case 'retry-backoff':
      return t('cloud.progress.connectionProblemRetryingInSeconds', { seconds });
    case 'offline':
      return t('cloud.progress.waitingForInternet');
    case 'wifi-only-media':
      return t('cloud.progress.waitingForWifi');
  }
}

/** Local changes and incoming attachments are different work; never add them. */
export function pendingWorkSummary(
  snapshot: Pick<CloudSyncSnapshot, 'status' | 'queuedCount' | 'pendingDownloadCount'>,
  t: TranslationFunction,
): string | null {
  const parts: string[] = [];
  if (snapshot.queuedCount > 0) {
    parts.push(
      snapshot.status === 'syncing'
        ? t('cloud.countChangesRemaining', { count: snapshot.queuedCount })
        : t('cloud.countChangesSafelyQueued', { count: snapshot.queuedCount }),
    );
  }
  if (snapshot.pendingDownloadCount > 0) {
    parts.push(
      t('cloud.photosAndVoiceNotesToDownloadCount', {
        number: snapshot.pendingDownloadCount,
      }),
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Explains a disabled Sync now button when the status line alone does not. */
export function syncNowUnavailableReason(
  status: CloudSyncSnapshot['status'],
  t: TranslationFunction,
): string | null {
  if (status === 'paused') return t('cloud.resumeSyncToSyncNow');
  if (status === 'warning') return t('cloud.fixTheProblemAboveToSyncNow');
  return null;
}

export function cloudSyncFailureMessage(
  category: CloudSyncActionFailureCategory,
  t: TranslationFunction,
): string {
  switch (category) {
    case 'auth':
      return t('cloud.googleDriveNeedsToBeReconnected');
    case 'quota':
      return t('cloud.googleDriveStorageIsFull');
    case 'rate-limit':
      return t('cloud.googleDriveIsBusyTryAgainShortly');
    case 'offline':
      return t('cloud.noInternetConnectionYourChangesRemainSafelyQueued');
    case 'wifi-only-media':
      return t('cloud.photosAndVoiceMemosAreWaitingForWiFiYour');
    case 'local-media':
      return t('cloud.aPhotoOrVoiceNoteOnThisDeviceCouldNotBeRead');
    case 'corrupt':
      return t('cloud.thisCloudBackupContainsDataTackbokCannotRead');
    case 'transient':
      return t('cloud.googleDriveCouldNotBeReachedYourChangesRemainSafely');
    case 'unknown':
      return t('cloud.cloudSyncCouldNotFinishYourChangesRemainSafelyQueued');
  }
}

export function attentionReasonMessage(
  reason: SyncAttentionReason,
  t: TranslationFunction,
): string {
  const messages: Record<SyncAttentionReason, string> = {
    'authorization-required': t('cloud.googleDriveAuthorizationNeedsAttention'),
    'account-mismatch': t('cloud.thisBackupBelongsToADifferentConnectedGoogleAccount'),
    'consent-incomplete': t('cloud.googleDrivePermissionWasNotFullyGranted'),
    'wrong-vault': t('cloud.theConnectedCloudBackupDoesNotMatchThisJournal'),
    'unsupported-format': t('cloud.thisBackupWasCreatedByANewerTackbokVersion'),
    'invalid-remote-snapshot': t('cloud.aCloudSnapshotFailedItsSafetyChecks'),
    'head-snapshot-missing': t('cloud.aDeviceBackupPointsToAMissingSnapshot'),
    'ambiguous-device-head': t('cloud.twoDifferentBackupsClaimTheSameDeviceVersion'),
    'frontier-too-wide': t('cloud.tooManyIndependentDeviceBackupsNeedConsolidation'),
    'derived-id-collision': t(
      'cloud.aRecoveredItemConflictsWithAnExistingStableIdentifier',
    ),
    'local-storage-full': t('cloud.tackbokCouldNotSafelyStageBackupDataOnThisDevice'),
    'provider-quota-full': t('cloud.googleDriveDoesNotHaveEnoughFreeStorage'),
    'provider-request-rejected': t(
      'cloud.googleDriveRejectedABackupRequestUpdateTackbokAndRetry',
    ),
    'provider-permission-denied': t('cloud.googleDriveDeniedAccessToTheAppBackupFolder'),
    'missing-media': t('cloud.aReferencedPhotoOrVoiceMemoIsUnavailable'),
    'local-media-unreadable': t('cloud.aLocalPhotoOrVoiceMemoCouldNotBeVerified'),
    'normalized-model-not-ready': t('cloud.yourJournalIsNotReadyForCloudSyncYet'),
    'backup-deleted': t('cloud.thisCloudBackupWasDeletedFromAnotherDevice'),
    'journal-deleted': t('cloud.thisJournalWasDeletedEverywhereFromAnotherDevice'),
    'purge-incomplete': t('cloud.cloudDeletionStoppedBeforeEveryBackupObjectWasRemoved'),
    'cleanup-inconsistent': t('cloud.backupCleanupWasStoppedToProtectACurrentSnapshot'),
  };
  return messages[reason];
}

export function recoveryActionLabel(
  action: SyncRecoveryAction,
  t: TranslationFunction,
): string {
  const labels: Record<SyncRecoveryAction, string> = {
    'reconnect-google-drive': t('cloud.reconnectGoogleDrive'),
    'choose-connected-account': t('cloud.chooseTheConnectedAccount'),
    'finish-connection': t('cloud.finishConnection'),
    'reconnect-correct-backup': t('cloud.reconnectToTheCorrectBackup'),
    'update-tackbok': t('cloud.updateTackbok'),
    // These recoveries all retry the sync after its safety checks.
    'retry-verify-backup': t('cloud.retryBackupCheck'),
    'repair-from-verified-backup': t('cloud.retryBackupCheck'),
    'inspect-repair-backup': t('cloud.retryBackupCheck'),
    'consolidate-backups': t('cloud.retryBackupCheck'),
    'export-repair-backup': t('cloud.exportJournalAndRepairBackup'),
    'free-device-storage': t('cloud.freeDeviceStorageAndRetry'),
    'manage-drive-storage': t('cloud.manageGoogleDriveStorage'),
    'retry-missing-media': t('cloud.retryMissingMedia'),
    'locate-retry-attachment': t('cloud.retryAttachment'),
    'retry-journal-preparation': t('cloud.retryJournalPreparation'),
    'acknowledge-disconnect': t('cloud.acknowledgeAndDisconnect'),
    'review-erase-device': t('cloud.reviewDeletionAndEraseThisDevice'),
    'resume-deletion': t('cloud.resumeDeletion'),
    'verify-backup-health': t('cloud.retryBackupCheck'),
  };
  return labels[action];
}
