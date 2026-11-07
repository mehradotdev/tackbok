import { en } from '~/lib/i18n/translations/en';
import { translate } from '~/lib/i18n/translations';
import type { TranslationFunction } from '~/lib/i18n/types';
import {
  cloudSyncFailureMessage,
  pendingWorkSummary,
  recoveryActionLabel,
  syncNowUnavailableReason,
  syncPhaseLabel,
  syncProgressDetail,
  syncProgressLabel,
  syncProgressOverall,
  syncWaitMessage,
} from './copy';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));

const t = ((key, params) => translate('en', key, params)) as TranslationFunction;

describe('cloud backup status copy', () => {
  test('labels downloads as downloads, never as saving to Google Drive', () => {
    expect(syncPhaseLabel('downloading', false, t)).toBe(
      en['cloud.gettingChangesFromYourOtherDevices'],
    );
    expect(syncPhaseLabel('downloading', true, t)).toBe(
      en['cloud.restoringYourJournalFromGoogleDrive'],
    );
    expect(syncPhaseLabel('downloading-media', false, t)).toBe(
      en['cloud.downloadingPhotosAndVoiceNotes'],
    );
    expect(syncPhaseLabel('uploading', false, t)).toBe(
      en['cloud.savingYourChangesToGoogleDrive'],
    );
  });

  test('keeps local changes and incoming attachments as separate counts', () => {
    expect(
      pendingWorkSummary(
        { status: 'syncing', queuedCount: 2, pendingDownloadCount: 40 },
        t,
      ),
    ).toBe('2 changes remaining · Photos and voice notes to download: 40');
    expect(
      pendingWorkSummary(
        { status: 'queued', queuedCount: 0, pendingDownloadCount: 3 },
        t,
      ),
    ).toBe('Photos and voice notes to download: 3');
    expect(
      pendingWorkSummary(
        { status: 'queued', queuedCount: 1, pendingDownloadCount: 0 },
        t,
      ),
    ).toBe('1 change saved, waiting to sync');
    expect(
      pendingWorkSummary(
        { status: 'synced', queuedCount: 0, pendingDownloadCount: 0 },
        t,
      ),
    ).toBeNull();
  });

  test('explains why Sync now is unavailable', () => {
    expect(syncNowUnavailableReason('paused', t)).toBe(en['cloud.resumeSyncToSyncNow']);
    expect(syncNowUnavailableReason('warning', t)).toBe(
      en['cloud.fixTheProblemAboveToSyncNow'],
    );
    expect(syncNowUnavailableReason('synced', t)).toBeNull();
  });

  test('describes a local attachment problem as local, not as unreadable cloud data', () => {
    expect(cloudSyncFailureMessage('local-media', t)).toBe(
      en['cloud.aPhotoOrVoiceNoteOnThisDeviceCouldNotBeRead'],
    );
    expect(cloudSyncFailureMessage('local-media', t)).not.toBe(
      cloudSyncFailureMessage('corrupt', t),
    );
  });

  test('retry-only recoveries say they retry', () => {
    for (const action of [
      'retry-verify-backup',
      'repair-from-verified-backup',
      'inspect-repair-backup',
      'consolidate-backups',
      'verify-backup-health',
    ] as const) {
      expect(recoveryActionLabel(action, t)).toBe(en['cloud.retryBackupCheck']);
    }
    expect(recoveryActionLabel('locate-retry-attachment', t)).toBe(
      en['cloud.retryAttachment'],
    );
  });
});

describe('detailed sync progress copy', () => {
  test('names merging and media uploads, and reuses the phase labels otherwise', () => {
    expect(syncProgressLabel('merging', false, t)).toBe('Combining changes…');
    expect(syncProgressLabel('uploading-media', false, t)).toBe(
      'Uploading photos and voice notes…',
    );
    expect(syncProgressLabel('downloading', true, t)).toBe(
      en['cloud.restoringYourJournalFromGoogleDrive'],
    );
  });

  test('shows how much of the step is done in plain words', () => {
    expect(
      syncProgressDetail({ phase: 'checking', items: { done: 2, total: 3 } }, 'en', t),
    ).toBe('2 of 3 devices checked');
    expect(
      syncProgressDetail({ phase: 'checking', items: { done: 0, total: 1 } }, 'en', t),
    ).toBe('0 of 1 device checked');
    expect(
      syncProgressDetail(
        {
          phase: 'downloading',
          items: { done: 1, total: 3 },
          bytes: { done: 1_200_000, total: 4_800_000 },
        },
        'en',
        t,
      ),
    ).toBe('1.2 MB of 4.8 MB');
    // Without every file's size, count files instead.
    expect(
      syncProgressDetail({ phase: 'downloading', items: { done: 1, total: 3 } }, 'en', t),
    ).toBe('1 of 3 files downloaded');
    expect(
      syncProgressDetail(
        { phase: 'uploading', bytes: { done: 640_000, total: 2_100_000 } },
        'en',
        t,
      ),
    ).toBe('640 kB of 2.1 MB');
    expect(
      syncProgressDetail(
        {
          phase: 'uploading-media',
          items: { done: 3, total: 12 },
          bytes: { done: 8_400_000, total: 31_000_000 },
        },
        'en',
        t,
      ),
    ).toBe('3 of 12 (8.4 MB of 31 MB)');
    expect(syncProgressDetail({ phase: 'merging' }, 'en', t)).toBeNull();
    expect(syncProgressDetail({ phase: 'uploading' }, 'en', t)).toBeNull();
  });

  test('adds time left to the step only when it was estimated', () => {
    expect(syncProgressOverall({ step: 2, totalSteps: 4 }, t)).toBe('Step 2 of 4');
    expect(syncProgressOverall({ step: 2, totalSteps: 4, etaMs: 75_000 }, t)).toBe(
      'Step 2 of 4 · about 1 min left',
    );
    expect(syncProgressOverall({ step: 4, totalSteps: 4, etaMs: 20_000 }, t)).toBe(
      'Step 4 of 4 · less than a minute left',
    );
  });

  test('explains each wait, counting down to a known retry', () => {
    const now = 1_000_000;
    expect(syncWaitMessage({ reason: 'rate-limited', until: now + 39_200 }, now, t)).toBe(
      'Google asked us to slow down. Trying again in 40 s',
    );
    expect(syncWaitMessage({ reason: 'retry-backoff', until: now + 5_000 }, now, t)).toBe(
      'Connection problem. Retrying in 5 s',
    );
    // A retry that is due now never reads as zero seconds.
    expect(syncWaitMessage({ reason: 'retry-backoff', until: now - 10 }, now, t)).toBe(
      'Connection problem. Retrying in 1 s',
    );
    expect(syncWaitMessage({ reason: 'offline' }, now, t)).toBe('Waiting for internet…');
    expect(syncWaitMessage({ reason: 'wifi-only-media' }, now, t)).toBe(
      'Waiting for Wi-Fi to sync photos and voice notes',
    );
  });
});
