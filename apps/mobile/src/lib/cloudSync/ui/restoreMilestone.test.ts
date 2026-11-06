import { deriveCloudRestoreMilestone } from './restoreMilestone';

const restore = { vaultId: 'vault-a', startedAt: 1 };
const journalRestored = { ...restore, journalRestoredAt: 2 };
const online = { online: true, onWifi: true };
const restoring = {
  configured: true,
  vaultId: 'vault-a',
  status: 'restoring',
  pendingDownloadCount: 0,
  downloadedMediaCount: 0,
  failureCategory: null,
  attentionReason: null,
} as const;
const journalReady = {
  ...restoring,
  status: 'queued',
  pendingDownloadCount: 263,
  downloadedMediaCount: 37,
} as const;

test('follows a restore from journal to attachments to complete', () => {
  expect(deriveCloudRestoreMilestone(restore, restoring, online, false)).toEqual({
    stage: 'journal',
  });
  expect(
    deriveCloudRestoreMilestone(journalRestored, journalReady, online, false),
  ).toEqual({
    stage: 'media',
    downloaded: 37,
    total: 300,
  });
  expect(
    deriveCloudRestoreMilestone(
      journalRestored,
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
      journalRestored,
      { ...journalReady, vaultId: 'vault-b' },
      online,
      false,
    ),
  ).toBeNull();
  // An empty snapshot (not loaded yet) must never read as a finished restore.
  expect(
    deriveCloudRestoreMilestone(
      restore,
      { ...restoring, vaultId: null, configured: false },
      online,
      false,
    ),
  ).toBeNull();
  expect(
    deriveCloudRestoreMilestone(
      journalRestored,
      { ...journalReady, configured: false, pendingDownloadCount: 0 },
      online,
      false,
    ),
  ).toBeNull();
});

test('waits for Wi-Fi only when attachments are left and the device is off Wi-Fi', () => {
  const cellular = { online: true, onWifi: false };
  expect(
    deriveCloudRestoreMilestone(journalRestored, journalReady, cellular, true),
  ).toEqual({
    stage: 'waiting-for-wifi',
    remaining: 263,
  });
  expect(
    deriveCloudRestoreMilestone(journalRestored, journalReady, cellular, false),
  ).toEqual({
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
      journalRestored,
      { ...journalReady, failureCategory: 'transient' },
      online,
      false,
    ),
  ).toEqual({ stage: 'paused', reason: 'offline' });
  expect(
    deriveCloudRestoreMilestone(
      journalRestored,
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
      journalRestored,
      { ...journalReady, failureCategory: 'corrupt' },
      online,
      false,
    ),
  ).toEqual({ stage: 'failed', attentionReason: null, failureCategory: 'corrupt' });
});

test('pause then resume before the journal is applied never reports completion', () => {
  // Pause changes `restoring` to `paused`, and Resume changes it to `idle`, so
  // the snapshot looks synced with no attachments left.
  const resumed = { ...restoring, status: 'synced', pendingDownloadCount: 0 } as const;
  expect(
    deriveCloudRestoreMilestone(
      restore,
      resumed,
      { online: false, onWifi: false },
      false,
    ),
  ).toEqual({ stage: 'paused', reason: 'offline' });
  expect(deriveCloudRestoreMilestone(restore, resumed, online, false)).toEqual({
    stage: 'journal',
  });
  // Only the proof that a pass applied the journal completes it.
  expect(deriveCloudRestoreMilestone(journalRestored, resumed, online, false)).toEqual({
    stage: 'complete',
  });
});

test('a failed pass with no attachments left reports the failure, not completion', () => {
  const synced = { ...journalReady, status: 'synced', pendingDownloadCount: 0 } as const;
  expect(
    deriveCloudRestoreMilestone(
      journalRestored,
      { ...synced, failureCategory: 'auth' },
      online,
      false,
    ),
  ).toEqual({ stage: 'failed', attentionReason: null, failureCategory: 'auth' });
});
