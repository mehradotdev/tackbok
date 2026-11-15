import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OtherVersionBanner } from './OtherVersionBanner';
import { en as mockEn } from '~/lib/i18n/translations/en';

let mockGroups: string[][] | undefined;
const mockPush = jest.fn();

jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('~/hooks/useGratitude', () => ({
  useOpenConflictGroups: () => ({ data: mockGroups }),
}));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({ t: (key: keyof typeof mockEn) => mockEn[key] }),
}));
jest.mock('lucide-react-native', () => ({ GitBranch: 'GitBranch' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));

let root: ReactTestRenderer;
afterEach(() => act(() => root?.unmount()));
beforeEach(() => jest.clearAllMocks());

function render(entryId: string) {
  act(() => {
    root = create(<OtherVersionBanner entryId={entryId} />);
  });
}
const content = () => JSON.stringify(root.toJSON());
const compare = () => root.root.findByType('Button' as never);

test.each(['original', 'copy'])('shows on the %s of an open group', (entryId) => {
  mockGroups = [['original', 'copy']];
  render(entryId);
  expect(content()).toContain(mockEn['entry.otherVersionBanner']);
  expect(content()).toContain(mockEn['entry.compareVersions']);
});

test('shows nothing for a version left on its own', () => {
  // The open groups only list groups with more than one live version.
  mockGroups = [['other-original', 'other-copy']];
  render('copy');
  expect(root.toJSON()).toBeNull();
});

test('shows nothing until the groups load', () => {
  mockGroups = undefined;
  render('original');
  expect(root.toJSON()).toBeNull();
});

test('"Compare" opens Other versions at this entry', () => {
  mockGroups = [['original', 'copy']];
  render('copy');
  act(() => compare().props.onPress());
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/other-versions',
    params: { focus: 'copy' },
  });
});

test('"Compare" says where it goes and grows with large text', () => {
  mockGroups = [['original', 'copy']];
  render('original');
  expect(compare().props.accessibilityHint).toBe(mockEn['entry.compareVersionsHint']);
  expect(compare().props.className).toContain('h-auto');
  expect(compare().props.className).toContain('min-h-10');
  // A calm card, not the sync-error colour.
  expect(content()).not.toContain('destructive');
});
