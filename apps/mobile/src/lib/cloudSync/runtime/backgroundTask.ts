import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

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

export async function registerCloudSyncBackgroundTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(CLOUD_SYNC_BACKGROUND_TASK)) return;
  await BackgroundTask.registerTaskAsync(CLOUD_SYNC_BACKGROUND_TASK, {
    minimumInterval: 15,
  });
}
