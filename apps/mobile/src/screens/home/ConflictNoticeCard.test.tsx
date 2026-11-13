import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { CloudConflictItem } from '~/lib/cloudSync/ui';
import { ConflictNoticeCard } from './ConflictNoticeCard';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

const mockList = jest.fn<Promise<CloudConflictItem[]>, []>();
const mockPush = jest.fn();
let mockSnapshot: { conflictCount: number } = { conflictCount: 0 };

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
const mockAnnounce = jest.fn();
const mockPlatform = { OS: 'ios' };
jest.mock('react-native', () => ({
  View: 'View',
  // Read lazily: this factory runs before the test's own constants exist.
  get Platform() {
    return mockPlatform;
  },
  AccessibilityInfo: {
    announceForAccessibility: (message: string) => mockAnnounce(message),
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('lucide-react-native', () => ({ FileClock: 'FileClock' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn) => mockTranslate('en', key),
  }),
}));
jest.mock('~/lib/cloudSync/ui', () => ({
  listCloudConflictItems: () => mockList(),
  useCloudSyncSnapshot: () => ({ snapshot: mockSnapshot }),
}));

const entriesItem: CloudConflictItem = {
  kind: 'entries',
  conflictIds: ['e1'],
  recoveredEntryIds: ['recovered-a'],
};
const archivedName: CloudConflictItem = {
  kind: 'name',
  conflictIds: ['n1'],
  current: 'Mehra',
  other: 'Mehra A',
  archived: true,
};

let root: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.OS = 'ios';
});
afterEach(() => act(() => root?.unmount()));

async function render(conflictCount: number, items: CloudConflictItem[]) {
  mockSnapshot = { conflictCount };
  mockList.mockResolvedValue(items);
  await act(async () => {
    root = create(<ConflictNoticeCard />);
  });
}
/** A new snapshot object, as the shared snapshot store hands out on reload. */
async function refreshSnapshot(conflictCount: number, items: CloudConflictItem[]) {
  mockSnapshot = { conflictCount };
  mockList.mockResolvedValue(items);
  await act(async () => root.update(<ConflictNoticeCard />));
}
const content = () => JSON.stringify(root.toJSON());

test('does not load or show anything without open conflicts', async () => {
  await render(0, [entriesItem]);
  expect(mockList).not.toHaveBeenCalled();
  expect(root.toJSON()).toBeNull();
});

test('stays hidden when no conflict has anything to show', async () => {
  // Counted records can all be filtered out, e.g. ones from before joining.
  await render(1, []);
  expect(root.toJSON()).toBeNull();
  await refreshSnapshot(1, [archivedName]);
  expect(root.toJSON()).toBeNull();
});

test('tells the user and opens Cloud backup', async () => {
  await render(1, [entriesItem]);
  expect(content()).toContain(mockEn['cloud.conflicts.title']);
  expect(content()).toContain(mockEn['cloud.conflicts.homeNotice']);
  const button = root.root.findByType('Button' as never);
  act(() => button.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/cloud-backup');
});

test('announces itself politely when it appears', async () => {
  await render(1, [entriesItem]);
  const live = root.root.findAll(
    (node) => node.props.accessibilityLiveRegion === 'polite',
  );
  expect(live).toHaveLength(1);
});

test('shows when the conflicts cannot be loaded, so the retry is reachable', async () => {
  mockSnapshot = { conflictCount: 1 };
  mockList.mockRejectedValue(new Error('read failed'));
  await act(async () => {
    root = create(<ConflictNoticeCard />);
  });
  expect(content()).toContain(mockEn['cloud.conflicts.homeNotice']);
});

test('goes away once the conflicts are handled', async () => {
  await render(1, [entriesItem]);
  expect(root.toJSON()).not.toBeNull();
  await refreshSnapshot(0, []);
  expect(root.toJSON()).toBeNull();
});

test('reloads on a new snapshot and hides when the copies were deleted', async () => {
  await render(1, [entriesItem]);
  // The record stays open, but its recovered entry no longer exists.
  await refreshSnapshot(1, []);
  expect(mockList).toHaveBeenCalledTimes(2);
  expect(root.toJSON()).toBeNull();
});

test('announces once on iOS, not on every snapshot refresh', async () => {
  await render(1, [entriesItem]);
  expect(mockAnnounce).toHaveBeenCalledTimes(1);
  expect(mockAnnounce).toHaveBeenCalledWith(mockEn['cloud.conflicts.homeNotice']);
  await refreshSnapshot(1, [entriesItem]);
  expect(mockAnnounce).toHaveBeenCalledTimes(1);
});

test('announces again when a new conflict brings the notice back', async () => {
  await render(1, [entriesItem]);
  await refreshSnapshot(1, []);
  await refreshSnapshot(1, [entriesItem]);
  expect(mockAnnounce).toHaveBeenCalledTimes(2);
});

test('leaves Android to the live region and does not announce while hidden', async () => {
  await render(1, []);
  expect(mockAnnounce).not.toHaveBeenCalled();
  act(() => root.unmount());
  mockPlatform.OS = 'android';
  await render(1, [entriesItem]);
  expect(mockAnnounce).not.toHaveBeenCalled();
});
