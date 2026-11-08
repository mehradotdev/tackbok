import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ConflictsCard } from './ConflictsCard';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { translate as mockTranslate } from '~/lib/i18n/translations';
import type { CloudConflictItem } from '~/lib/cloudSync/ui';

const mockList = jest.fn<Promise<CloudConflictItem[]>, []>();
const mockResolveName = jest.fn(async (..._args: unknown[]) => {});
const mockResolvePhoto = jest.fn(async (..._args: unknown[]) => {});
const mockAcknowledge = jest.fn(async (..._args: unknown[]) => {});
const mockPush = jest.fn();
const mockToastError = jest.fn();

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', regionCode: 'US' }],
}));
jest.mock('react-native', () => ({ View: 'View', Image: 'Image' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('lucide-react-native', () => ({ FileClock: 'FileClock' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/toast', () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));
jest.mock('~/lib/photoUtils', () => ({
  getFullPhotoUri: (uri: string) => `file:///documents/${uri}`,
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: keyof typeof mockEn, params?: Record<string, unknown>) =>
      mockTranslate('en', key, params as never),
  }),
}));
jest.mock('~/lib/cloudSync/ui', () => ({
  listCloudConflictItems: () => mockList(),
  resolveNameConflict: (...args: unknown[]) => mockResolveName(...args),
  resolvePhotoConflict: (...args: unknown[]) => mockResolvePhoto(...args),
  acknowledgeCloudConflicts: (...args: unknown[]) => mockAcknowledge(...args),
}));

const nameItem: Extract<CloudConflictItem, { kind: 'name' }> = {
  kind: 'name',
  conflictIds: ['n1'],
  current: 'Mehra',
  other: 'Mehra A',
  archived: false,
};
const photoItem: CloudConflictItem = {
  kind: 'photo',
  conflictIds: ['p1'],
  otherAssetId: 'photo-other',
  otherUri: 'photos/other.jpg',
};
const entriesItem: CloudConflictItem = {
  kind: 'entries',
  conflictIds: ['e1', 'e2'],
  recoveredEntryIds: ['recovered-a', 'recovered-b'],
};

let root: ReactTestRenderer;
beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => root?.unmount()));

async function render(items: CloudConflictItem[]) {
  mockList.mockResolvedValue(items);
  await act(async () => {
    root = create(<ConflictsCard refreshToken={0} />);
  });
}
const content = () => JSON.stringify(root.toJSON());
const button = (label: string) =>
  root.root.findAll(
    (node) =>
      (node.type as unknown) === 'Button' &&
      node.findByType('Text' as never).props.children === label,
  )[0];

test('renders nothing when no conflict needs a decision', async () => {
  await render([]);
  expect(root.toJSON()).toBeNull();
});

test('shows both names with per-row actions and no global "Mark as reviewed"', async () => {
  await render([nameItem]);
  expect(content()).toContain(
    'Your name was edited on two devices. Current: “Mehra”. Other version: “Mehra A”.',
  );
  expect(button('Use “Mehra A”')).toBeDefined();
  expect(button(mockEn['cloud.conflicts.keepCurrent'])).toBeDefined();
  expect(content()).not.toContain('Mark as reviewed');
});

test('"Use" resolves the name row and the row disappears after refreshing', async () => {
  await render([nameItem]);
  mockList.mockResolvedValue([]);
  await act(async () => button('Use “Mehra A”').props.onPress());
  expect(mockResolveName).toHaveBeenCalledWith(nameItem, 'use');
  expect(root.toJSON()).toBeNull();
});

test('"Keep current" resolves the name row without changing the name', async () => {
  await render([nameItem]);
  await act(async () => button(mockEn['cloud.conflicts.keepCurrent']).props.onPress());
  expect(mockResolveName).toHaveBeenCalledWith(nameItem, 'keep');
});

test('a removed name is described as no name', async () => {
  await render([{ ...nameItem, other: null }]);
  expect(content()).toContain(
    'Your name was edited on two devices. Current: “Mehra”. Other version: no name.',
  );
  expect(button(mockEn['cloud.conflicts.removeName'])).toBeDefined();
});

test('shows the other photo as a thumbnail with its actions', async () => {
  await render([photoItem]);
  const image = root.root.findByType('Image' as never);
  expect(image.props.source).toEqual({ uri: 'file:///documents/photos/other.jpg' });
  await act(async () => button(mockEn['cloud.conflicts.usePhoto']).props.onPress());
  expect(mockResolvePhoto).toHaveBeenCalledWith(photoItem, 'use');
});

test('groups entry conflicts and "Show them" opens the other versions', async () => {
  await render([entriesItem]);
  expect(content()).toContain(
    '2 entries were edited on two devices at once. Both versions are in your journal.',
  );
  await act(async () => button(mockEn['cloud.conflicts.showThem']).props.onPress());
  expect(mockAcknowledge).toHaveBeenCalledWith(['e1', 'e2']);
  expect(mockPush).toHaveBeenCalledWith('/other-versions');
});

test('reports a failed action and keeps the row', async () => {
  await render([nameItem]);
  mockResolveName.mockRejectedValueOnce(new Error('write failed'));
  await act(async () => button('Use “Mehra A”').props.onPress());
  expect(mockToastError).toHaveBeenCalledWith(
    mockEn['cloud.cloudBackupCouldNotBeUpdated'],
  );
  expect(content()).toContain('Mehra A');
});

test('reloads when the sync snapshot changes, even if the conflict count does not', async () => {
  await render([]); // The other photo is still downloading.
  mockList.mockResolvedValue([photoItem]);
  await act(async () => root.update(<ConflictsCard refreshToken={1} />));
  expect(mockList).toHaveBeenCalledTimes(2);
  expect(root.root.findByType('Image' as never)).toBeDefined();
});

test('coalesces reloads requested while one is running', async () => {
  let finish!: (items: CloudConflictItem[]) => void;
  mockList.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  await act(async () => {
    root = create(<ConflictsCard refreshToken={0} />);
  });
  mockList.mockResolvedValue([nameItem]);
  await act(async () => root.update(<ConflictsCard refreshToken={1} />));
  await act(async () => root.update(<ConflictsCard refreshToken={2} />));
  await act(async () => finish([]));
  expect(mockList).toHaveBeenCalledTimes(2);
  expect(content()).toContain('Mehra A');
});

test('a failed read shows an error with a retry instead of hiding the card', async () => {
  mockList.mockRejectedValueOnce(new Error('read failed'));
  await act(async () => {
    root = create(<ConflictsCard refreshToken={0} />);
  });
  expect(content()).toContain(mockEn['cloud.conflicts.loadFailed']);
  mockList.mockResolvedValue([nameItem]);
  await act(async () => button(mockEn['common.retry']).props.onPress());
  expect(content()).not.toContain(mockEn['cloud.conflicts.loadFailed']);
  expect(content()).toContain('Mehra A');
});

test('names archived by the upgrade stay reachable behind "Show older name versions"', async () => {
  await render([
    { ...nameItem, conflictIds: ['old'], other: 'Old name', archived: true },
  ]);
  expect(content()).not.toContain('Old name');
  await act(async () => button(mockEn['cloud.conflicts.showOlderNames']).props.onPress());
  expect(content()).toContain(mockEn['cloud.conflicts.olderNamesDescription']);
  await act(async () => button('Use “Old name”').props.onPress());
  expect(mockResolveName).toHaveBeenCalledWith(
    expect.objectContaining({ conflictIds: ['old'] }),
    'use',
  );
});

test('a long name wraps inside the card and keeps its full accessible label', async () => {
  const other = 'A'.repeat(300);
  await render([{ ...nameItem, other }]);
  const use = button(`Use “${other}”`);
  expect(use.props.className).toContain('max-w-full');
  expect(use.props.className).toContain('h-auto');
  expect(use.props.accessibilityLabel).toBe(`Use “${other}”`);
  expect(use.findByType('Text' as never).props.className).toContain('shrink');
});
