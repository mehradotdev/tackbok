import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { Linking, Platform } from 'react-native';

import fixture from '../../../../docs/cloud-sync/v7-phase0/fixtures/canonical-v2.json';
import { canonicalHashV2, canonicalizeV2 } from './canonical';

export const V7_CANONICAL_LOG_TAG = 'V7_CANONICAL_RESULT';
export const V7_CANONICAL_REPORT_FILENAME = 'v7-canonical-report.json';

export interface V7CanonicalDeviceReport {
  format: 'tackbok-v7-canonical-device-report';
  formatVersion: 2;
  executedAt: string;
  scope: 'physical device' | 'Android emulator' | 'iOS simulator';
  platform: 'android' | 'ios';
  runtimeVersion: string;
  appVersion: string;
  buildType: 'debug' | 'release';
  engine: 'Hermes' | 'non-Hermes';
  acceptedVectors: number;
  rejectedVectors: number;
  passed: boolean;
  containsUserData: false;
  containsCredentialsOrAccountIdentifiers: false;
}

const FORBIDDEN_REPORT_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'Google access token', pattern: /ya29\.[\w-]{5,}/ },
  { name: 'refresh token', pattern: /1\/\/[0-9A-Za-z_-]{10,}/ },
  { name: 'authorization header', pattern: /Bearer\s+\S/i },
  { name: 'Drive session URI', pattern: /upload_id=/i },
  { name: 'token field', pattern: /"(access|refresh|id)Token"/i },
  { name: 'account email', pattern: /[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9-]{2,}\.[A-Za-z]{2,}/ },
  { name: 'fixture body', pattern: /"(?:value|canonical|text)"\s*:/ },
];

export function assertV7CanonicalReportIsRedacted(serialized: string): void {
  if (serialized.length > 16_384) throw new Error('V7 canonical report exceeds its evidence size cap');
  for (const forbidden of FORBIDDEN_REPORT_PATTERNS) {
    if (forbidden.pattern.test(serialized)) {
      throw new Error(`V7 canonical report contains forbidden ${forbidden.name}`);
    }
  }
}

function rejectedValue(kind: string, value?: number): unknown {
  if (kind === 'number') return value;
  if (kind === 'negative-zero') return -0;
  if (kind === 'unsafe-integer') return Number.MAX_SAFE_INTEGER + 1;
  if (kind === 'nan') return Number.NaN;
  if (kind === 'infinity') return Number.POSITIVE_INFINITY;
  if (kind === 'undefined') return undefined;
  if (kind === 'bigint') return BigInt(1);
  if (kind === 'unpaired-high-surrogate') return '\ud800';
  if (kind === 'unpaired-low-surrogate') return '\udc00';
  if (kind === 'cycle') {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    return cycle;
  }
  throw new Error(`Unknown rejection fixture: ${kind}`);
}

function platformName(): 'android' | 'ios' {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('The V7 canonical device probe only supports Android and iOS');
  }
  return Platform.OS;
}

export function buildV7CanonicalDeviceReport(now = new Date()): V7CanonicalDeviceReport {
  let passed = true;
  for (const vector of fixture.vectors) {
    const canonical = canonicalizeV2(vector.value);
    passed = passed && canonical === vector.canonical && canonicalHashV2(vector.value) === vector.sha256;
  }
  for (const vector of fixture.reject) {
    try {
      canonicalizeV2(rejectedValue(vector.kind, vector.value));
      passed = false;
    } catch {
      // Required rejection.
    }
  }
  const platform = platformName();
  const engine = (globalThis as typeof globalThis & { HermesInternal?: unknown }).HermesInternal
    ? 'Hermes' : 'non-Hermes';
  return {
    format: 'tackbok-v7-canonical-device-report',
    formatVersion: 2,
    executedAt: now.toISOString(),
    scope: Device.isDevice ? 'physical device' : platform === 'android' ? 'Android emulator' : 'iOS simulator',
    platform,
    runtimeVersion: `${platform} ${String(Platform.Version)}`,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildType: __DEV__ ? 'debug' : 'release',
    engine,
    acceptedVectors: fixture.vectors.length,
    rejectedVectors: fixture.reject.length,
    passed,
    containsUserData: false,
    containsCredentialsOrAccountIdentifiers: false,
  };
}

/** Writes and logs only after the complete envelope passes redaction checks. */
let recentReport: V7CanonicalDeviceReport | null = null;
let recentReportAt = 0;

export function runV7CanonicalDeviceProbe(): V7CanonicalDeviceReport {
  if (!__DEV__) throw new Error('The V7 canonical device probe is development-only');
  const now = Date.now();
  if (recentReport && now - recentReportAt < 1000) return recentReport;
  const report = buildV7CanonicalDeviceReport();
  const serialized = JSON.stringify(report, null, 2);
  assertV7CanonicalReportIsRedacted(serialized);
  const reportFile = new File(Paths.document, V7_CANONICAL_REPORT_FILENAME);
  if (reportFile.exists) reportFile.delete();
  reportFile.create();
  reportFile.write(serialized);
  console.log(`${V7_CANONICAL_LOG_TAG} ${JSON.stringify(report)}`);
  recentReport = report;
  recentReportAt = now;
  return report;
}

let deepLinkListenerInstalled = false;

/** Installs one development-only listener before the normal app bootstrap gate. */
export function installV7CanonicalProbeDeepLinkListener(): void {
  if (!__DEV__ || deepLinkListenerInstalled) return;
  deepLinkListenerInstalled = true;
  const runForUrl = (url: string | null) => {
    if (url?.includes('dev-diagnostics') && url.includes('suite=v7-canonical')) {
      runV7CanonicalDeviceProbe();
    }
  };
  void Linking.getInitialURL().then(runForUrl);
  Linking.addEventListener('url', ({ url }) => runForUrl(url));
}
