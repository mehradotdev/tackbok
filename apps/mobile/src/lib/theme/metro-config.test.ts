import { CUSTOM_THEME_IDS } from './registry.cjs';

jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({ resolver: { sourceExts: ['js'] } }),
}));
jest.mock('uniwind/metro', () => ({
  withUniwindConfig: (config: object, options: object) => ({ config, options }),
}));

describe('Metro Theme Config', () => {
  test('passes every custom theme from the CommonJS registry to uniwind', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { options } = require('../../../metro.config.js');
    expect(options.extraThemes).toEqual([...CUSTOM_THEME_IDS]);
  });
});
