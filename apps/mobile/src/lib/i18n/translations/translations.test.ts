import { translations } from './index';

const SOURCE_LOCALE = 'en';

describe('Translations', () => {
  const sourceKeys = Object.keys(translations[SOURCE_LOCALE]);

  Object.entries(translations).forEach(([locale, messages]) => {
    if (locale === SOURCE_LOCALE) return;

    test(`Locale '${locale}' should exactly match '${SOURCE_LOCALE}' keys and order`, () => {
      const keys = Object.keys(messages);

      // Check for missing or extra keys
      // This ensures no keys are missing
      expect(keys.length).toBe(sourceKeys.length);

      // Check for exact order
      // This ensures the keys are in the exact same order as the source
      expect(keys).toEqual(sourceKeys);
    });
  });
});
