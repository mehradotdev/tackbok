import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OtherVersionsRow } from './OtherVersionsRow';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

const mockPush = jest.fn();
let mockCount: { data: number | undefined } = { data: undefined };

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('lucide-react-native', () => ({ GitBranch: 'GitBranch' }));
jest.mock('~/components/SettingsRow', () => ({ SettingsRow: 'SettingsRow' }));
jest.mock('~/hooks/useGratitude', () => ({ useOtherVersionCount: () => mockCount }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn) => mockTranslate('en', key),
  }),
}));

let root: ReactTestRenderer;
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => root?.unmount()));

function render(count: number | undefined) {
  mockCount = { data: count };
  act(() => {
    root = create(<OtherVersionsRow />);
  });
}

test('is hidden while the count loads and when no entry has another version', () => {
  render(undefined);
  expect(root.toJSON()).toBeNull();
  render(0);
  expect(root.toJSON()).toBeNull();
});

test('opens Other versions while any entry is another version', () => {
  render(2);
  const row = root.root.findByType('SettingsRow' as never);
  expect(row.props.label).toBe(mockEn['cloud.conflicts.otherVersionsTitle']);
  expect(row.props.accessibilityLabel).toBe(mockEn['cloud.conflicts.otherVersionsTitle']);
  expect(row.props.accessibilityHint).toBe(mockEn['cloud.conflicts.otherVersionsRow']);
  act(() => row.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/other-versions');
});

test('goes away once the last other version is deleted', () => {
  render(1);
  expect(root.toJSON()).not.toBeNull();
  mockCount = { data: 0 };
  act(() => root.update(<OtherVersionsRow />));
  expect(root.toJSON()).toBeNull();
});
