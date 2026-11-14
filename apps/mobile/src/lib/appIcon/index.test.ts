type AppIconModuleExports = typeof import('./index');

type NativeModule = {
  getAppIconName: jest.Mock<Promise<string | null>, [readonly string[]]>;
  setAppIcon: jest.Mock<
    Promise<'pending' | null | undefined>,
    [string | null, readonly string[]]
  >;
  setPendingIconHeld?: jest.Mock<Promise<void>, [boolean]>;
};

function load({
  native,
  appVariant = 'production',
}: {
  native: NativeModule | null;
  appVariant?: 'beta' | 'production';
}): AppIconModuleExports {
  let loaded: AppIconModuleExports | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    jest.doMock('expo', () => ({ requireOptionalNativeModule: () => native }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { appVariant } } },
    }));
    loaded = jest.requireActual<AppIconModuleExports>('./index');
  });
  return loaded!;
}

/** A native module whose pending choice reads back as the current icon, like Android's. */
function deferringNative(result: 'pending' | null | undefined): NativeModule {
  let selected: string | null = null;
  return {
    getAppIconName: jest.fn(async (_icons: readonly string[]) => selected),
    setAppIcon: jest.fn(async (name: string | null, _icons: readonly string[]) => {
      selected = name;
      return result;
    }),
  };
}

afterEach(() => {
  jest.resetModules();
});

test('a choice waiting for background reads as selected and asks for the notice', async () => {
  const native = deferringNative('pending');
  const { useAppIconStore, ALTERNATE_APP_ICONS } = load({ native });

  await expect(useAppIconStore.getState().setIcon('Ocean')).resolves.toBe(true);

  expect(native.setAppIcon).toHaveBeenCalledWith('Ocean', ALTERNATE_APP_ICONS);
  expect(useAppIconStore.getState().current).toBe('Ocean');
  expect(useAppIconStore.getState().isChanging).toBe(false);
});

test.each([
  ['iOS or a cancelled choice', null],
  ['an Android binary built before deferred changes', undefined],
])('no notice for %s', async (_case, result) => {
  const native = deferringNative(result);
  const { useAppIconStore } = load({ native });

  await expect(useAppIconStore.getState().setIcon('Plum')).resolves.toBe(false);
  expect(useAppIconStore.getState().current).toBe('Plum');
});

test('no notice when the change fails', async () => {
  const native = deferringNative('pending');
  native.setAppIcon.mockRejectedValueOnce(new Error('denied'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { useAppIconStore } = load({ native });

  await expect(useAppIconStore.getState().setIcon('Rose')).resolves.toBe(false);
  expect(useAppIconStore.getState().current).toBeNull();
  warn.mockRestore();
});

test('without the native module nothing changes', async () => {
  const { useAppIconStore, supportsAlternateIcons } = load({ native: null });

  expect(supportsAlternateIcons).toBe(false);
  await expect(useAppIconStore.getState().setIcon('Sage')).resolves.toBe(false);
});

test('production offers Classic as the default and every alternate', () => {
  const { APP_ICON_CHOICES, ALTERNATE_APP_ICONS, getAppIconArtwork, toAppIconChoice } =
    load({ native: null });

  expect(APP_ICON_CHOICES).toEqual([null, ...ALTERNATE_APP_ICONS]);
  expect(getAppIconArtwork(null)).toBeNull();
  expect(getAppIconArtwork('Blueprint')).toBe('Blueprint');
  expect(toAppIconChoice('Blueprint')).toBe('Blueprint');
});

test('beta shows its Blueprint default once and treats the Blueprint alternate as the default', () => {
  const { APP_ICON_CHOICES, ALTERNATE_APP_ICONS, getAppIconArtwork, toAppIconChoice } =
    load({ native: null, appVariant: 'beta' });

  expect(APP_ICON_CHOICES).toEqual([
    null,
    ...ALTERNATE_APP_ICONS.filter((name) => name !== 'Blueprint'),
  ]);
  expect(getAppIconArtwork(null)).toBe('Blueprint');
  expect(toAppIconChoice('Blueprint')).toBeNull();
  expect(toAppIconChoice('Ocean')).toBe('Ocean');
});

test('holds reach native once while any hold is active', () => {
  const native = {
    ...deferringNative('pending'),
    setPendingIconHeld: jest.fn(async (_held: boolean) => undefined),
  };
  const { holdAppIconChange } = load({ native });

  const releaseEditor = holdAppIconChange();
  const releaseSync = holdAppIconChange();
  releaseEditor();
  releaseEditor();
  expect(native.setPendingIconHeld.mock.calls).toEqual([[true]]);

  releaseSync();
  expect(native.setPendingIconHeld.mock.calls).toEqual([[true], [false]]);
});

test('holds are harmless on binaries without them', () => {
  const { holdAppIconChange } = load({ native: deferringNative(null) });

  expect(() => holdAppIconChange()()).not.toThrow();
});
