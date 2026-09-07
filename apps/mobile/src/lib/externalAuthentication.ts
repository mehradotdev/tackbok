import { AppState } from 'react-native';
import { create } from 'zustand';
import { AppLockSession } from './appLockSession';

export const appLockSession = new AppLockSession();
export const useExternalAuthentication = create<{ active: boolean }>(() => ({ active: false }));

export function refreshExternalAuthentication(): void {
  useExternalAuthentication.setState({ active: appLockSession.externalAuthenticationActive });
}

/** Covers the native chooser/browser through token persistence, including cancellation. */
export async function withExternalAuthentication<T>(operation: () => Promise<T>): Promise<T> {
  appLockSession.beginExternalAuthentication();
  refreshExternalAuthentication();
  try { return await operation(); }
  finally {
    // Native results can arrive before the foreground AppState event. Keep the
    // exception until that return so a zero-second lock cannot race the result.
    appLockSession.endExternalAuthentication(AppState.currentState === 'active');
    refreshExternalAuthentication();
  }
}
