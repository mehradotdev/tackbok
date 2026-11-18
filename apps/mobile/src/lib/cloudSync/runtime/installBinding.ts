import * as SecureStore from 'expo-secure-store';

import { productionApplyFiles } from '../snapshot/storage';
import { ensureInstallBinding, type InstallMarkerStore } from '../storage/installBinding';
import { cloudConnectionLifecycle } from './connectionLifecycle';

const INSTALL_MARKER_KEY = 'tackbok.install-marker.v1';

/**
 * This install's marker (`storage/installBinding.ts`). THIS_DEVICE_ONLY keeps it out
 * of iCloud backups and device transfers; AFTER_FIRST_UNLOCK lets background
 * sync read it on a locked iPhone. Android ignores the option: the
 * expo-secure-store plugin's backup rules leave SecureStore out instead.
 */
const installMarker: InstallMarkerStore = {
  read: () => SecureStore.getItemAsync(INSTALL_MARKER_KEY),
  write: (value) =>
    SecureStore.setItemAsync(INSTALL_MARKER_KEY, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
};

let installBound = false;
let installBinding: Promise<void> | null = null;

/**
 * Binds the local sync identity to this install before the first engine of
 * the process exists, so no pass can publish under a copied device ID. Once it
 * succeeds nothing in the process unbinds it. A failure (the keychain unread-
 * able) leaves no engine; the next engine creation retries. It runs between
 * connection changes. Concurrent callers share one attempt.
 */
export function ensureInstallBoundDeviceId(): Promise<void> {
  if (installBound) return Promise.resolve();
  installBinding ??= (async () => {
    try {
      await cloudConnectionLifecycle.exclusive(() =>
        ensureInstallBinding({
          marker: installMarker,
          files: productionApplyFiles(),
          now: Date.now(),
        }),
      );
      installBound = true;
    } finally {
      installBinding = null;
    }
  })();
  return installBinding;
}
