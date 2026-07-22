import { create } from 'zustand';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * App lock — gates the UI behind the stock OS authentication prompt when
 * `biometricUnlockEnabled` is on. Biometrics (Face ID / Touch ID / Android
 * BiometricPrompt) when enrolled, otherwise the device credential (PIN,
 * pattern, or passcode) — so users who deliberately don't enroll biometrics
 * can still lock the app. There is no custom in-app PIN; the OS owns the
 * entire unlock UX, including attempt lockouts and credential escalation.
 *
 * This is a UI gate, not encryption — the SQLite file on disk is
 * unaffected.
 */

export interface AuthPrompt {
  /** Localized title shown on the OS auth sheet. */
  promptMessage: string;
  /** Localized cancel button label (Android). */
  cancelLabel: string;
}

interface AppLockState {
  /**
   * `null` until the first lock/unlock decision after settings hydration.
   * The gate treats `null` as locked whenever the setting is on, so journal
   * content is never painted before the first unlock on cold start.
   */
  isLocked: boolean | null;
  /**
   * True while the OS auth sheet is up. The sheet itself can push the app
   * to `background` (Android passcode fallback opens a separate activity),
   * which must not re-trigger the lock.
   */
  isAuthenticating: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useAppLockStore = create<AppLockState>()((set) => ({
  isLocked: null,
  isAuthenticating: false,
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),
}));

/**
 * Device has any secure unlock method set up — biometrics, or a PIN /
 * pattern / passcode (`SecurityLevel.SECRET`). Either is enough:
 * `authenticateAsync` falls back to the device credential when no
 * biometric is enrolled.
 */
export async function canUseDeviceAuth(): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

/**
 * Shows the OS authentication prompt (biometric or device credential).
 * Resolves false on cancel/failure and never throws. Ignores the call
 * (returns false) if a prompt is already up.
 */
export async function authenticate(prompt: AuthPrompt): Promise<boolean> {
  if (useAppLockStore.getState().isAuthenticating) {
    return false;
  }
  useAppLockStore.setState({ isAuthenticating: true });
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt.promptMessage,
      cancelLabel: prompt.cancelLabel,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch (error) {
    console.warn('Biometric authentication failed:', error);
    return false;
  } finally {
    useAppLockStore.setState({ isAuthenticating: false });
  }
}

/** Runs the OS prompt and clears the lock on success. */
export async function attemptUnlock(prompt: AuthPrompt): Promise<boolean> {
  const success = await authenticate(prompt);
  if (success) {
    useAppLockStore.getState().unlock();
  }
  return success;
}
