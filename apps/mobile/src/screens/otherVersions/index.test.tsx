import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import OtherVersionsScreen from './index';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

const mockQuery = jest.fn();

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  View: 'View',
  FlatList: ({ data, renderItem }: { data: unknown[]; renderItem: Function }) =>
    data.map((item) => renderItem({ item })),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/safe-area-view', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('~/components/ImageViewerModal', () => ({
  ImageViewerModal: 'ImageViewerModal',
}));
jest.mock('~/components/backdrops/ThemeBackdrop', () => ({
  ThemeBackdrop: 'ThemeBackdrop',
}));
jest.mock('~/screens/dateEntries', () => ({ EntryItem: 'EntryItem' }));
jest.mock('~/hooks/useGratitude', () => ({
  useEntriesWithOtherVersions: () => mockQuery(),
  useTagMapping: () => new Map(),
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    isRTL: false,
    t: (key: keyof typeof mockEn, params?: Record<string, unknown>) =>
      mockTranslate('en', key, params as never),
  }),
}));

let root: ReactTestRenderer;
afterEach(() => act(() => root?.unmount()));

function render(query: Record<string, unknown>) {
  mockQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...query,
  });
  act(() => {
    root = create(<OtherVersionsScreen />);
  });
}
const content = () => JSON.stringify(root.toJSON());

test('a failed read shows an error with a retry, not the empty state', () => {
  const refetch = jest.fn();
  render({ isError: true, refetch });
  expect(content()).toContain(mockEn['cloud.conflicts.otherVersionsLoadFailed']);
  expect(content()).not.toContain(mockEn['cloud.conflicts.noOtherVersions']);
  const retry = root.root.findAll(
    (node) =>
      (node.type as unknown) === 'Button' &&
      node.findAllByType('Text' as never)[0]?.props.children === mockEn['common.retry'],
  )[0];
  act(() => retry.props.onPress());
  expect(refetch).toHaveBeenCalled();
});

test('an empty list shows the empty state', () => {
  render({ data: [] });
  expect(content()).toContain(mockEn['cloud.conflicts.noOtherVersions']);
});

test('rows show their date because the list spans several days', () => {
  render({ data: [{ note_id: 'a' }, { note_id: 'b', conflict_origin_id: 'a' }] });
  const rows = root.root.findAllByType('EntryItem' as never);
  expect(rows.map((row) => row.props.showDate)).toEqual([true, true]);
});
