import { cloudConnectionLifecycle } from '../../runtime/connectionLifecycle';

/**
 * New attachments the latest pass left out of the backup until Wi-Fi, per
 * vault. Kept in memory: after a relaunch the next pass counts them again.
 */
const waiting = new Map<string, number>();
cloudConnectionLifecycle.addChangeListener(() => waiting.clear());

export function recordWaitingMediaUploads(vaultId: string, count: number): void {
  waiting.set(vaultId, count);
}

export function waitingMediaUploadCount(vaultId: string): number {
  return waiting.get(vaultId) ?? 0;
}
