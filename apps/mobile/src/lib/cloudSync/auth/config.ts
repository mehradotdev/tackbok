import Constants from 'expo-constants';

export interface GoogleOAuthConfig {
  androidClientId: string;
  iosClientId: string;
  iosRedirectScheme: string;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const config = Constants.expoConfig?.extra?.cloudSync?.google as
    | Partial<GoogleOAuthConfig>
    | undefined;
  if (!config?.androidClientId || !config.iosClientId || !config.iosRedirectScheme) {
    throw new Error('Google OAuth configuration is missing for this app variant');
  }
  return config as GoogleOAuthConfig;
}
