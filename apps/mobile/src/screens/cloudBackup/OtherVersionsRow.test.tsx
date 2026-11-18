import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OtherVersionsRow } from './OtherVersionsRow';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

const mockPush = jest.fn();
let mockGroups: { data: string[] | undefined } = { data: undefined };

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('lucide-react-native', () => ({ GitBranch: 'GitBranch' }));
jest.mock('~/components/SettingsRow', () => ({ SettingsRow: 'SettingsRow' }));
jest.mock('~/hooks/useGratitude', () => ({
  useEntriesWithOtherVersions: () => mockGroups,
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn) => mockTranslate('en', key),
  }),
}));

let root: ReactTestRenderer;
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => root?.unmount()));

function render(groups: string[] | undefined) {
  mockGroups = { data: groups };
  act(() => {
    root = create(<OtherVersionsRow />);
  });
}

test('is hidden while loading and when no entry has another version', () => {
  render(undefined);
  expect(root.toJSON()).toBeNull();
  render([]);
  expect(root.toJSON()).toBeNull();
});

test('opens Other versions while any entry has another version', () => {
  render(['original']);
  const row = root.root.findByType('SettingsRow' as never);
  expect(row.props.label).toBe(mockEn['cloud.conflicts.otherVersionsTitle']);
  expect(row.props.accessibilityLabel).toBe(mockEn['cloud.conflicts.otherVersionsTitle']);
  expect(row.props.accessibilityHint).toBe(mockEn['cloud.conflicts.otherVersionsRow']);
  act(() => row.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/other-versions');
});

test('goes away once each entry has one version left', () => {
  render(['original']);
  expect(root.toJSON()).not.toBeNull();
  mockGroups = { data: [] };
  act(() => root.update(<OtherVersionsRow />));
  expect(root.toJSON()).toBeNull();
});
