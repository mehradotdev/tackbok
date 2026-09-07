import { AppState } from 'react-native';
import { appLockSession, refreshExternalAuthentication, useExternalAuthentication, withExternalAuthentication } from './externalAuthentication';

beforeEach(() => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  appLockSession.transition('active', 0);
  refreshExternalAuthentication();
});

test('a cancelled/failed sign-in always restores ordinary locking', async () => {
  await expect(withExternalAuthentication(async () => {
    expect(useExternalAuthentication.getState().active).toBe(true);
    expect(appLockSession.transition('background', 0)).toBe(false);
    throw new Error('cancelled');
  })).rejects.toThrow('cancelled');
  expect(useExternalAuthentication.getState().active).toBe(false);
  expect(appLockSession.transition('background', 0)).toBe(true);
});

test('an early native result keeps the exception until the foreground callback', async () => {
  await withExternalAuthentication(async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
  });
  expect(useExternalAuthentication.getState().active).toBe(true);
  expect(appLockSession.transition('active', 0)).toBe(false);
  refreshExternalAuthentication();
  expect(useExternalAuthentication.getState().active).toBe(false);
});
