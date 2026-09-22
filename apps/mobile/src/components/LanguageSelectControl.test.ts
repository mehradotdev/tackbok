import React from 'react';
import { act, create } from 'react-test-renderer';
import { I18nManager, Platform } from 'react-native';
import { LanguageSelectControl } from './LanguageSelectControl';
import { Select } from './ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel } from './ui/alert-dialog';

const mockSave = jest.fn();
const mockReload = jest.fn();
const mockError = jest.fn();
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() },
}));
jest.mock('expo', () => ({
  reloadAppAsync: (...args: unknown[]) => mockReload(...args),
}));
jest.mock('~/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('~/lib/i18n', () => ({
  languages: [
    { code: 'en', displayName: 'English', nativeName: 'English', isRTL: false },
    { code: 'he', displayName: 'Hebrew', nativeName: 'עברית', isRTL: true },
    { code: 'ar', displayName: 'Arabic', nativeName: 'العربية', isRTL: true },
  ],
  useTranslation: () => ({
    t: (key: string) => key,
    localePreference: 'en',
    deviceDefaultLocale: 'en',
    isDeviceDefaultLocaleSupported: true,
    setLocale: mockSave,
  }),
}));
jest.mock('./ui/text', () => ({ Text: 'Text' }));
jest.mock('./ui/toast', () => ({
  toast: { error: (...args: unknown[]) => mockError(...args) },
}));
jest.mock('./ui/select', () =>
  Object.fromEntries(
    [
      'Select',
      'SelectContent',
      'SelectItem',
      'SelectTrigger',
      'SelectValue',
      'NativeSelectScrollView',
    ].map((name) => [name, name]),
  ),
);
jest.mock('./ui/alert-dialog', () =>
  Object.fromEntries(
    [
      'AlertDialog',
      'AlertDialogAction',
      'AlertDialogCancel',
      'AlertDialogContent',
      'AlertDialogDescription',
      'AlertDialogFooter',
      'AlertDialogHeader',
      'AlertDialogTitle',
    ].map((name) => [name, name]),
  ),
);

let root: ReturnType<typeof create>;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.replaceProperty(I18nManager, 'isRTL', false);
  jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
  jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
  act(() => {
    root = create(React.createElement(LanguageSelectControl));
  });
});
afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function select(code: string) {
  act(() => root.root.findByType(Select).props.onValueChange({ value: code }));
}
function proceed() {
  act(() => root.root.findByType(AlertDialogAction).props.onPress());
}

it.each(['he', 'ar'])(
  'waits for a slow %s save before changing direction or reloading',
  async (code) => {
    let finish!: () => void;
    mockSave.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    select(code);
    proceed();
    expect(root.root.findByType(AlertDialog).props.open).toBe(false);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(mockSave).toHaveBeenCalledWith(code);
    expect(I18nManager.forceRTL).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();

    await act(async () => {
      finish();
    });
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
  },
);

it('waits for saving English before switching back to LTR', async () => {
  jest.replaceProperty(I18nManager, 'isRTL', true);
  mockSave.mockResolvedValue(undefined);
  select('en');
  proceed();
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
  expect(mockReload).toHaveBeenCalledTimes(1);
});

it('handles a failed save without changing direction or tearing down React', async () => {
  mockSave.mockRejectedValue(new Error('database unavailable'));
  select('he');
  proceed();
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(mockError).toHaveBeenCalledWith('common.unknownError');
  expect(I18nManager.forceRTL).not.toHaveBeenCalled();
  expect(mockReload).not.toHaveBeenCalled();
});

it('does not save or reload when the restart is cancelled', () => {
  select('he');
  act(() => root.root.findByType(AlertDialogCancel).props.onPress());
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockReload).not.toHaveBeenCalled();
});

it('saves a language with the same direction without restarting', async () => {
  mockSave.mockResolvedValue(undefined);
  select('en');
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(mockSave).toHaveBeenCalledWith('en');
  expect(mockReload).not.toHaveBeenCalled();
  expect(I18nManager.forceRTL).not.toHaveBeenCalled();
});

it('handles a rejected reload without an unhandled promise rejection', async () => {
  mockSave.mockResolvedValue(undefined);
  mockReload.mockRejectedValueOnce(new Error('reload unavailable'));
  select('he');
  proceed();
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  expect(mockError).toHaveBeenCalledWith('common.unknownError');
});
