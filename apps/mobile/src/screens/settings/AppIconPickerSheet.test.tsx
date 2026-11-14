import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { useAppIconStore } from '~/lib/appIcon';
import { AppIconPickerSheet, getAppIconLabel } from './AppIconPickerSheet';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Image: 'Image',
  ScrollView: 'ScrollView',
  View: 'View',
}));
jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { appVariant: 'beta' } } },
}));
jest.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: Object.assign(({ children }: { children: React.ReactNode }) => children, {
    dismiss: jest.fn(),
  }),
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => 'LucideIcon' }));
jest.mock('uniwind', () => ({ useCSSVariable: () => ['#fff', '8', '#999'] }));
jest.mock('~/components/ui/icon', () => ({ Icon: 'Icon' }));
jest.mock('~/components/ui/text', () => ({ Text: 'Text' }));
jest.mock('~/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('~/lib/i18n', () => ({
  useTranslation: () => ({ t: (key: keyof typeof mockEn) => mockEn[key] }),
}));

let renderer: ReactTestRenderer | undefined;
const setIcon = jest.fn<Promise<boolean>, [string | null]>();

beforeEach(() => {
  setIcon.mockReset();
  useAppIconStore.setState({ current: null, isChanging: false, setIcon });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

function render() {
  act(() => {
    renderer = create(<AppIconPickerSheet />);
  });
  return renderer!.root.findAll(
    (node) =>
      (node.type as unknown) === 'Button' && node.props.accessibilityRole === 'radio',
  );
}

const NOTE = mockEn['appearance.appIconChangesAfterLeaving'];

function hasNote() {
  return renderer!.root.findAll((node) => node.props.children === NOTE).length > 0;
}

function radio(label: string) {
  const found = render().filter((node) => node.props.accessibilityLabel === label);
  return found[0];
}

test('beta labels its default Blueprint and offers no second Blueprint', () => {
  const labels = render().map((node) => node.props.accessibilityLabel);

  expect(getAppIconLabel(null)).toBe('Blueprint');
  expect(labels.filter((label) => label === 'Blueprint')).toHaveLength(1);
  expect(labels).not.toContain('Classic');
});

test('the Blueprint alternate shows as the selected default in beta', () => {
  useAppIconStore.setState({ current: 'Blueprint' });

  expect(radio('Blueprint').props.accessibilityState.checked).toBe(true);
});

test('a change waiting for background shows a note until a change applies at once', async () => {
  setIcon.mockResolvedValue(true);

  const ocean = radio('Ocean');
  expect(hasNote()).toBe(false);
  await act(async () => {
    await ocean.props.onPress();
  });

  expect(setIcon).toHaveBeenCalledWith('Ocean');
  expect(hasNote()).toBe(true);

  // Choosing the icon in use cancels the pending change.
  setIcon.mockResolvedValue(false);
  const plum = renderer!.root.find(
    (node) =>
      (node.type as unknown) === 'Button' && node.props.accessibilityLabel === 'Plum',
  );
  await act(async () => {
    await plum.props.onPress();
  });
  expect(hasNote()).toBe(false);
});

test('an immediate change shows no note', async () => {
  setIcon.mockResolvedValue(false);

  const ocean = radio('Ocean');
  await act(async () => {
    await ocean.props.onPress();
  });

  expect(hasNote()).toBe(false);
});

test('tapping the selected icon changes nothing', async () => {
  useAppIconStore.setState({ current: 'Ocean' });

  const ocean = radio('Ocean');
  await act(async () => {
    await ocean.props.onPress();
  });

  expect(setIcon).not.toHaveBeenCalled();
});
