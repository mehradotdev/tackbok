import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { resolveCloudSyncRolloutPolicy } from '../../src/lib/cloudSync/runtime/rolloutPolicy';
import { assertDriveV2ReportIsRedacted } from '../../src/lib/cloudSync/v2/drive/instrumentation';
import { auditProductionDependencies } from './dependency-audit';
import { assertV7DeviceEvidenceReport } from './device-evidence';
import { buildPresentlyFixtureCsv } from './generate-journal-fixture';

const mobileRoot = resolve(import.meta.dir, '../..');

describe('Phase V7-5(a) host-preparation gate', () => {
  test('X3 uses Apple full-sync primitives for SQLite and base-shadow files', () => {
    const swift = readFileSync(join(
      mobileRoot,
      'src/inlineModules/AtomicFileModule.swift',
    ), 'utf8');
    const database = readFileSync(join(mobileRoot, 'src/db/index.ts'), 'utf8');
    expect(swift).toContain('Darwin.fcntl(handle.fileDescriptor, F_FULLFSYNC)');
    expect(swift).toContain('Darwin.fsync(descriptor)');
    expect(database).toContain("Platform.OS === 'ios'");
    expect(database).toContain('PRAGMA synchronous = FULL');
    expect(database).toContain('PRAGMA fullfsync = ON');
    expect(database).toContain('PRAGMA checkpoint_fullfsync = ON');
  });

  test('rollout modes are protocol-selective and invalid configuration fails closed', () => {
    expect(resolveCloudSyncRolloutPolicy('all').allows(1)).toBe(true);
    expect(resolveCloudSyncRolloutPolicy('all').allows(2)).toBe(true);
    expect(resolveCloudSyncRolloutPolicy('v1-only').allows(2)).toBe(false);
    expect(resolveCloudSyncRolloutPolicy('v2-only').allows(1)).toBe(false);
    expect(resolveCloudSyncRolloutPolicy('off').allows(1)).toBe(false);
    expect(resolveCloudSyncRolloutPolicy('off').allows(2)).toBe(false);
    expect(resolveCloudSyncRolloutPolicy('misspelled')).toMatchObject({
      mode: 'off',
      configuredValueValid: false,
    });
  });

  test('production checks the switch before constructing providers or starting consent', () => {
    const runtime = readFileSync(join(
      mobileRoot,
      'src/lib/cloudSync/runtime/production.ts',
    ), 'utf8');
    const ui = readFileSync(join(mobileRoot, 'src/lib/cloudSync/ui/production.ts'), 'utf8');
    const background = readFileSync(join(
      mobileRoot,
      'src/lib/cloudSync/runtime/backgroundTask.ts',
    ), 'utf8');
    expect(runtime.indexOf('isCloudSyncNetworkAllowed(protocolVersion)'))
      .toBeLessThan(runtime.indexOf('new GoogleDriveProvider'));
    const prepare = ui.slice(ui.indexOf('export async function prepareGoogleDriveConnection'));
    expect(prepare.indexOf('assertCloudSyncNetworkAllowed(2)'))
      .toBeLessThan(prepare.indexOf('auth.authorize()'));
    const reconnect = ui.slice(ui.indexOf('export async function reconnectGoogleDrive'));
    expect(reconnect.indexOf('assertCloudSyncNetworkAllowed'))
      .toBeLessThan(reconnect.indexOf('auth.authorize()'));
    const revoke = ui.slice(ui.indexOf('export async function revokeCloudVault'));
    expect(revoke.indexOf('assertCloudSyncNetworkAllowed'))
      .toBeLessThan(revoke.indexOf('publishRevocation'));
    expect(background).toContain("getCloudSyncRolloutPolicy().mode === 'off'");

    const policy = readFileSync(join(
      mobileRoot,
      'src/lib/cloudSync/runtime/rolloutPolicy.ts',
    ), 'utf8');
    expect(policy).not.toMatch(/\b(?:fetch|delete|update|insert)\s*\(|SecureStore/);
  });

  test('the current dependency audit records v1 reachability and excludes dev probes', () => {
    const audit = auditProductionDependencies(mobileRoot);
    expect(audit.productionRootCount).toBeGreaterThan(0);
    expect(audit.reachableV1FileCount).toBeGreaterThan(0);
    expect(audit.reachableV1Files).toContain('src/lib/cloudSync/engine/sqliteEngine.ts');
    expect(audit.reachableV1Files).toContain('src/lib/cloudSync/providers/googleDrive.ts');
    expect(audit.reachableV1Files.some((path) => path.includes('/phase0/'))).toBe(false);
    expect(audit.reachableV1Files.some((path) => path.includes('/phase3/'))).toBe(false);

    const v2Engine = readFileSync(join(
      mobileRoot,
      'src/lib/cloudSync/v2/runtime/productionEngine.ts',
    ), 'utf8');
    const legacyBridge = readFileSync(join(
      mobileRoot,
      'src/lib/cloudSync/storage/engineDomain.ts',
    ), 'utf8');
    expect(v2Engine).toContain("from './mediaHashing'");
    expect(v2Engine).not.toContain("from '../../storage/engineDomain'");
    expect(legacyBridge).toContain(
      "export { hashPendingProductionMedia } from '../v2/runtime/mediaHashing'",
    );
  });

  test('device templates are complete, bounded, and redacted before owner execution', () => {
    for (const template of [
      'android-device-evidence',
      'ios-device-evidence',
      'android-emulator-evidence',
    ]) {
      const value: unknown = JSON.parse(readFileSync(join(
        mobileRoot,
        `docs/cloud-sync/v7-phase5/templates/${template}.example.json`,
      ), 'utf8'));
      expect(() => assertV7DeviceEvidenceReport(value)).not.toThrow();
      expect(() => assertV7DeviceEvidenceReport(value, { final: true })).toThrow(
        /still a template/,
      );
    }
    const leaked = JSON.parse(readFileSync(join(
      mobileRoot,
      'docs/cloud-sync/v7-phase5/templates/android-device-evidence.example.json',
    ), 'utf8'));
    leaked.token = 'ya29.synthetic-secret';
    expect(() => assertV7DeviceEvidenceReport(leaked)).toThrow();

    const emulator = JSON.parse(readFileSync(join(
      mobileRoot,
      'docs/cloud-sync/v7-phase5/templates/android-emulator-evidence.example.json',
    ), 'utf8'));
    emulator.evidenceState = 'captured';
    emulator.capturedAt = '2026-08-15T12:00:00+05:30';
    emulator.appVersion = '0.6.0';
    emulator.buildNumber = 'debug';
    emulator.buildArtifactSha256 = 'a'.repeat(64);
    emulator.scenarios = emulator.scenarios.map((scenario: { status: string }) => ({
      ...scenario,
      status: 'blocked',
    }));
    expect(() => assertV7DeviceEvidenceReport(emulator, { final: true })).not.toThrow();
    emulator.physicalDevice = true;
    expect(() => assertV7DeviceEvidenceReport(emulator, { final: true })).toThrow(
      /cannot attest a physical device/,
    );
  });

  test('the large-journal device fixture is deterministic and synthetic', () => {
    const csv = buildPresentlyFixtureCsv(10_000);
    const lines = csv.trimEnd().split('\n');
    expect(lines).toHaveLength(10_001);
    expect(lines[0]).toBe('entryDate,entryContent');
    expect(lines[1]).toBe('1980-01-01,"Synthetic V7-5 journal entry 00001"');
    expect(lines.at(-1)).toMatch(/,"Synthetic V7-5 journal entry 10000"$/);
  });

  test('the 200 MiB seed leaves hashing to production and imports no v6 harness', () => {
    const probe = readFileSync(join(
      mobileRoot,
      'src/lib/cloudSync/v2/deviceHardeningProbe.ts',
    ), 'utf8');
    const config = readFileSync(join(mobileRoot, 'app.config.ts'), 'utf8');
    const screen = readFileSync(join(
      mobileRoot,
      'src/screens/devV7CloudProbes/index.tsx',
    ), 'utf8');
    expect(probe).not.toMatch(/(?:phase0|phase3)\//);
    expect(probe).toContain('set({ blob_hash: null, byte_size: null })');
    expect(probe).toContain('asset.blob_hash === EXPECTED_SHA256');
    expect(probe).toContain('asset.byte_size === EXPECTED_BYTE_COUNT');
    expect(probe).toContain('await copyAsync({ from: source.uri, to: destination.uri })');
    expect(screen).toContain('copyToCacheDirectory: false');
    expect(config).toContain(
      "IS_BETA && process.env.TACKBOK_V7_DEVICE_PROBES === '1'",
    );
  });

  test('the committed host report passes the redaction guard', () => {
    const evidence: unknown = JSON.parse(readFileSync(join(
      mobileRoot,
      'docs/cloud-sync/v7-phase5/evidence/2026-08-18-host-tests.json',
    ), 'utf8'));
    expect(() => assertDriveV2ReportIsRedacted(evidence)).not.toThrow();
    const emulatorEvidence: unknown = JSON.parse(readFileSync(join(
      mobileRoot,
      'docs/cloud-sync/v7-phase5/evidence/2026-08-15-android-emulator.json',
    ), 'utf8'));
    expect(() => assertV7DeviceEvidenceReport(
      emulatorEvidence,
      { final: true },
    )).not.toThrow();
  });
});
