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
}): AppIconModuleExports & {
  React: typeof import('react');
  TestRenderer: typeof import('react-test-renderer');
} {
  let loaded:
    | (AppIconModuleExports & {
        React: typeof import('react');
        TestRenderer: typeof import('react-test-renderer');
      })
    | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    jest.doMock('expo', () => ({ requireOptionalNativeModule: () => native }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { appVariant } } },
    }));
    loaded = {
      ...jest.requireActual<AppIconModuleExports>('./index'),
      // Hooks need the React copy the isolated module loaded.
      React: jest.requireActual<typeof import('react')>('react'),
      TestRenderer:
        jest.requireActual<typeof import('react-test-renderer')>('react-test-renderer'),
    };
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

/** A native module from a binary with deferred Android changes and the beta Classic alternate. */
function withHolds(native: NativeModule): NativeModule & {
  setPendingIconHeld: jest.Mock<Promise<void>, [boolean]>;
} {
  return { ...native, setPendingIconHeld: jest.fn(async (_held: boolean) => undefined) };
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
  expect(useAppIconStore.getState().current).toBe('Classic');
  warn.mockRestore();
});

test('without the native module nothing changes', async () => {
  const { useAppIconStore, supportsAlternateIcons } = load({ native: null });

  expect(supportsAlternateIcons).toBe(false);
  await expect(useAppIconStore.getState().setIcon('Sage')).resolves.toBe(false);
});

test('production offers every icon, with Classic as the bundled default', async () => {
  const native = deferringNative(null);
  const { APP_ICON_CHOICES, ALTERNATE_APP_ICONS, useAppIconStore } = load({ native });
  const { refresh, setIcon } = useAppIconStore.getState();

  expect(APP_ICON_CHOICES).toEqual(['Classic', ...ALTERNATE_APP_ICONS]);
  await refresh();
  expect(useAppIconStore.getState().current).toBe('Classic');

  await setIcon('Blueprint');
  expect(native.setAppIcon).toHaveBeenLastCalledWith('Blueprint', ALTERNATE_APP_ICONS);
  await setIcon('Classic');
  expect(native.setAppIcon).toHaveBeenLastCalledWith(null, ALTERNATE_APP_ICONS);
  expect(useAppIconStore.getState().current).toBe('Classic');
});

test('beta offers every icon, with Blueprint as the bundled default', async () => {
  const native = withHolds(deferringNative(null));
  const { APP_ICON_CHOICES, BETA_ALTERNATE_APP_ICONS, useAppIconStore } = load({
    native,
    appVariant: 'beta',
  });
  const { refresh, setIcon } = useAppIconStore.getState();

  expect([...APP_ICON_CHOICES].sort()).toEqual([...BETA_ALTERNATE_APP_ICONS].sort());
  // A fresh install uses the bundled default.
  expect(useAppIconStore.getState().current).toBe('Blueprint');
  await refresh();
  expect(useAppIconStore.getState().current).toBe('Blueprint');

  await setIcon('Classic');
  expect(native.setAppIcon).toHaveBeenLastCalledWith('Classic', BETA_ALTERNATE_APP_ICONS);
  expect(useAppIconStore.getState().current).toBe('Classic');

  await setIcon('Blueprint');
  expect(native.setAppIcon).toHaveBeenLastCalledWith(null, BETA_ALTERNATE_APP_ICONS);
  expect(useAppIconStore.getState().current).toBe('Blueprint');
});

test('beta reads the Blueprint alternate as Blueprint', async () => {
  const native = deferringNative(null);
  native.getAppIconName.mockResolvedValue('Blueprint');
  const { useAppIconStore } = load({ native, appVariant: 'beta' });

  await useAppIconStore.getState().refresh();
  expect(useAppIconStore.getState().current).toBe('Blueprint');
});

test('an older Android beta binary keeps the icons it was built with', async () => {
  // Built before deferred changes and the Classic alternate: no setPendingIconHeld.
  const native = deferringNative(undefined);
  const { APP_ICON_CHOICES, ALTERNATE_APP_ICONS, useAppIconStore } = load({
    native,
    appVariant: 'beta',
  });

  expect(APP_ICON_CHOICES).toEqual(ALTERNATE_APP_ICONS);
  await useAppIconStore.getState().setIcon('Plum');
  expect(native.setAppIcon).toHaveBeenLastCalledWith('Plum', ALTERNATE_APP_ICONS);
});

test('an icon the build does not know reads as the bundled default', async () => {
  const native = deferringNative(null);
  native.getAppIconName.mockResolvedValue('Retired');
  const { useAppIconStore } = load({ native, appVariant: 'beta' });

  await useAppIconStore.getState().refresh();
  expect(useAppIconStore.getState().current).toBe('Blueprint');
});

test('a rejected change keeps the current icon', async () => {
  const native = withHolds(deferringNative(null));
  native.setAppIcon.mockRejectedValueOnce(new Error('No such icon'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { useAppIconStore } = load({ native, appVariant: 'beta' });

  await expect(useAppIconStore.getState().setIcon('Classic')).resolves.toBe(false);
  expect(useAppIconStore.getState().current).toBe('Blueprint');
  warn.mockRestore();
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

test('a failed hold only warns', async () => {
  const native = {
    ...deferringNative('pending'),
    setPendingIconHeld: jest.fn(async (_held: boolean) => {
      throw new Error('gone');
    }),
  };
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { holdAppIconChange } = load({ native });

  holdAppIconChange();
  await Promise.resolve();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test('useHoldAppIconChange holds while true and releases on false and unmount', () => {
  const native = {
    ...deferringNative('pending'),
    setPendingIconHeld: jest.fn(async (_held: boolean) => undefined),
  };
  const { useHoldAppIconChange, React, TestRenderer } = load({ native });
  const { act, create } = TestRenderer;
  function Holder({ held }: { held: boolean }) {
    useHoldAppIconChange(held);
    return null;
  }

  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Holder, { held: false }));
  });
  expect(native.setPendingIconHeld).not.toHaveBeenCalled();
  act(() => renderer.update(React.createElement(Holder, { held: true })));
  act(() => renderer.update(React.createElement(Holder, { held: false })));
  act(() => renderer.update(React.createElement(Holder, { held: true })));
  act(() => renderer.unmount());
  expect(native.setPendingIconHeld.mock.calls).toEqual([
    [true],
    [false],
    [true],
    [false],
  ]);
});
