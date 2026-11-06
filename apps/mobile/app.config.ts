import type { ExpoConfig } from 'expo/config';

import englishLocale from './locales/en.json';

// Shared CommonJS config is also loaded by React Native autolinking.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { androidStore, galaxyBillingMode } = require('./config/android-store');
const { version } = require('./package.json');

const IS_BETA = process.env.APP_VARIANT === 'beta';
// app.config.test.ts keeps native declarations aligned with ALL_SUPPORTED_LOCALES.
const nativeLocales = ['en', 'es', 'ar', 'he', 'de', 'hi', 'sv', 'zh-Hans', 'zh-Hant'];
// Expo uses these keys verbatim as <locale>.lproj folder names.
const locales = Object.fromEntries(
  nativeLocales.map((locale) => {
    const path = `./locales/${locale}.json`;
    if (!IS_BETA) return [locale, path];
    // Localized InfoPlist.strings override the main plist, including the beta name.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const strings: typeof englishLocale = require(path);
    return [locale, { ios: { ...strings.ios, CFBundleDisplayName: 'Tackbok (Beta)' } }];
  }),
);
const GOOGLE_OAUTH = IS_BETA
  ? {
      androidClientId:
        '771958263851-rtbv0o1v10lnpiag8q1lrvbdkrajjbpj.apps.googleusercontent.com',
      iosClientId:
        '771958263851-87ehodu2jreg8t57kgcmnd7fsn7ess8o.apps.googleusercontent.com',
      iosRedirectScheme:
        'com.googleusercontent.apps.771958263851-87ehodu2jreg8t57kgcmnd7fsn7ess8o',
    }
  : {
      androidClientId:
        '771958263851-3oat281bkoaf37a6998t5n5cg2v6fofe.apps.googleusercontent.com',
      iosClientId:
        '771958263851-dvits2qk2kbvinc4un2n172msnotten2.apps.googleusercontent.com',
      iosRedirectScheme:
        'com.googleusercontent.apps.771958263851-dvits2qk2kbvinc4un2n172msnotten2',
    };

// Beta builds get blueprint-styled icons so both installs are distinguishable.
const ICON_SUFFIX = IS_BETA ? '-beta' : '';

const config: ExpoConfig = {
  version,
  name: IS_BETA ? 'Tackbok (Beta)' : 'Tackbok',
  locales,
  slug: 'tackbok',
  scheme: IS_BETA ? 'tackbok-beta' : 'tackbok',
  userInterfaceStyle: 'automatic',
  orientation: 'default',
  backgroundColor: '#E4D7B0',
  icon: `./assets/icons/ios-light${ICON_SUFFIX}.png`,
  owner: 'mehradotdev',
  android: {
    package: IS_BETA ? 'dev.mehra.tackbok.beta' : 'dev.mehra.tackbok',
    // A Galaxy update must never be accepted by a Google binary (or vice versa).
    ...(androidStore === 'samsung'
      ? { runtimeVersion: `${version}-galaxy-${galaxyBillingMode.toLowerCase()}` }
      : {}),
    adaptiveIcon: {
      foregroundImage: `./assets/icons/adaptive-icon${ICON_SUFFIX}.png`,
      monochromeImage: './assets/icons/adaptive-icon.png',
      ...(IS_BETA
        ? { backgroundImage: './assets/icons/adaptive-icon-beta-background.png' }
        : {}),
      backgroundColor: IS_BETA ? '#184E96' : '#E4D7B0',
    },
  },
  ios: {
    bundleIdentifier: IS_BETA ? 'dev.mehra.tackbok.beta' : 'dev.mehra.tackbok',
    supportsTablet: true,
    icon: {
      // The beta blueprint icon uses the same artwork in light and dark mode.
      dark: IS_BETA ? './assets/icons/ios-light-beta.png' : './assets/icons/ios-dark.png',
      light: `./assets/icons/ios-light${ICON_SUFFIX}.png`,
      tinted: './assets/icons/ios-tinted.png',
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleURLTypes: [
        {
          CFBundleURLName: 'Tackbok',
          CFBundleURLSchemes: [IS_BETA ? 'tackbok-beta' : 'tackbok'],
        },
        {
          CFBundleURLName: 'Google OAuth',
          CFBundleURLSchemes: [GOOGLE_OAUTH.iosRedirectScheme],
        },
      ],
    },
  },
  web: {
    output: 'static',
  },
  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          // React Native Skia 3 renders through Dawn/Vulkan and requires API 26.
          minSdkVersion: 26,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    './plugins/withAndroidReleaseOptimization',
    './plugins/withOkHttpVersion',
    'expo-asset',
    'expo-router',
    'expo-background-task',
    'expo-system-ui',
    [
      'expo-splash-screen',
      {
        image: './assets/icons/splash-icon-dark.png',
        imageWidth: 200,
        backgroundColor: '#E4D7B0',
        dark: {
          image: './assets/icons/splash-icon-light.png',
          backgroundColor: '#6A755A',
        },
      },
    ],
    [
      'expo-sqlite',
      {
        enableFTS: true,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: englishLocale.ios.NSPhotoLibraryUsageDescription,
        cameraPermission: englishLocale.ios.NSCameraUsageDescription,
      },
    ],
    [
      'react-native-audio-api',
      {
        iosBackgroundMode: false,
        iosMicrophonePermission: englishLocale.ios.NSMicrophoneUsageDescription,
        androidPermissions: [
          'android.permission.RECORD_AUDIO',
          'android.permission.MODIFY_AUDIO_SETTINGS',
        ],
      },
    ],
    'expo-font',
    'expo-web-browser',
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
      },
    ],
    './plugins/withGoogleAuthorization',
    './plugins/withPurchaseLaunchMode',
    'expo-sharing',
    'expo-status-bar',
    [
      'expo-localization',
      {
        supportedLocales: nativeLocales,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icons/adaptive-icon.png',
        color: '#6A755A',
      },
    ],
    [
      'expo-local-authentication',
      {
        faceIDPermission: englishLocale.ios.NSFaceIDUsageDescription,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    autolinkingModuleResolution: true,
    inlineModules: {
      watchedDirectories: ['src/inlineModules'],
    },
  },
  extra: {
    appVariant: IS_BETA ? 'beta' : 'production',
    androidStore,
    galaxyBillingMode,
    router: {},
    cloudSync: {
      google: GOOGLE_OAUTH,
    },
    eas: {
      projectId: '3cba8280-4616-4cf9-8309-62ce7d14da81',
    },
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/3cba8280-4616-4cf9-8309-62ce7d14da81',
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
};

export default config;
