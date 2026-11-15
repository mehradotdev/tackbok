import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OtherVersionBadge } from './OtherVersionBadge';

let mockGroups: string[][] | undefined;
const mockUseGroups = jest.fn(() => ({ data: mockGroups }));

jest.mock('~/hooks/useGratitude', () => ({
  useOpenConflictGroups: () => mockUseGroups(),
}));
jest.mock('~/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('lucide-react-native', () => ({ GitBranch: 'GitBranch' }));
jest.mock('~/components/ui/badge', () => ({ Badge: 'Badge' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));

let root: ReactTestRenderer;
afterEach(() => act(() => root?.unmount()));
beforeEach(() => jest.clearAllMocks());

function render(entry: { note_id: string; conflict_origin_id: string | null }) {
  act(() => {
    root = create(<OtherVersionBadge entry={entry} />);
  });
}

test('an entry that is not another version shows nothing and loads nothing', () => {
  mockGroups = [['original', 'copy']];
  render({ note_id: 'original', conflict_origin_id: null });
  expect(root.toJSON()).toBeNull();
  expect(mockUseGroups).not.toHaveBeenCalled();
});

test('a version that still has another live version shows the badge', () => {
  mockGroups = [['original', 'copy']];
  render({ note_id: 'copy', conflict_origin_id: 'original' });
  expect(root.root.findByType('Badge' as never)).toBeDefined();
});

test('a lone survivor shows no badge, e.g. a kept copy', () => {
  mockGroups = [['other-original', 'other-copy']];
  render({ note_id: 'copy', conflict_origin_id: 'original' });
  expect(root.toJSON()).toBeNull();
});

test('shows nothing until the groups load', () => {
  mockGroups = undefined;
  render({ note_id: 'copy', conflict_origin_id: 'original' });
  expect(root.toJSON()).toBeNull();
});
