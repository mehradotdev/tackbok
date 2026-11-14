import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import OtherVersionsScreen from './index';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';
import type { OtherVersionGroup } from '~/db/queries';
import type { Entry } from '~/types';

const mockQuery = jest.fn();
const mockDelete = jest.fn(async (_noteId: string) => {});
const mockAcknowledge = jest.fn(async (_ids: string[]) => {});
const mockTrack = jest.fn();
const mockToastError = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  View: 'View',
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
  }: {
    data: unknown[];
    renderItem: Function;
    ListHeaderComponent?: unknown;
  }) => [ListHeaderComponent, ...data.map((item) => renderItem({ item }))],
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/toast', () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));
jest.mock('~/components/ui/alert-dialog', () => ({
  AlertDialog: 'AlertDialog',
  AlertDialogCancel: 'AlertDialogCancel',
  AlertDialogContent: 'AlertDialogContent',
  AlertDialogDescription: 'AlertDialogDescription',
  AlertDialogDestructiveAction: 'AlertDialogDestructiveAction',
  AlertDialogFooter: 'AlertDialogFooter',
  AlertDialogHeader: 'AlertDialogHeader',
  AlertDialogTitle: 'AlertDialogTitle',
}));
jest.mock('~/components/ui/safe-area-view', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('~/components/ImageViewerModal', () => ({
  ImageViewerModal: 'ImageViewerModal',
}));
jest.mock('~/components/backdrops/ThemeBackdrop', () => ({
  ThemeBackdrop: 'ThemeBackdrop',
}));
jest.mock('~/screens/dateEntries', () => ({ EntryItem: 'EntryItem' }));
jest.mock('~/lib/analytics', () => ({ track: (event: string) => mockTrack(event) }));
jest.mock('~/lib/cloudSync/ui', () => ({
  acknowledgeEntryConflicts: (ids: string[]) => mockAcknowledge(ids),
}));
jest.mock('~/hooks/useGratitude', () => ({
  useOtherVersionGroups: () => mockQuery(),
  useTagMapping: () => new Map(),
  useDeleteEntry: () => ({ mutateAsync: (noteId: string) => mockDelete(noteId) }),
}));
jest.mock('~/lib/i18n', () => ({
  formatLocalizedDate: (date: number) => `date:${date}`,
  useTranslation: () => ({
    isRTL: false,
    t: (key: keyof typeof mockEn, params?: Record<string, unknown>) =>
      mockTranslate('en', key, params as never),
  }),
}));

const entry = (noteId: string, fields: Partial<Entry> = {}) =>
  ({ note_id: noteId, created_at: 1, conflict_origin_id: null, ...fields }) as Entry;
const original = entry('original', { created_at: 5 });
const copy = entry('copy', { conflict_origin_id: 'original' });
const secondCopy = entry('second-copy', { conflict_origin_id: 'original' });

let root: ReactTestRenderer;
beforeEach(() => jest.clearAllMocks());
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
const keepButtons = () =>
  root.root.findAll(
    (node) =>
      (node.type as unknown) === 'Button' &&
      node.findAllByType('Text' as never)[0]?.props.children ===
        mockEn['cloud.conflicts.keepThisOne'],
  );
const dialog = () => root.root.findByType('AlertDialog' as never);
const confirm = () => root.root.findByType('AlertDialogDestructiveAction' as never);

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

test('shows each other version under its original, with dates', () => {
  const groups: OtherVersionGroup[] = [{ original, versions: [copy] }];
  render({ data: groups });
  const rows = root.root.findAllByType('EntryItem' as never);
  expect(rows.map((row) => row.props.entry.note_id)).toEqual(['original', 'copy']);
  expect(rows.map((row) => row.props.showDate)).toEqual([true, true]);
  expect(content()).toContain('Versions of an entry from date:5');
  expect(content()).toContain(mockEn['cloud.conflicts.original']);
  expect(content()).not.toContain(mockEn['cloud.conflicts.originalDeleted']);
  const heading = root.root.find(
    (node) => (node.type as unknown) === 'Text' && node.props.role === 'heading',
  );
  expect(heading.props.children).toBe('Versions of an entry from date:5');
});

test('"Keep this one" buttons name their version and what they delete', () => {
  render({ data: [{ original, versions: [copy, secondCopy] }] });
  expect(keepButtons().map((button) => button.props.accessibilityLabel)).toEqual([
    mockEn['cloud.conflicts.keepOriginal'],
    mockEn['cloud.conflicts.keepOtherVersion'],
    mockEn['cloud.conflicts.keepOtherVersion'],
  ]);
  expect(keepButtons()[0].props.accessibilityHint).toBe(
    'The 2 other versions will be permanently deleted.',
  );
});

test('shows how many attachments a version has', () => {
  const withAssets = entry('with-assets', {
    conflict_origin_id: 'original',
    assets: [{}, {}] as Entry['assets'],
  });
  render({ data: [{ original, versions: [withAssets] }] });
  expect(content()).toContain('Attachments: 2');
  expect(content()).not.toContain('Attachments: 0');
});

test('a version whose original was deleted is shown alone with a note', () => {
  render({ data: [{ original: null, versions: [copy] }] });
  expect(content()).toContain(mockEn['cloud.conflicts.originalDeleted']);
  expect(content()).not.toContain(`"${mockEn['cloud.conflicts.original']}"`);
  expect(keepButtons()).toHaveLength(0);
});

test('keeping the other version deletes only the original, after confirming', async () => {
  render({ data: [{ original, versions: [copy] }] });
  expect(dialog().props.open).toBe(false);
  act(() => keepButtons()[1].props.onPress());
  expect(dialog().props.open).toBe(true);
  expect(content()).toContain(mockEn['cloud.conflicts.keepThisOneTitle']);
  expect(content()).toContain('The other version will be permanently deleted.');
  expect(mockDelete).not.toHaveBeenCalled();

  await act(async () => confirm().props.onPress());
  expect(mockDelete.mock.calls).toEqual([['original']]);
  expect(mockTrack).toHaveBeenCalledWith('entry_deleted');
  expect(mockAcknowledge).toHaveBeenCalledWith(['copy', 'original']);
  expect(dialog().props.open).toBe(false);
});

test('keeping the original deletes every other version', async () => {
  render({ data: [{ original, versions: [copy, secondCopy] }] });
  act(() => keepButtons()[0].props.onPress());
  await act(async () => confirm().props.onPress());
  expect(mockDelete.mock.calls).toEqual([['copy'], ['second-copy']]);
  expect(mockAcknowledge).toHaveBeenCalledWith(['original', 'copy', 'second-copy']);
});

test('cancelling deletes nothing', () => {
  render({ data: [{ original, versions: [copy] }] });
  act(() => keepButtons()[0].props.onPress());
  act(() => root.root.findByType('AlertDialogCancel' as never).props.onPress());
  expect(dialog().props.open).toBe(false);
  expect(mockDelete).not.toHaveBeenCalled();
});

test('a version that sync moved out of the group while confirming is spared', async () => {
  render({ data: [{ original, versions: [copy, secondCopy] }] });
  act(() => keepButtons()[0].props.onPress());
  mockQuery.mockReturnValue({
    data: [{ original, versions: [copy] }],
    isLoading: false,
    isError: false,
  });
  act(() => root.update(<OtherVersionsScreen />));
  await act(async () => confirm().props.onPress());
  expect(mockDelete.mock.calls).toEqual([['copy']]);
});

test('a failed delete is reported and dismisses nothing', async () => {
  mockDelete.mockRejectedValueOnce(new Error('database unavailable'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render({ data: [{ original, versions: [copy] }] });
  act(() => keepButtons()[0].props.onPress());
  await act(async () => confirm().props.onPress());
  expect(mockToastError).toHaveBeenCalledWith(mockEn['mood.failedToDeleteEntry']);
  expect(mockAcknowledge).not.toHaveBeenCalled();
  expect(mockTrack).not.toHaveBeenCalled();
});
