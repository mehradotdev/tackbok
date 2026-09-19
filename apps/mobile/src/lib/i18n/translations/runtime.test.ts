import { translate } from './index';
import { pluralMessages } from './plurals';
import { en } from './en';
import type { SupportedLocale, TranslationKey } from '../types';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('./de', () => {
  const { de } = jest.requireActual('./de');
  const incomplete = { ...de };
  delete incomplete['greeting.welcomeBack'];
  return { de: incomplete };
});

it('falls back to the English message rather than exposing an identifier', () => {
  expect(translate('de', 'greeting.welcomeBack')).toBe('Welcome back');
  expect(translate('de', 'nonexistent.key' as TranslationKey)).toBe('Unknown error');
});

it('interpolates user text literally, including braces and dollar signs', () => {
  expect(
    translate('en', 'greeting.withName', {
      greeting: 'Hello',
      name: '$& {greeting} <Maya>',
    }),
  ).toBe('Hello, $& {greeting} <Maya>');
});

it('chooses singular and plural using the numeric count before formatting', () => {
  expect(translate('en', 'milestone.daysOfGratitude', { count: 1 })).toBe(
    '1 day of gratitude',
  );
  expect(translate('en', 'milestone.daysOfGratitude', { count: 1000 })).toBe(
    '1,000 days of gratitude',
  );
  expect(translate('de', 'milestone.daysOfGratitude', { count: 1 })).toBe(
    '1 Tag voller Dankbarkeit',
  );
  expect(translate('zh-CN', 'milestone.daysOfGratitude', { count: 2 })).toBe(
    '感恩的 2 天',
  );
});

it('uses Arabic zero, singular, dual, few, many, and other forms', () => {
  expect(
    [0, 1, 2, 3, 11, 100].map((count) =>
      translate('ar', 'milestone.daysOfGratitude', { count }),
    ),
  ).toEqual([
    '0 يوم من الامتنان',
    '1 يوم من الامتنان',
    'يومان من الامتنان',
    '3 أيام من الامتنان',
    '11 يومًا من الامتنان',
    '100 يوم من الامتنان',
  ]);
});

const pluralSuffix = /_(zero|one|two|few|many|other)$/;
const baseKeys = [
  ...new Set(Object.keys(pluralMessages.en).map((key) => key.replace(pluralSuffix, ''))),
];
const placeholders = (value: string) =>
  [...new Set(value.match(/\{\w+\}/g) ?? [])].sort();

for (const locale of Object.keys(pluralMessages) as SupportedLocale[]) {
  it(`${locale}: covers every count message and every required plural category`, () => {
    const messages: Record<string, string> = pluralMessages[locale];
    const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    expect(
      [
        ...new Set(Object.keys(messages).map((key) => key.replace(pluralSuffix, ''))),
      ].sort(),
    ).toEqual([...baseKeys].sort());
    for (const key of baseKeys) {
      expect(key in en).toBe(true);
      for (const category of categories) {
        const value = messages[`${key}_${category}`];
        expect(typeof value).toBe('string');
        expect(value?.trim().length).toBeGreaterThan(0);
        // Count may be written as a word in singular/dual forms; other parameters remain mandatory.
        const required = placeholders(
          pluralMessages.en[`${key}_other` as keyof typeof pluralMessages.en],
        ).filter((p) => p !== '{count}');
        expect(placeholders(value).filter((p) => p !== '{count}')).toEqual(required);
        expect(
          translate(locale, key as TranslationKey, { count: 2, type: 'Example' }),
        ).not.toMatch(/\{\w+\}/);
      }
    }
  });
}
