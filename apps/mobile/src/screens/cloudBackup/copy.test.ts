import { en } from '~/lib/i18n/translations/en';
import { translate } from '~/lib/i18n/translations';
import type { TranslationFunction } from '~/lib/i18n/types';
import {
  cloudSyncFailureMessage,
  pendingWorkSummary,
  recoveryActionLabel,
  syncNowUnavailableReason,
  syncPhaseLabel,
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
