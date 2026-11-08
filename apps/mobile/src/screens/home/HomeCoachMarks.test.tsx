import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { HomeCoachMarks } from './HomeCoachMarks';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

const mockSettings = {
  hasCompletedOnboarding: true,
  hasSeenHomeCoachMarks: false,
  sampleEntryIds: [] as string[],
  setHasSeenHomeCoachMarks: jest.fn((seen: boolean) => {
    mockSettings.hasSeenHomeCoachMarks = seen;
  }),
};
let mockScreenReader = false;

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  AccessibilityInfo: { isScreenReaderEnabled: async () => mockScreenReader },
}));
jest.mock('tailwind-variants', () => ({ cn: (...names: string[]) => names.join(' ') }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/hooks/useGratitude', () => ({
  useEntriesGroupByDate: () => ({ data: new Map(), isPending: false }),
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: (select: (state: typeof mockSettings) => unknown) =>
    select(mockSettings),
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn) => mockTranslate('en', key),
  }),
}));

let root: ReactTestRenderer;
async function render() {
  await act(async () => {
    root = create(<HomeCoachMarks />);
  });
}
const showsTour = () => JSON.stringify(root.toJSON()).includes(mockEn['onboarding.skip']);

beforeEach(() => {
  mockSettings.hasSeenHomeCoachMarks = false;
  mockSettings.setHasSeenHomeCoachMarks.mockClear();
  mockScreenReader = false;
});
afterEach(() => act(() => root?.unmount()));

test('the tour counts as seen once shown, so an unfinished tour never returns', async () => {
  await render();
  expect(showsTour()).toBe(true);
  expect(mockSettings.setHasSeenHomeCoachMarks).toHaveBeenCalledWith(true);

  // The next launch, after leaving mid-tour.
  act(() => root.unmount());
  await render();
  expect(showsTour()).toBe(false);
});

test('screen-reader users skip the tour', async () => {
  mockScreenReader = true;
  await render();
  expect(showsTour()).toBe(false);
  expect(mockSettings.setHasSeenHomeCoachMarks).toHaveBeenCalledWith(true);
});
