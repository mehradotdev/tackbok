import * as Updates from 'expo-updates';

export type AppUpdateCheckResult = 'current' | 'downloaded' | 'unavailable';

export const useAppUpdates = Updates.useUpdates;

/**
 * Checks for and downloads an update without interrupting the current session.
 * A downloaded update is applied on the next cold start unless the user chooses
 * to restart immediately.
 */
export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  if (!Updates.isEnabled) {
    return 'unavailable';
  }

  const checkResult = await Updates.checkForUpdateAsync();
  if (!checkResult.isAvailable && !checkResult.isRollBackToEmbedded) {
    return 'current';
  }

  await Updates.fetchUpdateAsync();
  return 'downloaded';
}

export async function restartToApplyAppUpdate(): Promise<void> {
  await Updates.reloadAsync();
}
