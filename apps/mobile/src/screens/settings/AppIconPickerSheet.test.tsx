import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { en as mockEn } from '~/lib/i18n/translations/en';
import { useAppIconStore } from '~/lib/appIcon';
import { AppIconPickerSheet, getAppIconLabel } from './AppIconPickerSheet';

type AlertButton = { text: string; style?: string; onPress?: () => void };
type AlertArgs = [string, string, AlertButton[], { cancelable?: boolean }?];
const mockAlert = jest.fn<void, AlertArgs>();

jest.mock('react-native', () => ({
  Alert: { alert: (...args: AlertArgs) => mockAlert(...args) },
  Platform: { OS: 'android' },
  Image: 'Image',
  ScrollView: 'ScrollView',
  View: 'View',
}));
// A beta Android binary that registered the Classic alternate.
jest.mock('expo', () => ({
  requireOptionalNativeModule: () => ({
    registeredIcons: [
      'Sage',
      'Midnight',
      'Ocean',
      'Terracotta',
      'Rose',
      'Plum',
      'Blueprint',
      'Classic',
    ],
  }),
}));
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
const setIcon = jest.fn<Promise<void>, [string]>(async () => undefined);

beforeEach(() => {
  mockAlert.mockReset();
  setIcon.mockClear();
  useAppIconStore.setState({ current: 'Blueprint', isChanging: false, setIcon });
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

function press(label: string) {
  const radio = render().find((node) => node.props.accessibilityLabel === label)!;
  act(() => radio.props.onPress());
}

test('beta offers every icon and selects its Blueprint default', () => {
  const radios = render();

  expect(radios.map((node) => node.props.accessibilityLabel)).toEqual([
    'Classic',
    'Sage',
    'Midnight',
    'Ocean',
    'Terracotta',
    'Rose',
    'Plum',
    'Blueprint',
  ]);
  expect(
    radios
      .filter((node) => node.props.accessibilityState.checked)
      .map((node) => node.props.accessibilityLabel),
  ).toEqual(['Blueprint']);
  expect(getAppIconLabel('Classic')).toBe('Classic');
});

test('Android asks before closing the app to change the icon', () => {
  press('Ocean');

  expect(setIcon).not.toHaveBeenCalled();
  const [title, message, buttons, options] = mockAlert.mock.calls[0];
  // Back and a tap outside dismiss it without a change.
  expect(options).toEqual({ cancelable: true });
  expect(title).toBe(mockEn['appearance.changeAppIconTitle']);
  expect(message).toBe(mockEn['appearance.changeAppIconMessage']);
  expect(buttons.map((button) => button.text)).toEqual([
    mockEn['common.cancel'],
    mockEn['appearance.changeIcon'],
  ]);

  // Cancel has no handler, so nothing changes.
  expect(buttons[0].style).toBe('cancel');
  expect(buttons[0].onPress).toBeUndefined();
  act(() => buttons[1].onPress!());
  expect(setIcon).toHaveBeenCalledWith('Ocean');
});

test('tapping the selected icon changes nothing', () => {
  press('Blueprint');

  expect(mockAlert).not.toHaveBeenCalled();
  expect(setIcon).not.toHaveBeenCalled();
});
