import type {
  CloudConflictSummary,
  CloudSyncActionFailureCategory,
  CloudSyncSnapshot,
} from '~/lib/cloudSync/ui';
import type { TranslationFunction } from '~/lib/i18n/types';
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

export const SYNC_PHASES = ['checking', 'preparing', 'uploading', 'finishing'] as const;

export function syncPhaseLabel(
  phase: NonNullable<CloudSyncSnapshot['activityPhase']>,
  initialRestore: boolean,
  t: TranslationFunction,
): string {
  switch (phase) {
    case 'checking':
      return t('cloud.checkingGoogleDriveForChanges');
    case 'preparing':
      return initialRestore
        ? t('cloud.preparingRestoredJournalData')
        : t('cloud.preparingJournalChanges');
    case 'uploading':
      return t('cloud.mergingChangesAndUpdatingGoogleDrive');
    case 'finishing':
      return t('cloud.savingSyncedJournalDataOnThisDevice');
  }
}

export function entityTypeLabel(
  entityType: CloudConflictSummary['entityType'],
  t: TranslationFunction,
): string {
  switch (entityType) {
    case 'entry':
      return t('cloud.entry');
    case 'tag':
      return t('tags.tag');
    case 'prompt':
      return t('cloud.prompt');
    case 'profile':
      return t('cloud.profile');
  }
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
    'retry-verify-backup': t('cloud.retryAndVerifyBackup'),
    'repair-from-verified-backup': t('cloud.repairFromVerifiedBackup'),
    'inspect-repair-backup': t('cloud.inspectAndRepairBackup'),
    'consolidate-backups': t('cloud.consolidateBackups'),
    'export-repair-backup': t('cloud.exportJournalAndRepairBackup'),
    'free-device-storage': t('cloud.freeDeviceStorageAndRetry'),
    'manage-drive-storage': t('cloud.manageGoogleDriveStorage'),
    'retry-missing-media': t('cloud.retryMissingMedia'),
    'locate-retry-attachment': t('cloud.locateOrRetryAttachment'),
    'retry-journal-preparation': t('cloud.retryJournalPreparation'),
    'acknowledge-disconnect': t('cloud.acknowledgeAndDisconnect'),
    'review-erase-device': t('cloud.reviewDeletionAndEraseThisDevice'),
    'resume-deletion': t('cloud.resumeDeletion'),
    'verify-backup-health': t('cloud.verifyBackupHealth'),
  };
  return labels[action];
}
