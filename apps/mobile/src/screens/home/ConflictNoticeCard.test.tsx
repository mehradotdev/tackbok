import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { CloudConflictItem } from '~/lib/cloudSync/ui';
import { ConflictNoticeCard } from './ConflictNoticeCard';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';

const mockList = jest.fn<Promise<CloudConflictItem[]>, []>();
const mockPush = jest.fn();
let mockSnapshot: { conflictCount: number } = { conflictCount: 0 };
const mockSettings = {
  conflictNoticeHiddenAt: null as number | null,
  otherVersionsSeenAt: null as number | null,
  hideConflictNotice: jest.fn((at: number) => {
    mockSettings.conflictNoticeHiddenAt = Math.max(
      mockSettings.conflictNoticeHiddenAt ?? 0,
      at,
    );
  }),
};

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
jest.mock('lucide-react-native', () => ({ FileClock: 'FileClock', X: 'X' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn, params?: Record<string, number>) =>
      mockTranslate('en', key, params),
  }),
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: (select: (state: typeof mockSettings) => unknown) =>
    select(mockSettings),
}));
jest.mock('~/lib/cloudSync/ui', () => ({
  listCloudConflictItems: () => mockList(),
  useCloudSyncSnapshot: () => ({ snapshot: mockSnapshot }),
}));

const entriesItem: CloudConflictItem = {
  kind: 'entries',
  conflictIds: ['e1', 'e2'],
  entryCount: 2,
  latestAt: 100,
};
const nameItem: CloudConflictItem = {
  kind: 'name',
  conflictIds: ['n1'],
  current: 'Mehra',
  other: 'Mehra A',
  latestAt: 50,
};
const entriesMessage = (count: number) =>
  mockTranslate('en', 'cloud.conflicts.homeNoticeEntries', { count });

let root: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.OS = 'ios';
  mockSettings.conflictNoticeHiddenAt = null;
  mockSettings.otherVersionsSeenAt = null;
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
  // A counted choice can be unlisted, e.g. a photo still downloading.
  await render(1, []);
  expect(root.toJSON()).toBeNull();
});

const actionButton = () =>
  root.root.find(
    (node) => (node.type as unknown) === 'Button' && node.props.variant === 'outline',
  );
const closeButton = () =>
  root.root.find(
    (node) =>
      (node.type as unknown) === 'Button' &&
      node.props.accessibilityLabel === mockEn['cloud.conflicts.hideNotice'],
  );

test('with only entry conflicts, counts them and opens Other versions', async () => {
  await render(1, [entriesItem]);
  expect(content()).toContain(mockEn['cloud.conflicts.title']);
  expect(entriesMessage(2)).toBe(
    '2 entries were edited on two devices at once. Nothing was lost: all versions are in your journal.',
  );
  expect(content()).toContain(entriesMessage(2));
  expect(content()).toContain(mockEn['cloud.conflicts.compareVersions']);
  act(() => actionButton().props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/other-versions');
});

test('uses the singular for one entry', async () => {
  await render(1, [{ ...entriesItem, entryCount: 1 }]);
  expect(content()).toContain(
    'An entry was edited on two devices at once. Nothing was lost: all versions are in your journal.',
  );
});

test('with name, photo or returned-entry rows, opens Cloud backup', async () => {
  await render(1, [entriesItem, nameItem]);
  expect(content()).toContain(mockEn['cloud.conflicts.homeNotice']);
  expect(content()).toContain(mockEn['cloud.viewCloudBackup']);
  act(() => actionButton().props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/cloud-backup');
});

test('the close button is labelled, says it is this device only, and has a full-size target', async () => {
  await render(1, [entriesItem]);
  const close = closeButton();
  expect(close.props.accessibilityHint).toBe(mockEn['cloud.conflicts.hideNoticeHint']);
  // 28pt button + 8pt slop on each side = 44pt.
  expect(close.props.className).toContain('size-7');
  expect(close.props.hitSlop).toBe(8);
});

test('the close button hides the notice until a newer conflict arrives', async () => {
  await render(1, [entriesItem, nameItem]);
  act(() => closeButton().props.onPress());
  // Remembers the newest conflict it hid; nothing is dismissed or deleted.
  expect(mockSettings.hideConflictNotice).toHaveBeenCalledWith(100);
  expect(mockList).toHaveBeenCalledTimes(1);
  await refreshSnapshot(1, [entriesItem, nameItem]);
  expect(root.toJSON()).toBeNull();
  // An older or equally old conflict stays hidden.
  await refreshSnapshot(1, [{ ...nameItem, latestAt: 100 }]);
  expect(root.toJSON()).toBeNull();
  await refreshSnapshot(1, [entriesItem, { ...nameItem, latestAt: 101 }]);
  expect(content()).toContain(mockEn['cloud.conflicts.homeNotice']);
});

test('announces again when a newer conflict brings a hidden notice back', async () => {
  await render(1, [entriesItem]);
  act(() => closeButton().props.onPress());
  await refreshSnapshot(1, [entriesItem]);
  expect(root.toJSON()).toBeNull();
  await refreshSnapshot(1, [{ ...entriesItem, latestAt: 200 }]);
  expect(mockAnnounce).toHaveBeenCalledTimes(2);
});

test('opening Other versions clears the notice for the entry conflicts seen there', async () => {
  mockSettings.otherVersionsSeenAt = 150;
  await render(1, [entriesItem]);
  expect(root.toJSON()).toBeNull();
  // A name conflict is not on Other versions, so it still shows the notice.
  await refreshSnapshot(1, [entriesItem, { ...nameItem, latestAt: 120 }]);
  expect(content()).toContain(mockEn['cloud.conflicts.homeNotice']);
  // A newer entry conflict is news again.
  await refreshSnapshot(1, [{ ...entriesItem, latestAt: 151 }]);
  expect(content()).toContain(entriesMessage(2));
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
  act(() => actionButton().props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/cloud-backup');
  // Hidden after a failed load: no conflict time to compare, so use now.
  const now = Date.now();
  act(() => closeButton().props.onPress());
  expect(mockSettings.hideConflictNotice.mock.calls[0][0]).toBeGreaterThanOrEqual(now);
  await act(async () => root.update(<ConflictNoticeCard />));
  expect(root.toJSON()).toBeNull();
});

test('after hiding, a failed load stays hidden and a later successful load with a newer conflict shows it', async () => {
  mockSettings.conflictNoticeHiddenAt = 100;
  mockSnapshot = { conflictCount: 1 };
  mockList.mockRejectedValue(new Error('read failed'));
  await act(async () => {
    root = create(<ConflictNoticeCard />);
  });
  expect(root.toJSON()).toBeNull();
  await refreshSnapshot(1, [{ ...entriesItem, latestAt: 101 }]);
  expect(content()).toContain(entriesMessage(2));
});

test('goes away once the conflicts are handled', async () => {
  await render(1, [entriesItem]);
  expect(root.toJSON()).not.toBeNull();
  await refreshSnapshot(0, []);
  expect(root.toJSON()).toBeNull();
});

test('reloads on a new snapshot and hides when each entry has one version left', async () => {
  await render(1, [entriesItem]);
  // The record stays undismissed, but its group has one live version left,
  // e.g. after "Keep this one" on another device has synced.
  await refreshSnapshot(1, []);
  expect(mockList).toHaveBeenCalledTimes(2);
  expect(root.toJSON()).toBeNull();
});

test('announces once on iOS, not on every snapshot refresh', async () => {
  await render(1, [entriesItem]);
  expect(mockAnnounce).toHaveBeenCalledTimes(1);
  expect(mockAnnounce).toHaveBeenCalledWith(entriesMessage(2));
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

test('an entry kept after a delete/edit race shows the notice until it is dismissed', async () => {
  const returned: CloudConflictItem = {
    kind: 'returnedEntry',
    conflictIds: ['d1'],
    entry: { entryId: 'returned', createdAt: 7, title: null, preview: 'Sunny' },
    latestAt: 100,
  };
  await render(1, [returned]);
  expect(content()).toContain(mockEn['cloud.conflicts.homeNotice']);
  await refreshSnapshot(1, []);
  expect(root.toJSON()).toBeNull();
});
