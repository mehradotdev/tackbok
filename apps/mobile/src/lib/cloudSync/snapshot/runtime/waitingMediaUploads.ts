import { useSettingsStore } from '~/lib/settings';

/**
 * New attachments the latest pass left out of the backup until Wi-Fi. The
 * count is persisted with the backup it belongs to, so the status stays
 * "waiting" after a relaunch until a pass finds them uploaded. Another
 * backup's count is never shown, and the first pass after reconnecting
 * replaces it.
 */
export function recordWaitingMediaUploads(vaultId: string, count: number): void {
  const current = useSettingsStore.getState().cloudSyncWaitingUploads;
  if (count === 0 && current?.vaultId !== vaultId) return;
  if (current?.vaultId === vaultId && current.count === count) return;
  useSettingsStore.setState({
    cloudSyncWaitingUploads: count > 0 ? { vaultId, count } : null,
  });
}

export function waitingMediaUploadCount(vaultId: string): number {
  const waiting = useSettingsStore.getState().cloudSyncWaitingUploads;
  return waiting?.vaultId === vaultId && Number.isSafeInteger(waiting.count)
    ? Math.max(0, waiting.count)
    : 0;
}
