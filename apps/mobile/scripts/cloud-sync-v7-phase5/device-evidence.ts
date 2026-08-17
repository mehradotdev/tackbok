import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { assertDriveV2ReportIsRedacted } from '../../src/lib/cloudSync/v2/drive/instrumentation';

export type DeviceEvidencePlatform = 'android' | 'ios';
export type DeviceEvidenceClass = 'emulator' | 'physical';
export type DeviceEvidenceStatus = 'passed' | 'failed' | 'blocked' | 'not-run';

export const COMMON_SCENARIOS = [
  'release-native-modules',
  'auth-e2e',
  'authorization-revocation-recovery',
  'multi-device-soak',
  'large-journal-restore',
  'large-media-round-trip',
  'large-media-interruption-resume',
  'wifi-only-media',
  'background-locked',
  'network-transition',
  'low-storage',
  'rollback-kill-switch',
] as const;

export const PLATFORM_SCENARIOS = {
  android: ['doze', 'grant-revocation-dead-window'],
  ios: ['low-power-mode'],
} as const;

export interface V7DeviceEvidenceReport {
  format: 'tackbok-v7-device-evidence';
  formatVersion: 1;
  evidenceState: 'template' | 'captured';
  evidenceClass: DeviceEvidenceClass;
  platform: DeviceEvidencePlatform;
  capturedAt: string;
  appVersion: string;
  buildNumber: string;
  buildArtifactSha256: string;
  physicalDevice: boolean;
  releaseSigned: boolean;
  syntheticDataOnly: boolean;
  disposableCredentialOnly: boolean;
  scenarios: Array<{
    id: string;
    status: DeviceEvidenceStatus;
    durationMs: number | null;
    noteCodes: string[];
  }>;
  measurements: {
    restore: {
      entryCount: number;
      compressedBytes: number;
      elapsedMs: number;
      peakMemoryBytes: number;
    };
    media: {
      byteCount: number;
      uploadMs: number;
      downloadMs: number;
      sha256Matched: boolean;
      resumedAfterInterruption: boolean;
      wifiOnlyHeldOnMetered: boolean;
    };
    rollback: {
      queuedBefore: number;
      queuedAfter: number;
      providerObjectsBefore: number;
      providerObjectsAfter: number;
      networkRequestsAfterActivation: number;
    };
    grantRevocationDeadWindowMs: number | null;
  };
}

const SHA256 = /^[0-9a-f]{64}$/;
const NOTE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertFiniteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unexpected shape`);
  }
}

export function assertV7DeviceEvidenceReport(
  value: unknown,
  options: { final?: boolean } = {},
): asserts value is V7DeviceEvidenceReport {
  assertRecord(value, 'report');
  assertExactKeys(value, [
    'format', 'formatVersion', 'evidenceState', 'evidenceClass', 'platform', 'capturedAt', 'appVersion',
    'buildNumber', 'buildArtifactSha256', 'physicalDevice', 'releaseSigned',
    'syntheticDataOnly', 'disposableCredentialOnly', 'scenarios', 'measurements',
  ], 'report');
  if (value.format !== 'tackbok-v7-device-evidence' || value.formatVersion !== 1) {
    throw new Error('Unsupported V7 device-evidence format');
  }
  if (value.platform !== 'android' && value.platform !== 'ios') {
    throw new Error('platform must be android or ios');
  }
  if (value.evidenceClass !== 'emulator' && value.evidenceClass !== 'physical') {
    throw new Error('evidenceClass must be emulator or physical');
  }
  if (value.evidenceState !== 'template' && value.evidenceState !== 'captured') {
    throw new Error('evidenceState must be template or captured');
  }
  for (const key of ['capturedAt', 'appVersion', 'buildNumber', 'buildArtifactSha256'] as const) {
    if (typeof value[key] !== 'string') throw new Error(`${key} must be a string`);
  }
  for (const key of [
    'physicalDevice', 'releaseSigned', 'syntheticDataOnly', 'disposableCredentialOnly',
  ] as const) {
    if (typeof value[key] !== 'boolean') throw new Error(`${key} must be boolean`);
  }
  if (!Array.isArray(value.scenarios)) throw new Error('scenarios must be an array');
  const expectedIds = new Set<string>([
    ...COMMON_SCENARIOS,
    ...PLATFORM_SCENARIOS[value.platform],
  ]);
  const seen = new Set<string>();
  for (const scenario of value.scenarios) {
    assertRecord(scenario, 'scenario');
    assertExactKeys(scenario, ['id', 'status', 'durationMs', 'noteCodes'], 'scenario');
    if (typeof scenario.id !== 'string' || !expectedIds.has(scenario.id) || seen.has(scenario.id)) {
      throw new Error('scenario id is missing, duplicated, or unexpected');
    }
    seen.add(scenario.id);
    if (!['passed', 'failed', 'blocked', 'not-run'].includes(String(scenario.status))) {
      throw new Error(`Invalid status for ${scenario.id}`);
    }
    if (scenario.durationMs !== null) {
      assertFiniteNonNegative(scenario.durationMs, `${scenario.id}.durationMs`);
    }
    if (!Array.isArray(scenario.noteCodes) || scenario.noteCodes.some((code) =>
      typeof code !== 'string' || code.length > 64 || !NOTE_CODE.test(code))) {
      throw new Error(`Invalid noteCodes for ${scenario.id}`);
    }
  }
  if (seen.size !== expectedIds.size) throw new Error('Required scenarios are missing');

  assertRecord(value.measurements, 'measurements');
  assertExactKeys(value.measurements, [
    'restore', 'media', 'rollback', 'grantRevocationDeadWindowMs',
  ], 'measurements');
  const { restore, media, rollback, grantRevocationDeadWindowMs } = value.measurements;
  assertRecord(restore, 'measurements.restore');
  assertExactKeys(restore, [
    'entryCount', 'compressedBytes', 'elapsedMs', 'peakMemoryBytes',
  ], 'measurements.restore');
  for (const [key, metric] of Object.entries(restore)) {
    assertFiniteNonNegative(metric, `measurements.restore.${key}`);
  }
  assertRecord(media, 'measurements.media');
  assertExactKeys(media, [
    'byteCount', 'uploadMs', 'downloadMs', 'sha256Matched',
    'resumedAfterInterruption', 'wifiOnlyHeldOnMetered',
  ], 'measurements.media');
  for (const key of ['byteCount', 'uploadMs', 'downloadMs'] as const) {
    assertFiniteNonNegative(media[key], `measurements.media.${key}`);
  }
  for (const key of [
    'sha256Matched', 'resumedAfterInterruption', 'wifiOnlyHeldOnMetered',
  ] as const) {
    if (typeof media[key] !== 'boolean') throw new Error(`measurements.media.${key} must be boolean`);
  }
  assertRecord(rollback, 'measurements.rollback');
  assertExactKeys(rollback, [
    'queuedBefore', 'queuedAfter', 'providerObjectsBefore', 'providerObjectsAfter',
    'networkRequestsAfterActivation',
  ], 'measurements.rollback');
  for (const [key, metric] of Object.entries(rollback)) {
    assertFiniteNonNegative(metric, `measurements.rollback.${key}`);
  }
  if (grantRevocationDeadWindowMs !== null) {
    assertFiniteNonNegative(grantRevocationDeadWindowMs, 'grantRevocationDeadWindowMs');
  }

  // Reuse the stricter Drive-v2 structural/pattern scan before any output.
  assertDriveV2ReportIsRedacted(value);
  const report = value as unknown as V7DeviceEvidenceReport;

  if (options.final) {
    if (report.evidenceState !== 'captured') throw new Error('Final evidence is still a template');
    if (!report.syntheticDataOnly || !report.disposableCredentialOnly) {
      throw new Error('Final evidence must attest synthetic/disposable conditions');
    }
    if (report.evidenceClass === 'physical' &&
        (!report.physicalDevice || !report.releaseSigned)) {
      throw new Error('Physical evidence must attest physical and release-signed conditions');
    }
    if (report.evidenceClass === 'emulator' && report.physicalDevice) {
      throw new Error('Emulator evidence cannot attest a physical device');
    }
    if (!SHA256.test(report.buildArtifactSha256)) {
      throw new Error('Final evidence needs the release artifact SHA-256');
    }
    if (Number.isNaN(Date.parse(report.capturedAt))) throw new Error('capturedAt is invalid');
    if (report.scenarios.some((scenario) => scenario.status === 'not-run')) {
      throw new Error('Final evidence still contains a not-run scenario');
    }
  }
}

export function writeFinalV7DeviceEvidence(value: unknown, outputPath: string): void {
  assertV7DeviceEvidenceReport(value, { final: true });
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  // Re-scan the exact bytes being written, not only the parsed object.
  assertDriveV2ReportIsRedacted(JSON.parse(serialized));
  const absolute = resolve(outputPath);
  const temporary = resolve(dirname(absolute), `.${Date.now()}-device-evidence.tmp`);
  writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporary, absolute);
}

if (import.meta.main) {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !['validate-template', 'finalize'].includes(command ?? '')) {
    throw new Error(
      'Usage: device-evidence.ts validate-template <input> | finalize <input> <output>',
    );
  }
  const value: unknown = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
  if (command === 'validate-template') {
    assertV7DeviceEvidenceReport(value);
    console.log('Device-evidence template is structurally valid and redacted.');
  } else {
    if (!outputPath) throw new Error('finalize requires an output path');
    writeFinalV7DeviceEvidence(value, outputPath);
    console.log('Final device evidence was validated, redacted, and written atomically.');
  }
}
