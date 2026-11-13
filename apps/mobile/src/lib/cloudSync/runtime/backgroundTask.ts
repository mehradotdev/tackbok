import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const CLOUD_SYNC_BACKGROUND_TASK = 'tackbok-cloud-sync-v1';

/**
 * How long a periodic pass may run before it is cancelled. Android stops
 * WorkManager work after at most 10 minutes; iOS gives a processing task a few
 * minutes, with no guarantee. This is best effort: if iOS expires the task
 * sooner, the app is suspended mid-pass, which the next pass resumes from.
 * shortcut: expo-background-task 58.0.12 never delivers the iOS expiration event
 * to JS (its module drops the notification for lacking a "url"), and Android has
 * no such event, so this budget is the deadline that fires; revisit once the
 * library delivers expiration, keeping a budget as the fallback.
 */
export const PERIODIC_PASS_BUDGET_MS = 4 * 60_000;

/**
 * Runs `pass` with a signal that aborts when the OS expires the background task
 * or the budget runs out. Resolves only after the pass, even a cancelled one,
 * settled, so the task reports completion once local state is consistent.
 */
export async function runCloudSyncBackgroundTask(
  pass: (signal: AbortSignal) => Promise<boolean>,
  {
    budgetMs = PERIODIC_PASS_BUDGET_MS,
    addExpirationListener = BackgroundTask.addExpirationListener,
  }: {
    budgetMs?: number;
    addExpirationListener?: (listener: () => void) => { remove(): void };
  } = {},
): Promise<BackgroundTask.BackgroundTaskResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let expiration: { remove(): void } | null = null;
  try {
    expiration = addExpirationListener(abort);
  } catch {
    // No expiration event on this platform or binary; the budget still applies.
  }
  const timer = setTimeout(abort, budgetMs);
  try {
    return (await pass(controller.signal))
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    clearTimeout(timer);
    expiration?.remove();
  }
}

if (!TaskManager.isTaskDefined(CLOUD_SYNC_BACKGROUND_TASK)) {
  TaskManager.defineTask(CLOUD_SYNC_BACKGROUND_TASK, async () => {
    // The deadline also covers loading the sync code.
    return runCloudSyncBackgroundTask(async (signal) => {
      const { runProductionBackgroundPass } = await import('./production');
      return runProductionBackgroundPass(signal);
    });
  });
}

export async function setCloudSyncBackgroundTaskEnabled(enabled: boolean): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(CLOUD_SYNC_BACKGROUND_TASK);
  if (!enabled) {
    if (registered) await BackgroundTask.unregisterTaskAsync(CLOUD_SYNC_BACKGROUND_TASK);
    return;
  }
  if (!registered) {
    await BackgroundTask.registerTaskAsync(CLOUD_SYNC_BACKGROUND_TASK, {
      minimumInterval: 15,
    });
  }
}
