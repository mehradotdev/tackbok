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

export const SYNC_PHASES = ['checking', 'preparing', 'uploading', 'finishing'] as const;

export function syncPhaseLabel(
  phase: NonNullable<CloudSyncSnapshot['activityPhase']>,
  initialRestore: boolean,
  t: TranslationFunction,
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

export function entityTypeLabel(
  entityType: CloudConflictSummary['entityType'],
  t: TranslationFunction,
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

export function cloudSyncFailureMessage(
  category: CloudSyncActionFailureCategory,
  t: TranslationFunction,
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
    case 'wifi-only-media':
      return t(
        'Photos and voice memos are waiting for Wi-Fi. Your changes remain safely queued.',
      );
    case 'corrupt':
      return t('This cloud backup contains data Tackbok cannot read.');
    case 'transient':
    case 'unknown':
      return t('Google Drive could not be reached. Your changes remain safely queued.');
  }
}

export function attentionReasonMessage(
  reason: SyncAttentionReason,
  t: TranslationFunction,
): string {
  const messages: Record<SyncAttentionReason, string> = {
    'authorization-required': t('Google Drive authorization needs attention.'),
    'account-mismatch': t('This backup belongs to a different connected Google account.'),
    'consent-incomplete': t('Google Drive permission was not fully granted.'),
    'wrong-vault': t('The connected cloud backup does not match this journal.'),
    'unsupported-format': t('This backup was created by a newer Tackbok version.'),
    'invalid-remote-snapshot': t('A cloud snapshot failed its safety checks.'),
    'head-snapshot-missing': t('A device backup points to a missing snapshot.'),
    'ambiguous-device-head': t('Two different backups claim the same device version.'),
    'frontier-too-wide': t('Too many independent device backups need consolidation.'),
    'derived-id-collision': t(
      'A recovered item conflicts with an existing stable identifier.',
    ),
    'local-storage-full': t('Tackbok could not safely stage backup data on this device.'),
    'provider-quota-full': t('Google Drive does not have enough free storage.'),
    'provider-permission-denied': t(
      'Google Drive denied access to the app backup folder.',
    ),
    'missing-media': t('A referenced photo or voice memo is unavailable.'),
    'local-media-unreadable': t('A local photo or voice memo could not be verified.'),
    'normalized-model-not-ready': t('Your journal is not ready for cloud sync yet.'),
    'backup-deleted': t('This cloud backup was deleted from another device.'),
    'journal-deleted': t('This journal was deleted everywhere from another device.'),
    'purge-incomplete': t(
      'Cloud deletion stopped before every backup object was removed.',
    ),
    'cleanup-inconsistent': t(
      'Backup cleanup was stopped to protect a current snapshot.',
    ),
  };
  return messages[reason];
}

export function recoveryActionLabel(
  action: SyncRecoveryAction,
  t: TranslationFunction,
): string {
  const labels: Record<SyncRecoveryAction, string> = {
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
