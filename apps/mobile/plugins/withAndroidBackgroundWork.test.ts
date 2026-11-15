import path from 'node:path';

type Mod = (mod: { modResults: any; modRequest: { projectRoot: string } }) => unknown;

const mockMods: { gradle?: Mod; manifest?: Mod } = {};

jest.mock('expo/config-plugins', () => ({
  withProjectBuildGradle: (config: unknown, mod: Mod) => {
    mockMods.gradle = mod;
    return config;
  },
  withAndroidManifest: (config: unknown, mod: Mod) => {
    mockMods.manifest = mod;
    return config;
  },
  AndroidConfig: {
    Manifest: {
      getMainApplicationOrThrow: (manifest: any) => manifest.manifest.application[0],
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withAndroidBackgroundWork = require('./withAndroidBackgroundWork');

const projectRoot = path.join(__dirname, '..');
withAndroidBackgroundWork({});

test('compiles WorkManager into the expo project, at expo-background-task’s version, once', () => {
  const mod = {
    modResults: { language: 'groovy', contents: 'allprojects {}\n' },
    modRequest: { projectRoot },
  };
  mockMods.gradle!(mod);
  expect(mod.modResults.contents).toMatch(
    /project\.name == 'expo'[\s\S]*androidx\.work:work-runtime-ktx:\d+\.\d+\.\d+/,
  );
  const once = mod.modResults.contents;
  mockMods.gradle!(mod);
  expect(mod.modResults.contents).toBe(once);
});

test('removes WorkManager’s foreground service and FOREGROUND_SERVICE, once', () => {
  const mod = {
    modResults: { manifest: { $: {}, application: [{ $: {} }] } },
    modRequest: { projectRoot },
  };
  mockMods.manifest!(mod);
  mockMods.manifest!(mod);
  const { manifest } = mod.modResults as any;
  expect(manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
  expect(manifest['uses-permission']).toEqual([
    {
      $: {
        'android:name': 'android.permission.FOREGROUND_SERVICE',
        'tools:node': 'remove',
      },
    },
  ]);
  expect(manifest.application[0].service).toEqual([
    {
      $: {
        'android:name': 'androidx.work.impl.foreground.SystemForegroundService',
        'tools:node': 'remove',
      },
    },
  ]);
});
