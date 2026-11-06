import fs from 'node:fs';
import path from 'node:path';

import { ALL_SUPPORTED_LOCALES } from './src/lib/i18n/types';
import { getIntlLanguageTag } from './src/lib/i18n/languageTag';
import englishLocale from './locales/en.json';

const originalVariant = process.env.APP_VARIANT;
afterAll(() => {
  if (originalVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = originalVariant;
});

describe.each(['production', 'beta'])('iOS locales (%s)', (variant) => {
  test('covers every supported locale and permission while preserving the app identity', () => {
    process.env.APP_VARIANT = variant;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config: typeof import('./app.config').default = require('./app.config').default;
    const expectedLocales = ALL_SUPPORTED_LOCALES.map(getIntlLanguageTag);
    expect(Object.keys(config.locales!)).toEqual(expectedLocales);
    expect(config.plugins).toContainEqual([
      'expo-localization',
      { supportedLocales: expectedLocales },
    ]);
    expect(fs.readdirSync(path.join(__dirname, 'locales')).sort()).toEqual(
      expectedLocales.map((locale) => `${locale}.json`).sort(),
    );
    for (const [locale, value] of Object.entries(config.locales!)) {
      const source: typeof englishLocale = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'locales', `${locale}.json`), 'utf8'),
      );
      expect(Object.keys(source.ios).sort()).toEqual(
        Object.keys(englishLocale.ios).sort(),
      );
      for (const text of Object.values(source.ios)) expect(text.trim()).not.toBe('');
      if (variant === 'production') {
        expect(value).toBe(`./locales/${locale}.json`);
      } else {
        expect(value).toEqual({
          ios: { ...source.ios, CFBundleDisplayName: 'Tackbok (Beta)' },
        });
      }
    }
    expect(config.ios?.bundleIdentifier).toBe(
      variant === 'beta' ? 'dev.mehra.tackbok.beta' : 'dev.mehra.tackbok',
    );
  });
});
