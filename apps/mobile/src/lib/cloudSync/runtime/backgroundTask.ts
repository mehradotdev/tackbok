import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getCloudSyncRolloutPolicy } from './rolloutPolicy';

export const CLOUD_SYNC_BACKGROUND_TASK = 'tackbok-cloud-sync-v1';

if (!TaskManager.isTaskDefined(CLOUD_SYNC_BACKGROUND_TASK)) {
  TaskManager.defineTask(CLOUD_SYNC_BACKGROUND_TASK, async () => {
    try {
      const { runProductionBackgroundPass } = await import('./production');
      return (await runProductionBackgroundPass())
        ? BackgroundTask.BackgroundTaskResult.Success
        : BackgroundTask.BackgroundTaskResult.Failed;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function setCloudSyncBackgroundTaskEnabled(enabled: boolean): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(CLOUD_SYNC_BACKGROUND_TASK);
  // `off` is the emergency kill switch. Protocol-selective modes are checked
  // after loading the configured vault in createProductionRuntimeEngine.
  if (!enabled || getCloudSyncRolloutPolicy().mode === 'off') {
    if (registered) await BackgroundTask.unregisterTaskAsync(CLOUD_SYNC_BACKGROUND_TASK);
    return;
  }
  if (!registered) {
    await BackgroundTask.registerTaskAsync(CLOUD_SYNC_BACKGROUND_TASK, { minimumInterval: 15 });
  }
}
