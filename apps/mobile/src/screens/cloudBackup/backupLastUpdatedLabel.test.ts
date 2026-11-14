import { translate } from '~/lib/i18n/translations';
import type { SupportedLocale, TranslationFunction } from '~/lib/i18n/types';
import { en } from '~/lib/i18n/translations/en';
import { backupLastUpdatedLabel, restoreStatusNote } from './copy';

let mock24hour = true;
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-GB', regionCode: 'GB' }],
  getCalendars: () => [{ uses24hourClock: mock24hour }],
}));
jest.mock('~/lib/kvStorage', () => ({
  kvStorage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
  },
}));

function translator(locale: SupportedLocale): TranslationFunction {
  return Object.assign(
    (key: Parameters<TranslationFunction>[0], params?: Record<string, string | number>) =>
      translate(locale, key, params),
    { locale },
  ) as TranslationFunction;
}

const updatedAt = new Date(2026, 10, 14, 17, 5).getTime();

beforeEach(() => {
  mock24hour = true;
});

describe('the last-updated label of a backup to restore', () => {
  test('shows the date and the time on a 24-hour phone', () => {
    expect(
      backupLastUpdatedLabel({ vaultId: 'a', updatedAt }, 0, translator('en'), 'en'),
    ).toBe('Last updated 14 Nov 2026, 17:05');
  });

  test('follows a 12-hour phone', () => {
    mock24hour = false;
    expect(
      backupLastUpdatedLabel({ vaultId: 'a', updatedAt }, 0, translator('en'), 'en'),
    ).toMatch(/^Last updated 14 Nov 2026, 5:05\s*pm$/i);
  });

  test('includes the time in every catalog, right-to-left ones too', () => {
    for (const locale of ['ar', 'he', 'de', 'zh-CN'] as const) {
      const label = backupLastUpdatedLabel(
        { vaultId: 'a', updatedAt },
        0,
        translator(locale),
        locale,
      );
      expect(label).not.toContain('{');
      // Digits may be localized, so look for the minutes in any script.
      expect(label).toMatch(/05|٠٥/);
    }
  });

  test('numbers a backup without an update time', () => {
    expect(
      backupLastUpdatedLabel(
        { vaultId: 'a', updatedAt: null },
        1,
        translator('en'),
        'en',
      ),
    ).toBe('Cloud backup 2');
  });
});

describe('the line under a restore status', () => {
  const t = translator('en');
  const note = (
    status: 'syncing' | 'restoring' | 'synced',
    failureCategory: Parameters<typeof restoreStatusNote>[0]['failureCategory'] = null,
    initialRestore = true,
  ) => restoreStatusNote({ status, initialRestore, failureCategory }, t);
  const leave = en['cloud.youCanLeaveThisScreenSyncingResumesWhenTackbokIs'];
  const paused = en['cloud.restorePausedItContinuesWhenTackbokIsOpenAndOnline'];

  test('is neutral while a restore runs or waits between passes', () => {
    expect(note('syncing')).toBe(leave);
    expect(note('restoring')).toBe(leave);
  });

  test('says the restore is paused only after a failure that clears by itself', () => {
    for (const failure of ['offline', 'transient', 'rate-limit'] as const) {
      expect(note('restoring', failure)).toBe(paused);
    }
    expect(note('restoring', 'wifi-only-media')).toBe(
      en['cloud.progress.waitingForWifi'],
    );
    expect(note('restoring', 'quota')).toBe(en['cloud.googleDriveStorageIsFull']);
  });

  test('is absent for ordinary syncs', () => {
    expect(note('syncing', null, false)).toBeNull();
    expect(note('synced', null, false)).toBeNull();
  });
});
