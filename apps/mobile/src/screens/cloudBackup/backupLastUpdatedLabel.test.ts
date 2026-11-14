import { translate } from '~/lib/i18n/translations';
import type { SupportedLocale, TranslationFunction } from '~/lib/i18n/types';
import { backupLastUpdatedLabel } from './copy';

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
