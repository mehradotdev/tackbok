import type { CloudRestoreMarker } from '~/lib/settings';
import type { SyncAttentionReason } from '../snapshot/sync';
import type { CloudSyncActionFailureCategory, CloudSyncSnapshot } from './production';

/**
 * Where a restore from a cloud backup stands. It is derived from durable state
 * (the restore marker's journal proof and media download states), so it
 * survives pause, resume and relaunches.
 */
export type CloudRestoreMilestone =
  | { stage: 'journal' }
  | { stage: 'media'; downloaded: number; total: number }
  | { stage: 'waiting-for-wifi'; remaining: number }
  | { stage: 'paused'; reason: 'offline' | 'wifi' | 'sync-paused' }
  | {
      stage: 'failed';
      attentionReason: SyncAttentionReason | null;
      failureCategory: CloudSyncActionFailureCategory | null;
    }
  | { stage: 'complete' };

export interface CloudRestoreNetwork {
  online: boolean;
  onWifi: boolean;
}

type RestoreSnapshot = Pick<
  CloudSyncSnapshot,
  | 'configured'
  | 'vaultId'
  | 'status'
  | 'pendingDownloadCount'
  | 'downloadedMediaCount'
  | 'failureCategory'
  | 'attentionReason'
  | 'loadedAt'
>;

/** Failures that clear up by themselves once Tackbok is open and online again. */
const RETRYABLE_FAILURES = new Set<CloudSyncActionFailureCategory>([
  'offline',
  'transient',
  'rate-limit',
]);

/**
 * Returns null when no restore is tracked, or when the snapshot belongs to a
 * different (or no longer connected) backup. Completion needs the marker's
 * proof that a sync pass applied the journal, and download counts read after
 * that proof, so a stale snapshot, or a status changed by pause and resume,
 * never reports completion.
 */
export function deriveCloudRestoreMilestone(
  restore: CloudRestoreMarker | null,
  snapshot: RestoreSnapshot,
  network: CloudRestoreNetwork,
  wifiOnlyMedia: boolean,
): CloudRestoreMilestone | null {
  if (!restore || snapshot.vaultId !== restore.vaultId) return null;
  const failureCategory = snapshot.failureCategory;
  if (snapshot.attentionReason) {
    return {
      stage: 'failed',
      attentionReason: snapshot.attentionReason,
      failureCategory,
    };
  }
  if (snapshot.status === 'paused') return { stage: 'paused', reason: 'sync-paused' };
  if (!snapshot.configured) return null;

  const offline =
    !network.online ||
    (failureCategory !== null && RETRYABLE_FAILURES.has(failureCategory));
  const failed =
    failureCategory !== null &&
    !RETRYABLE_FAILURES.has(failureCategory) &&
    failureCategory !== 'wifi-only-media';

  if (failed) return { stage: 'failed', attentionReason: null, failureCategory };
  if (!restore.journalRestoredAt) {
    if (offline) return { stage: 'paused', reason: 'offline' };
    if (failureCategory === 'wifi-only-media') return { stage: 'paused', reason: 'wifi' };
    return { stage: 'journal' };
  }

  // The proof is recorded after the journal's media rows are written. Counts
  // read before it can predate them, so wait for a snapshot read after it.
  if (snapshot.loadedAt <= restore.journalRestoredAt) return { stage: 'journal' };
  const remaining = snapshot.pendingDownloadCount;
  if (remaining === 0) return { stage: 'complete' };
  if (offline) return { stage: 'paused', reason: 'offline' };
  if ((wifiOnlyMedia && !network.onWifi) || failureCategory === 'wifi-only-media') {
    return { stage: 'waiting-for-wifi', remaining };
  }
  return {
    stage: 'media',
    downloaded: snapshot.downloadedMediaCount,
    total: snapshot.downloadedMediaCount + remaining,
  };
}
