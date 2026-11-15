import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import GratitudeEntryScreen from './index';
import type { Entry } from '~/types';

let mockEntry: Entry | undefined;

jest.mock('react-native', () => ({
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('~/hooks/useGratitude', () => ({
  useEntry: () => ({
    data: mockEntry,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('~/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('~/components/ui/safe-area-view', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ImageViewerModal', () => ({
  ImageViewerModal: 'ImageViewerModal',
}));
jest.mock('~/components/backdrops/ThemeBackdrop', () => ({
  ThemeBackdrop: 'ThemeBackdrop',
}));
jest.mock('./GratitudeEntryView', () => ({ GratitudeEntryView: 'GratitudeEntryView' }));
jest.mock('./GratitudeEntryEdit', () => ({ GratitudeEntryEdit: 'GratitudeEntryEdit' }));

const entry = { note_id: 'original', created_at: 1 } as Entry;
let root: ReactTestRenderer;
afterEach(() => act(() => root?.unmount()));

function render() {
  act(() => {
    root = create(<GratitudeEntryScreen noteId="original" />);
  });
}
const rerender = () => act(() => root.update(<GratitudeEntryScreen noteId="original" />));
const view = () => root.root.findAllByType('GratitudeEntryView' as never);
const content = () => JSON.stringify(root.toJSON());

test('an entry deleted elsewhere (e.g. "Keep this one") shows "not found" on return', () => {
  mockEntry = entry;
  render();
  expect(view()).toHaveLength(1);
  mockEntry = undefined;
  rerender();
  expect(view()).toHaveLength(0);
  expect(content()).toContain('entry.entryNotFound');
});

test('deleting from this screen keeps the entry on screen until it goes back', () => {
  mockEntry = entry;
  render();
  act(() => view()[0].props.onDeleteStart());
  mockEntry = undefined;
  rerender();
  expect(view()[0].props.entry).toBe(entry);
  expect(content()).not.toContain('entry.entryNotFound');
});
