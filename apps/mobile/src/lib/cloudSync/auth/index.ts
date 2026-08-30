import { Platform } from 'react-native';

import { AndroidGoogleAuthorization } from './android';
import { IosGoogleAuthorization } from './ios';

export * from './types';

export function createGoogleAuthorization() {
  if (Platform.OS === 'android') return new AndroidGoogleAuthorization();
  if (Platform.OS === 'ios') return new IosGoogleAuthorization();
  throw new Error('Google Drive authorization requires Android or iOS');
}
