import { formatLocalizedDate, formatLocalizedTime } from './dateFormatting';
import { formatLocalizedNumber } from './numberFormatting';
import { getFormattingLocale } from './formattingLocale';
import { getEffectiveLocale, getEffectiveSupportedLocale } from './store';
import { translate } from './translations';
import type { LocalePreference, TranslationKey } from './types';

let mockDevice = { languageTag: 'en-GB', regionCode: 'GB' };
let mock24hour = true;
jest.mock('expo-localization', () => ({
  getLocales: () => [mockDevice],
  getCalendars: () => [{ uses24hourClock: mock24hour }],
}));
jest.mock('expo-sqlite/kv-store', () => ({ getItem: jest.fn(async () => null) }));

beforeEach(() => {
  mockDevice = { languageTag: 'en-GB', regionCode: 'GB' };
  mock24hour = true;
});

it('keeps date words in the app language and respects regional order', () => {
  const t = Object.assign((key: TranslationKey) => translate('en', key), {
    locale: 'en' as const,
  });
  expect(formatLocalizedDate('2026-09-19', t)).toBe('19 Sept 2026');
  mockDevice = { languageTag: 'en-US', regionCode: 'US' };
  expect(formatLocalizedDate('2026-09-19', t)).toBe('Sep 19, 2026');
});

it('respects device 12/24-hour preference without changing stored times', () => {
  const date = new Date(2026, 8, 19, 17, 5);
  expect(formatLocalizedTime(date, 'en')).toBe('17:05');
  mock24hour = false;
  expect(formatLocalizedTime(date, 'en')).toMatch(/5:05\s*pm/i);
});

it('uses the formatting locale default digits for labels and interpolated numbers', () => {
  mockDevice = { languageTag: 'ar-EG', regionCode: 'EG' };
  expect(formatLocalizedNumber(1234, 'ar')).toBe('١٬٢٣٤');
  expect(translate('ar', 'milestone.daysOfGratitude', { count: 11 })).toContain('١١');
  expect(getFormattingLocale('en')).toBe('en-EG');
  expect(formatLocalizedNumber(1234, 'en')).toBe('1,234');
  expect(translate('en', 'milestone.daysOfGratitude', { count: 11 })).toContain('11');
});

it('formats iOS dates, numbers, and messages when Intl omits the numbering system', () => {
  mockDevice = { languageTag: 'en-IN', regionCode: 'IN' };
  const original = Intl.NumberFormat.prototype.resolvedOptions;
  const resolvedOptions = jest
    .spyOn(Intl.NumberFormat.prototype, 'resolvedOptions')
    .mockImplementation(function (this: Intl.NumberFormat) {
      const options = original.call(this);
      Reflect.deleteProperty(options, 'numberingSystem');
      return options;
    });
  try {
    expect(getFormattingLocale('en')).toBe('en-IN');
    expect(formatLocalizedNumber(123456, 'en')).toBe('1,23,456');
    expect(
      translate('en', 'onboarding.stepCurrentOfTotal', { current: 1, total: 5 }),
    ).toBe('Step 1 of 5');
    const t = Object.assign((key: TranslationKey) => translate('en', key), {
      locale: 'en' as const,
    });
    expect(() => formatLocalizedDate('2026-09-19', t)).not.toThrow();
    expect(() => formatLocalizedTime(new Date(2026, 8, 19, 17, 5), 'en')).not.toThrow();
  } finally {
    resolvedOptions.mockRestore();
  }
});

it('defaults to English when no device language or saved preference is supported', () => {
  expect(getEffectiveSupportedLocale('hi-IN', 'device')).toBe('en');
  expect(getEffectiveSupportedLocale(['es-MX', 'hi-IN'], 'device')).toBe('en');
  expect(getEffectiveSupportedLocale(null, 'device')).toBe('en');
  expect(getEffectiveSupportedLocale('de-DE', 'unsupported' as LocalePreference)).toBe(
    'en',
  );
});

it.each([
  ['zh-Hans-CN', 'zh-CN'],
  ['zh-Hant-CN', 'zh-TW'],
  ['zh-HK', 'zh-TW'],
  ['zh-SG', 'zh-CN'],
  ['de-AT', 'de'],
  ['he-IL', 'he'],
  ['es-MX', null],
])('matches %s to %s', (device, expected) =>
  expect(getEffectiveLocale(device)).toBe(expected),
);

it('checks device language preferences in order and honors an explicit app language', () => {
  expect(getEffectiveLocale(['es-MX', 'de-AT', 'en-US'])).toBe('de');
  expect(getEffectiveLocale(['de-AT'], 'ar')).toBe('ar');
});

it('preserves the app language when native Intl rejects a synthetic region tag', () => {
  mockDevice = { languageTag: 'en-US', regionCode: 'US' };
  const supported = jest
    .spyOn(Intl.DateTimeFormat, 'supportedLocalesOf')
    .mockReturnValue([]);
  try {
    expect(getFormattingLocale('zh-CN')).toBe('zh-Hans');
  } finally {
    supported.mockRestore();
  }
});
