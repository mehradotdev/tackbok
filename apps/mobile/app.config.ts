import type { ExpoConfig } from 'expo/config';

const IS_BETA = process.env.APP_VARIANT === 'beta';
const ENABLE_V7_DEVICE_PROBES = IS_BETA && process.env.TACKBOK_V7_DEVICE_PROBES === '1';
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

const config: ExpoConfig = {
  name: IS_BETA ? 'Tackbok (Beta)' : 'Tackbok',
  slug: 'tackbok',
  scheme: IS_BETA ? 'tackbok-beta' : 'tackbok',
  userInterfaceStyle: 'automatic',
  orientation: 'default',
  backgroundColor: '#E4D7B0',
  icon: './assets/icons/ios-light.png',
  owner: 'mehradotdev',
  android: {
    package: IS_BETA ? 'dev.mehra.tackbok.beta' : 'dev.mehra.tackbok',
    adaptiveIcon: {
      foregroundImage: './assets/icons/adaptive-icon.png',
      monochromeImage: './assets/icons/adaptive-icon.png',
      backgroundColor: '#E4D7B0',
    },
  },
  ios: {
    bundleIdentifier: IS_BETA ? 'dev.mehra.tackbok.beta' : 'dev.mehra.tackbok',
    supportsTablet: true,
    icon: {
      dark: './assets/icons/ios-dark.png',
      light: './assets/icons/ios-light.png',
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
        photosPermission:
          'Tackbok needs access to your photos to attach them to your gratitude entries.',
        cameraPermission:
          'Tackbok needs access to your camera to take photos for your gratitude entries.',
      },
    ],
    [
      'react-native-audio-api',
      {
        iosMicrophonePermission:
          'Tackbok needs access to your microphone to record voice memos for your gratitude entries.',
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
    'expo-sharing',
    'expo-status-bar',
    'expo-localization',
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
        faceIDPermission: 'Allow Tackbok to use Face ID to protect your journal.',
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
    router: {},
    cloudSync: {
      google: GOOGLE_OAUTH,
      // Only the dedicated internal evidence profile enables the synthetic
      // V7-5 hardware harness. Store builds leave it false.
      deviceProbesEnabled: ENABLE_V7_DEVICE_PROBES,
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
