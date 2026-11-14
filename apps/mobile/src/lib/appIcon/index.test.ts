type AppIconModuleExports = typeof import('./index');

type NativeModule = {
  registeredIcons?: readonly string[];
  getAppIconName: jest.Mock<Promise<string | null>, [readonly string[]]>;
  setAppIcon: jest.Mock<Promise<void>, [string | null, readonly string[]]>;
};

function load({
  native,
  appVariant = 'production',
  os = 'android',
}: {
  native: NativeModule | null;
  appVariant?: 'beta' | 'production';
  os?: 'android' | 'ios';
}): AppIconModuleExports {
  let loaded: AppIconModuleExports | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    jest.doMock('expo', () => ({ requireOptionalNativeModule: () => native }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { appVariant } } },
    }));
    loaded = jest.requireActual<AppIconModuleExports>('./index');
  });
  return loaded!;
}

/** A native module that reads back the icon it was last given. */
function fakeNative(registeredIcons?: readonly string[]): NativeModule {
  let selected: string | null = null;
  return {
    registeredIcons,
    getAppIconName: jest.fn(async (_icons: readonly string[]) => selected),
    setAppIcon: jest.fn(async (name: string | null, _icons: readonly string[]) => {
      selected = name;
    }),
  };
}

afterEach(() => {
  jest.resetModules();
});

test('only Android asks before changing, because the app closes there', () => {
  expect(load({ native: fakeNative() }).appIconChangeClosesApp).toBe(true);
  expect(load({ native: fakeNative(), os: 'ios' }).appIconChangeClosesApp).toBe(false);
});

test.each([
  [
    'a current Android binary',
    ['Sage', 'Midnight', 'Ocean', 'Terracotta', 'Rose', 'Plum', 'Blueprint'],
  ],
  ['an older Android binary', undefined],
])(
  'production on %s offers every icon, with Classic as the bundled default',
  async (_case, registeredIcons) => {
    const native = fakeNative(registeredIcons);
    const { APP_ICON_CHOICES, ALTERNATE_APP_ICONS, useAppIconStore } = load({ native });
    const { refresh, setIcon } = useAppIconStore.getState();

    expect(APP_ICON_CHOICES).toEqual(['Classic', ...ALTERNATE_APP_ICONS]);
    await refresh();
    expect(useAppIconStore.getState().current).toBe('Classic');

    await setIcon('Blueprint');
    expect(native.setAppIcon).toHaveBeenLastCalledWith('Blueprint', ALTERNATE_APP_ICONS);
    expect(useAppIconStore.getState().current).toBe('Blueprint');
    await setIcon('Classic');
    expect(native.setAppIcon).toHaveBeenLastCalledWith(null, ALTERNATE_APP_ICONS);
    expect(useAppIconStore.getState().current).toBe('Classic');
  },
);

test.each(['android', 'ios'] as const)(
  'a beta binary on %s offers every icon, with Blueprint as the bundled default',
  async (os) => {
    const { BETA_ALTERNATE_APP_ICONS } = load({ native: null });
    const native = fakeNative(os === 'android' ? BETA_ALTERNATE_APP_ICONS : undefined);
    const { APP_ICON_CHOICES, useAppIconStore } = load({
      native,
      appVariant: 'beta',
      os,
    });
    const { refresh, setIcon } = useAppIconStore.getState();

    expect([...APP_ICON_CHOICES].sort()).toEqual([...BETA_ALTERNATE_APP_ICONS].sort());
    // A fresh install uses the bundled default.
    expect(useAppIconStore.getState().current).toBe('Blueprint');
    await refresh();
    expect(useAppIconStore.getState().current).toBe('Blueprint');

    await setIcon('Classic');
    expect(native.setAppIcon).toHaveBeenLastCalledWith(
      'Classic',
      BETA_ALTERNATE_APP_ICONS,
    );
    expect(useAppIconStore.getState().current).toBe('Classic');

    await setIcon('Blueprint');
    expect(native.setAppIcon).toHaveBeenLastCalledWith(null, BETA_ALTERNATE_APP_ICONS);
    expect(useAppIconStore.getState().current).toBe('Blueprint');
  },
);

test('Android offers only the icons the binary registered', async () => {
  const native = fakeNative(['Sage', 'Ocean']);
  const { APP_ICON_CHOICES, useAppIconStore } = load({ native, appVariant: 'beta' });

  // The bundled default is always offered.
  expect(APP_ICON_CHOICES).toEqual(['Sage', 'Ocean', 'Blueprint']);
  await useAppIconStore.getState().setIcon('Ocean');
  expect(native.setAppIcon).toHaveBeenLastCalledWith('Ocean', ['Sage', 'Ocean']);
});

test('an older Android beta binary keeps the icons it was built with', async () => {
  // Built before the Classic alternate: no registeredIcons.
  const native = fakeNative();
  const { APP_ICON_CHOICES, ALTERNATE_APP_ICONS, useAppIconStore } = load({
    native,
    appVariant: 'beta',
  });

  expect(APP_ICON_CHOICES).toEqual(ALTERNATE_APP_ICONS);
  await useAppIconStore.getState().setIcon('Plum');
  expect(native.setAppIcon).toHaveBeenLastCalledWith('Plum', ALTERNATE_APP_ICONS);
});

test.each(['Blueprint', 'Retired'])(
  'beta reads the %s icon as Blueprint',
  async (name) => {
    const native = fakeNative();
    native.getAppIconName.mockResolvedValue(name);
    const { useAppIconStore } = load({ native, appVariant: 'beta' });

    await useAppIconStore.getState().refresh();
    expect(useAppIconStore.getState().current).toBe('Blueprint');
  },
);

test('a rejected change keeps the current icon', async () => {
  const native = fakeNative();
  native.setAppIcon.mockRejectedValueOnce(new Error('No such icon'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { useAppIconStore } = load({ native });

  await useAppIconStore.getState().setIcon('Rose');
  expect(useAppIconStore.getState().current).toBe('Classic');
  expect(useAppIconStore.getState().isChanging).toBe(false);
  warn.mockRestore();
});

test('without the native module nothing changes', async () => {
  const { useAppIconStore, supportsAlternateIcons } = load({ native: null });

  expect(supportsAlternateIcons).toBe(false);
  await useAppIconStore.getState().setIcon('Sage');
  expect(useAppIconStore.getState().current).toBe('Classic');
});
