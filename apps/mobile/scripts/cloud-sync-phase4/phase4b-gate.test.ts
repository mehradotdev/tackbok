import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mobileRoot = resolve(import.meta.dir, '../..');
const app = (path: string) => Bun.file(resolve(mobileRoot, path)).text();

describe('Phase 4b UI, privacy, translation, and accessibility gate', () => {
  test('N4 stays synchronized across the typed catalog, privacy screen, and policy', async () => {
    const [events, privacy, policy] = await Promise.all([
      app('src/lib/analytics/events.ts'),
      app('src/screens/onboarding/PrivacyScreen.tsx'),
      Bun.file(resolve(mobileRoot, '../website/src/pages/privacy.astro')).text(),
    ]);
    const names = [
      'cloud_sync_connected',
      'cloud_sync_started',
      'cloud_sync_succeeded',
      'cloud_sync_failed',
      'cloud_sync_conflict_recovered',
      'cloud_sync_repair_result',
    ];
    for (const name of names) {
      expect(events).toContain(`'${name}'`);
    }
    expect(privacy).toContain('...CLOUD_SYNC_ANALYTICS_EVENT_NAMES');
    // The public policy describes the cloud-backup events in plain language and
    // deliberately does not name them. An enumerated list on the website is
    // written for a different audience and drifts silently when the catalog
    // changes; the in-app screen renders the exact names from the catalog, so
    // that surface stays authoritative and self-updating.
    expect(policy).not.toMatch(/cloud_sync_/);
    expect(policy).toContain('optional cloud backup');
    expect(policy).toContain('not provide end-to-end encryption');
  });

  test('the mock frequency model is removed through a compatibility migration', async () => {
    const [store, section] = await Promise.all([
      app('src/lib/settings/store.ts'),
      app('src/screens/settings/sections/BackupRestoreSection.tsx'),
    ]);
    expect(store).not.toContain('googleDriveBackupEnabled: boolean');
    expect(store).not.toContain("backupFrequency: 'daily'");
    expect(store).toContain('googleDriveBackupEnabled: _legacyEnabled');
    expect(store).toContain('cloudSyncWifiOnlyMedia');
    expect(section).not.toContain('SettingsBackupFrequencyModal');
    expect(existsSync(resolve(
      mobileRoot,
      'src/screens/settings/SettingsBackupFrequencyModal.tsx',
    ))).toBe(false);
  });

  test('one shared setup flow serves settings and onboarding', async () => {
    const [route, onboarding, screen] = await Promise.all([
      app('src/app/cloud-backup.tsx'),
      app('src/screens/onboarding/WelcomeScreen.tsx'),
      app('src/screens/cloudBackup/index.tsx'),
    ]);
    expect(route).toContain('CloudBackupScreen');
    expect(onboarding.indexOf("source: 'google-drive'")).toBeLessThan(
      onboarding.indexOf("source: 'tackbok'"),
    );
    expect(onboarding).toContain('/cloud-backup?origin=onboarding');
    expect(screen).toContain("origin === 'onboarding'");
    expect(screen).toContain('Cloud data is protected in transit');
    expect(screen).toContain('No Tackbok backup found in this Google account');
  });

  test('destructive actions are distinct and Disconnect remains local-only', async () => {
    const [control, screen] = await Promise.all([
      app('src/lib/cloudSync/ui/production.ts'),
      app('src/screens/cloudBackup/index.tsx'),
    ]);
    expect(control).toContain('createGoogleAuthorization().signOut()');
    expect(screen).toContain("revokeCloudVault('backup-deleted')");
    expect(control).toContain("revokeCloudVault('journal-deleted')");
    expect(control).toContain('resetThisDeviceOnly');
    expect(control).not.toMatch(/googleapis\.com\/revoke|oauth2\/revoke/);
  });

  test('cloud surfaces expose accessible names, progress announcements, and non-colour status', async () => {
    const [screen, header] = await Promise.all([
      app('src/screens/cloudBackup/index.tsx'),
      app('src/screens/home/Header.tsx'),
    ]);
    expect(screen).toContain('accessibilityLiveRegion="polite"');
    expect(screen).toContain('AccessibilityInfo.announceForAccessibility');
    expect(screen).toContain('accessibilityRole="alert"');
    expect(screen).toContain('accessibilityLabel=');
    expect(header).toContain('accessibilityLabel=');
    expect(header).toContain('AlertTriangle');
    expect(header).toContain('CloudOff');
    expect(screen).not.toContain('SafeAreaView');
  });

  test('cloud UI/runtime never requests notification permission', async () => {
    const sources = await Promise.all([
      app('src/screens/cloudBackup/index.tsx'),
      app('src/lib/cloudSync/ui/production.ts'),
      app('src/lib/cloudSync/runtime/production.ts'),
      app('src/lib/cloudSync/runtime/SyncRuntime.ts'),
    ]);
    for (const source of sources) {
      expect(source).not.toContain('expo-notifications');
      expect(source).not.toMatch(/request.*Notification.*Permission/i);
    }
  });
});
