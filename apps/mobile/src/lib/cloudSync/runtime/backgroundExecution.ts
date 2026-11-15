import { AppRegistry, Platform } from 'react-native';
import { requireOptionalNativeModule, type NativeModule } from 'expo';
import type { RuntimeBackgroundExecution, RuntimeSubscription } from './SyncRuntime';

declare class BackgroundExecutionNativeModule extends NativeModule<{
  onExpire(event: { id: number }): void;
  /** Android: the device is online again after `requestRun`; run a pass. */
  onRun(): void;
}> {
  begin(
    name: string,
  ): Promise<
    { granted: true; id: number; remainingSeconds?: number } | { granted: false }
  >;
  end(id: number): Promise<void>;
  /** Android only. */
  requestRun?(): Promise<void>;
}

/**
 * Android grants a WorkManager job, not a deadline it reports. A background
 * pass gets the same 4-minute budget as the periodic pass (backgroundTask.ts);
 * the job ends earlier if the OS stops it, which reports `onExpire`.
 */
export const ANDROID_BACKGROUND_PASS_BUDGET_MS = 4 * 60_000;

// Optional so binaries built before the module existed keep working after an OTA.
const BackgroundExecutionModule =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? requireOptionalNativeModule<BackgroundExecutionNativeModule>(
        'BackgroundExecutionModule',
      )
    : null;

/**
 * Android pauses JS timers in background unless a headless JS task runs. While
 * a pass runs, the native module starts this task, and it finishes it itself:
 * the task's promise stays pending on purpose.
 */
const ANDROID_TIMER_TASK = 'TackbokBackgroundExecution';
if (Platform.OS === 'android' && BackgroundExecutionModule) {
  AppRegistry.registerHeadlessTask(
    ANDROID_TIMER_TASK,
    () => () => new Promise<void>(() => {}),
  );
}

/**
 * Asks the OS to keep running after the app goes to background: iOS background
 * time, or an Android WorkManager job. Resolves to null where the platform
 * grants no such time (an older binary, or iOS refused).
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
    if (!task.granted) {
      // iOS refused: no time and so no deadline; the pass runs as the OS allows.
      subscription.remove();
      return null;
    }
    id = task.id;
    const remainingMs =
      Platform.OS === 'android'
        ? ANDROID_BACKGROUND_PASS_BUDGET_MS
        : task.remainingSeconds === undefined
          ? null
          : task.remainingSeconds * 1000;
    return {
      remainingMs,
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

/**
 * Android: asks for `onRun` once the device is online, for a backup that could
 * not run when the app went to background offline. Older binaries and iOS
 * ignore it; their periodic background task covers that case.
 */
export function requestBackgroundRun(): void {
  void BackgroundExecutionModule?.requestRun?.().catch(() => undefined);
}

export function addBackgroundRunListener(listener: () => void): RuntimeSubscription {
  if (Platform.OS !== 'android' || !BackgroundExecutionModule) return { remove() {} };
  return BackgroundExecutionModule.addListener('onRun', listener);
}
