import { Platform } from 'react-native';
import { requireOptionalNativeModule, type NativeModule } from 'expo';
import type { RuntimeBackgroundExecution } from './SyncRuntime';

declare class BackgroundExecutionNativeModule extends NativeModule<{
  onExpire(event: { id: number }): void;
}> {
  begin(name: string): Promise<{ id: number; remainingSeconds?: number }>;
  end(id: number): Promise<void>;
}

// iOS only. Optional so binaries built before the module existed keep working after an OTA.
const BackgroundExecutionModule =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<BackgroundExecutionNativeModule>(
        'BackgroundExecutionModule',
      )
    : null;

/**
 * Asks iOS to keep running after the app goes to background. Resolves to null
 * where the platform grants no such time (Android, or an older iOS binary).
 */
export async function beginBackgroundExecution(
  onExpire: () => void,
): Promise<RuntimeBackgroundExecution | null> {
  if (!BackgroundExecutionModule) return null;
  let id: number | null = null;
  const subscription = BackgroundExecutionModule.addListener('onExpire', (event) => {
    if (event.id !== id) return;
    subscription.remove();
    onExpire();
  });
  try {
    const task = await BackgroundExecutionModule.begin('tackbok-cloud-sync');
    id = task.id;
    return {
      remainingMs:
        task.remainingSeconds === undefined ? null : task.remainingSeconds * 1000,
      end() {
        subscription.remove();
        void BackgroundExecutionModule.end(task.id).catch(() => undefined);
      },
    };
  } catch (error) {
    subscription.remove();
    throw error;
  }
}
