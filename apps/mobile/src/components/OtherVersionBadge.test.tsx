import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OtherVersionBadge } from './OtherVersionBadge';

let mockGroups: string[] | undefined;
const mockUseGroups = jest.fn(() => ({ data: mockGroups }));

jest.mock('~/hooks/useGratitude', () => ({
  useEntriesWithOtherVersions: () => mockUseGroups(),
}));
jest.mock('~/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('lucide-react-native', () => ({ GitBranch: 'GitBranch' }));
jest.mock('~/components/ui/badge', () => ({ Badge: 'Badge' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));

let root: ReactTestRenderer;
afterEach(() => act(() => root?.unmount()));
beforeEach(() => jest.clearAllMocks());

function render(entry: { note_id: string }) {
  act(() => {
    root = create(<OtherVersionBadge entry={entry} />);
  });
}

test('an entry without another version shows nothing', () => {
  mockGroups = ['other'];
  render({ note_id: 'entry' });
  expect(root.toJSON()).toBeNull();
});

test('an entry with another version of its title or text shows the badge', () => {
  mockGroups = ['entry'];
  render({ note_id: 'entry' });
  expect(root.root.findByType('Badge' as never)).toBeDefined();
});

test('shows nothing until the versions load', () => {
  mockGroups = undefined;
  render({ note_id: 'entry' });
  expect(root.toJSON()).toBeNull();
});
