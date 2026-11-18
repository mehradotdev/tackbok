import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import OtherVersionsScreen from './index';
import { OtherVersionGroupCard } from './OtherVersionGroupCard';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';
import type { OtherVersionGroup } from '~/db/queries';
import type { Entry } from '~/types';

const mockQuery = jest.fn();
const mockToastError = jest.fn();
const mockPush = jest.fn();
const mockAnnounce = jest.fn();
let mockParams: { focus?: string | string[] } = {};

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({
  View: 'View',
  AccessibilityInfo: {
    announceForAccessibilityWithOptions: (message: string, options: unknown) =>
      mockAnnounce(message, options),
  },
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
  useLocalSearchParams: () => mockParams,
}));
jest.mock('lucide-react-native', () => ({
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
}));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
const mockToastInfo = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock('~/components/ui/toast', () => ({
  toast: {
    error: (message: string) => mockToastError(message),
    info: (message: string) => mockToastInfo(message),
    success: (message: string) => mockToastSuccess(message),
  },
}));
jest.mock('~/components/ui/alert-dialog', () => ({
  AlertDialog: 'AlertDialog',
  AlertDialogCancel: 'AlertDialogCancel',
  AlertDialogContent: 'AlertDialogContent',
  AlertDialogDescription: 'AlertDialogDescription',
  AlertDialogAction: 'AlertDialogAction',
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
const mockMarkSeen = jest.fn(async () => {});
jest.mock('~/lib/cloudSync/ui/conflicts', () => ({
  markOtherVersionsSeen: () => mockMarkSeen(),
}));
const mockKeep = jest.fn(async (_id: string, _seen?: unknown) => {});
const mockKeepBoth = jest.fn(async (_id: string, _seen?: unknown) => 'split-1');
jest.mock('~/lib/cloudSync/ui/versions', () => ({
  VersionsChangedError: class VersionsChangedError extends Error {},
  keepEntryVersion: (id: string, seen: unknown) => mockKeep(id, seen),
  keepBothVersions: (id: string, seen: unknown) => mockKeepBoth(id, seen),
  parseVersionCopyId: (id: string) =>
    id.includes('#') ? { entryId: id.split('#')[0] } : null,
}));
const mockInvalidate = jest.fn(async () => {});
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock('~/hooks/useGratitude', () => ({
  QUERY_KEYS: { entries: 'entries' },
  useOtherVersionGroups: () => mockQuery(),
  useTagMapping: () => new Map(),
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
  ({ note_id: noteId, created_at: 1, ...fields }) as Entry;
const original = entry('original', { created_at: 5 });
const copy = entry('copy');
const secondCopy = entry('second-copy');

let root: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});
afterEach(() => act(() => root?.unmount()));

function render(query: Record<string, unknown>) {
  const data = query.data;
  mockQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    // Confirming re-reads the groups; by default nothing changed meanwhile.
    refetch: jest.fn(async () => ({ data, isError: false })),
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
const confirm = () => root.root.findByType('AlertDialogAction' as never);
const keepBothButtons = () =>
  root.root.findAll(
    (node) =>
      (node.type as unknown) === 'Button' &&
      node.findAllByType('Text' as never)[0]?.props.children ===
        mockEn['cloud.conflicts.keepBoth'],
  );

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
  // The card asks each row for its full title and text: what differs can be at the end.
  expect(rows.map((row) => row.props.fullText)).toEqual([true, true]);
  expect(content()).toContain('Versions of an entry from date:5');
  expect(content()).toContain(mockEn['cloud.conflicts.original']);
  expect(content()).not.toContain(mockEn['cloud.conflicts.originalDeleted']);
  const heading = root.root.find(
    (node) => (node.type as unknown) === 'Text' && node.props.role === 'heading',
  );
  expect(heading.props.children).toBe('Versions of an entry from date:5');
});

test('"Keep this one" buttons name their version and what they keep', () => {
  render({ data: [{ original, versions: [copy, secondCopy] }] });
  expect(keepButtons().map((button) => button.props.accessibilityLabel)).toEqual([
    mockEn['cloud.conflicts.keepOriginal'],
    mockEn['cloud.conflicts.keepOtherVersion'],
    mockEn['cloud.conflicts.keepOtherVersion'],
  ]);
  expect(keepButtons()[0].props.accessibilityHint).toBe(
    'This version will be kept on all your devices, instead of the 2 others.',
  );
});

test('keeping a version never claims to delete attachments: they stay with the entry', () => {
  const withAssets = { ...original, assets: [{}, {}, {}] as Entry['assets'] };
  render({ data: [{ original: withAssets, versions: [copy] }] });
  const message =
    'This version will be kept on all your devices, instead of the other one.';
  expect(keepButtons()[1].props.accessibilityHint).toBe(message);
  expect(keepButtons()[0].props.accessibilityHint).toBe(message);
  act(() => keepButtons()[1].props.onPress());
  expect(content()).not.toContain('Attachments that will also be deleted');
});

test('shows how many attachments a version has', () => {
  const withAssets = entry('with-assets', { assets: [{}, {}] as Entry['assets'] });
  render({ data: [{ original, versions: [withAssets] }] });
  expect(content()).toContain('Attachments: 2');
  expect(content()).not.toContain('Attachments: 0');
});

test('versions whose original was deleted are shown together with a note', () => {
  render({ data: [{ original: null, versions: [copy, secondCopy] }] });
  expect(content()).toContain(mockEn['cloud.conflicts.originalDeleted']);
  expect(content()).not.toContain(`"${mockEn['cloud.conflicts.original']}"`);
  expect(keepButtons()).toHaveLength(2);
});

test('a version left on its own is not listed: there is nothing to choose', () => {
  render({
    data: [
      { original: null, versions: [copy] },
      { original: entry('other'), versions: [entry('other-copy')] },
    ],
  });
  const rows = root.root.findAllByType('EntryItem' as never);
  expect(rows.map((row) => row.props.entry.note_id)).toEqual(['other', 'other-copy']);
});

test('keeping the other version keeps it, after confirming', async () => {
  render({ data: [{ original, versions: [copy] }] });
  expect(dialog().props.open).toBe(false);
  act(() => keepButtons()[1].props.onPress());
  expect(dialog().props.open).toBe(true);
  expect(content()).toContain(mockEn['cloud.conflicts.keepThisOneTitle']);
  expect(content()).toContain(
    'This version will be kept on all your devices, instead of the other one.',
  );
  expect(mockKeep).not.toHaveBeenCalled();

  await act(async () => confirm().props.onPress());
  expect(mockKeep.mock.calls.map(([id]) => id)).toEqual(['copy']);
  // What the user compared goes with the choice.
  expect(mockKeep.mock.calls[0][1]).toEqual([copy, original]);
  expect(mockInvalidate).toHaveBeenCalled();
  expect(dialog().props.open).toBe(false);
});

test('keeping the original keeps what the entry shows', async () => {
  render({ data: [{ original, versions: [copy, secondCopy] }] });
  act(() => keepButtons()[0].props.onPress());
  await act(async () => confirm().props.onPress());
  expect(mockKeep.mock.calls.map(([id]) => id)).toEqual(['original']);
});

test('cancelling keeps nothing', () => {
  render({ data: [{ original, versions: [copy] }] });
  act(() => keepButtons()[0].props.onPress());
  act(() => root.root.findByType('AlertDialogCancel' as never).props.onPress());
  expect(dialog().props.open).toBe(false);
  expect(mockKeep).not.toHaveBeenCalled();
});

test('a second tap while keeping writes once', async () => {
  render({ data: [{ original, versions: [copy] }] });
  act(() => keepButtons()[0].props.onPress());
  const press = confirm().props.onPress;
  await act(async () => {
    await Promise.all([press(), press()]);
  });
  expect(mockKeep).toHaveBeenCalledTimes(1);
});

test('versions that changed while confirming write nothing, refresh and say so', async () => {
  const { VersionsChangedError } = jest.requireMock('~/lib/cloudSync/ui/versions') as {
    VersionsChangedError: new () => Error;
  };
  mockKeep.mockRejectedValueOnce(new VersionsChangedError());
  const refetch = jest.fn(async () => ({ data: [], isError: false }));
  render({ data: [{ original, versions: [copy] }], refetch });
  act(() => keepButtons()[0].props.onPress());
  await act(async () => confirm().props.onPress());
  expect(refetch).toHaveBeenCalled();
  expect(mockToastError).not.toHaveBeenCalled();
  const message = mockEn['cloud.conflicts.versionsChanged'];
  expect(mockToastInfo).toHaveBeenCalledWith(message);
  expect(mockAnnounce).toHaveBeenCalledWith(message, { queue: true });
  expect(dialog().props.open).toBe(false);
});

test('a failed keep is reported', async () => {
  mockKeep.mockRejectedValueOnce(new Error('database unavailable'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render({ data: [{ original, versions: [copy] }] });
  act(() => keepButtons()[0].props.onPress());
  await act(async () => confirm().props.onPress());
  expect(mockToastError).toHaveBeenCalledWith(mockEn['mood.failedToSaveEntry']);
  expect(dialog().props.open).toBe(false);
});

test('opening the screen clears the Home notice for the entry conflicts on it', () => {
  render({ data: [{ original, versions: [copy] }] });
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);
  // Re-renders, e.g. a refetch, do not mark it again.
  act(() => root.update(<OtherVersionsScreen />));
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);
});

const other = entry('other', { created_at: 9 });
const otherCopy = entry('other-copy');
const cards = () => root.root.findAllByType(OtherVersionGroupCard);

test('opening at an entry puts its group first and marks it', () => {
  mockParams = { focus: 'copy' };
  render({
    data: [
      { original: other, versions: [otherCopy] },
      { original, versions: [copy] },
    ],
  });
  expect(cards().map((card) => card.props.group.original.note_id)).toEqual([
    'original',
    'other',
  ]);
  expect(cards().map((card) => card.props.highlighted)).toEqual([true, false]);
});

test('opening at the original of a group works the same way', () => {
  mockParams = { focus: 'original' };
  render({
    data: [
      { original: other, versions: [otherCopy] },
      { original, versions: [copy] },
    ],
  });
  expect(cards()[0].props.group.original.note_id).toBe('original');
  expect(cards()[0].props.highlighted).toBe(true);
});

test('an unknown or closed entry to open at changes nothing', () => {
  mockParams = { focus: 'gone' };
  render({
    data: [
      { original: other, versions: [otherCopy] },
      { original, versions: [copy] },
    ],
  });
  expect(cards().map((card) => card.props.group.original.note_id)).toEqual([
    'other',
    'original',
  ]);
  expect(cards().map((card) => card.props.highlighted)).toEqual([false, false]);
});

test('says what differs between the versions', () => {
  render({
    data: [
      {
        original: { ...original, text_title: 'Walk', text_content: 'Sunny' },
        versions: [{ ...copy, text_title: 'Walk', text_content: 'Rainy' }],
      },
    ],
  });
  expect(content()).toContain(mockEn['cloud.conflicts.textDiffers']);
  expect(content()).not.toContain(mockEn['cloud.conflicts.titleDiffers']);
});

test('after the last choice it says all done, and announces it once', () => {
  render({ data: [{ original, versions: [copy] }] });
  expect(content()).not.toContain(mockEn['cloud.conflicts.allDone']);
  // The delete has applied: the query now returns no group.
  mockQuery.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  act(() => root.update(<OtherVersionsScreen />));
  expect(content()).toContain(mockEn['cloud.conflicts.allDone']);
  expect(content()).not.toContain(mockEn['cloud.conflicts.noOtherVersions']);
  // Queued, so focus moving after the dialog closes does not cut it off.
  expect(mockAnnounce.mock.calls).toEqual([
    [mockEn['cloud.conflicts.allDone'], { queue: true }],
  ]);
  act(() => root.update(<OtherVersionsScreen />));
  expect(mockAnnounce).toHaveBeenCalledTimes(1);
});

test('opening with only lone versions shows the plain empty state, not all done', () => {
  render({ data: [{ original: null, versions: [copy] }] });
  expect(content()).toContain(mockEn['cloud.conflicts.noOtherVersions']);
  expect(content()).not.toContain(mockEn['cloud.conflicts.allDone']);
  expect(mockAnnounce).not.toHaveBeenCalled();
});

test('no versions at all keeps the plain empty state, without an announcement', () => {
  render({ data: [] });
  expect(content()).toContain(mockEn['cloud.conflicts.noOtherVersions']);
  expect(content()).not.toContain(mockEn['cloud.conflicts.allDone']);
  expect(mockAnnounce).not.toHaveBeenCalled();
});

test('a repeated focus parameter uses the first entry', () => {
  mockParams = { focus: ['copy', 'other'] };
  render({
    data: [
      { original: other, versions: [otherCopy] },
      { original, versions: [copy] },
    ],
  });
  expect(cards()[0].props.group.original.note_id).toBe('original');
  expect(cards()[0].props.highlighted).toBe(true);
});

test('the marked group has a thicker accent border than the others', () => {
  mockParams = { focus: 'copy' };
  render({
    data: [
      { original, versions: [copy] },
      { original: other, versions: [otherCopy] },
    ],
  });
  const borders = root.root
    .findAll(
      (node) =>
        (node.type as unknown) === 'View' &&
        String(node.props.className).includes('rounded-lg'),
    )
    .map((node) => node.props.className as string);
  expect(borders[0]).toContain('border-2 border-primary');
  expect(borders[1]).toContain('border border-border');
});

test('all done is announced again when a later batch is finished in the same visit', () => {
  const show = (data: OtherVersionGroup[]) => {
    mockQuery.mockReturnValue({
      data,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    act(() => root.update(<OtherVersionsScreen />));
  };
  render({ data: [{ original, versions: [copy] }] });
  show([]);
  // A sync brings another conflict while the screen is open, then it is resolved.
  show([{ original: other, versions: [otherCopy] }]);
  expect(content()).not.toContain(mockEn['cloud.conflicts.allDone']);
  show([]);
  expect(mockAnnounce).toHaveBeenCalledTimes(2);
});

test('nothing is marked seen while the list loads or after a failed load', () => {
  render({ isLoading: true });
  render({ isError: true });
  expect(mockMarkSeen).not.toHaveBeenCalled();
test('the confirmation keeps rather than deletes', () => {
  render({ data: [{ original, versions: [copy] }] });
  act(() => keepButtons()[0].props.onPress());
  expect(content()).not.toContain(`"${mockEn['common.delete']}"`);
  expect(confirm().findByType('Text' as never).props.children).toBe(
    mockEn['cloud.conflicts.keepConfirm'],
  );
});

test('"Keep both" is offered only under the other versions, and writes without a confirmation', async () => {
  render({ data: [{ original, versions: [copy, secondCopy] }] });
  expect(keepBothButtons()).toHaveLength(2);
  expect(keepBothButtons()[0].props.accessibilityHint).toBe(
    mockEn['cloud.conflicts.keepBothHint'],
  );
  await act(async () => keepBothButtons()[1].props.onPress());
  expect(mockKeepBoth).toHaveBeenCalledWith('second-copy', [original, copy, secondCopy]);
  expect(dialog().props.open).toBe(false);
  const message = mockEn['cloud.conflicts.keptBoth'];
  expect(mockToastSuccess).toHaveBeenCalledWith(message);
  expect(mockAnnounce).toHaveBeenCalledWith(message, { queue: true });
});

test('"Keep both" refused because the versions changed says so', async () => {
  const { VersionsChangedError } = jest.requireMock('~/lib/cloudSync/ui/versions') as {
    VersionsChangedError: new () => Error;
  };
  mockKeepBoth.mockRejectedValueOnce(new VersionsChangedError());
  render({ data: [{ original, versions: [copy] }] });
  await act(async () => keepBothButtons()[0].props.onPress());
  expect(mockToastSuccess).not.toHaveBeenCalled();
  expect(mockToastInfo).toHaveBeenCalledWith(mockEn['cloud.conflicts.versionsChanged']);
});

test('the original card does not carry the "Other version" badge', () => {
  render({ data: [{ original, versions: [copy] }] });
  for (const row of root.root.findAllByType('EntryItem' as never))
    expect(row.props.showVersionBadge).toBe(false);
});
