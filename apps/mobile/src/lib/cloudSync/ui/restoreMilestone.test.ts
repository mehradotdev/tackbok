import { deriveCloudRestoreMilestone } from './restoreMilestone';

const restore = { vaultId: 'vault-a', startedAt: 1 };
const online = { online: true, onWifi: true };
const restoring = {
  configured: true,
  vaultId: 'vault-a',
  status: 'restoring',
  initialRestore: true,
  pendingDownloadCount: 0,
  downloadedMediaCount: 0,
  failureCategory: null,
  attentionReason: null,
} as const;
const journalReady = {
  ...restoring,
  status: 'queued',
  initialRestore: false,
  pendingDownloadCount: 263,
  downloadedMediaCount: 37,
} as const;

test('follows a restore from journal to attachments to complete', () => {
  expect(deriveCloudRestoreMilestone(restore, restoring, online, false)).toEqual({
    stage: 'journal',
  });
  expect(deriveCloudRestoreMilestone(restore, journalReady, online, false)).toEqual({
    stage: 'media',
    downloaded: 37,
    total: 300,
  });
  expect(
    deriveCloudRestoreMilestone(
      restore,
      {
        ...journalReady,
        status: 'synced',
        pendingDownloadCount: 0,
        downloadedMediaCount: 300,
      },
      online,
      false,
    ),
  ).toEqual({ stage: 'complete' });
});

test('tracks nothing without a marker, for another backup, or after disconnecting', () => {
  expect(deriveCloudRestoreMilestone(null, restoring, online, false)).toBeNull();
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...journalReady, vaultId: 'vault-b' },
      online,
      false,
    ),
  ).toBeNull();
  // An empty snapshot (not loaded yet) must never read as a finished restore.
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...restoring, vaultId: null, configured: false, initialRestore: false },
      online,
      false,
    ),
  ).toBeNull();
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...journalReady, configured: false, pendingDownloadCount: 0 },
      online,
      false,
    ),
  ).toBeNull();
});

test('waits for Wi-Fi only when attachments are left and the device is off Wi-Fi', () => {
  const cellular = { online: true, onWifi: false };
  expect(deriveCloudRestoreMilestone(restore, journalReady, cellular, true)).toEqual({
    stage: 'waiting-for-wifi',
    remaining: 263,
  });
  expect(deriveCloudRestoreMilestone(restore, journalReady, cellular, false)).toEqual({
    stage: 'media',
    downloaded: 37,
    total: 300,
  });
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...restoring, failureCategory: 'wifi-only-media' },
      cellular,
      true,
    ),
  ).toEqual({ stage: 'paused', reason: 'wifi' });
});

test('pauses while offline and resumes reporting progress when back online', () => {
  const offline = { online: false, onWifi: false };
  expect(deriveCloudRestoreMilestone(restore, restoring, offline, false)).toEqual({
    stage: 'paused',
    reason: 'offline',
  });
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...journalReady, failureCategory: 'transient' },
      online,
      false,
    ),
  ).toEqual({ stage: 'paused', reason: 'offline' });
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...journalReady, status: 'paused' },
      online,
      false,
    ),
  ).toEqual({ stage: 'paused', reason: 'sync-paused' });
});

test('reports failures instead of progress or completion', () => {
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...restoring, failureCategory: 'auth' },
      online,
      false,
    ),
  ).toEqual({ stage: 'failed', attentionReason: null, failureCategory: 'auth' });
  expect(
    deriveCloudRestoreMilestone(
      restore,
      {
        ...restoring,
        status: 'warning',
        configured: false,
        attentionReason: 'backup-deleted',
      },
      online,
      false,
    ),
  ).toEqual({
    stage: 'failed',
    attentionReason: 'backup-deleted',
    failureCategory: null,
  });
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...journalReady, failureCategory: 'corrupt' },
      online,
      false,
    ),
  ).toEqual({ stage: 'failed', attentionReason: null, failureCategory: 'corrupt' });
});
