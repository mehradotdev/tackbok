import * as Crypto from 'expo-crypto';
import fixture from '../fixtures/canonical-v2.json';
import { canonicalizeV2, type CanonicalV2 } from './canonicalV2';

export interface V7CanonicalDeviceReport {
  format: 'tackbok-v7-canonical-device-report';
  formatVersion: 1;
  platform: 'android' | 'ios';
  engine: string;
  acceptedVectors: number;
  rejectedVectors: number;
  passed: boolean;
}

function rejectedValue(kind: string): unknown {
  switch (kind) {
    case 'negative-zero': return -0;
    case 'unsafe-integer': return Number.MAX_SAFE_INTEGER + 1;
    case 'nan': return Number.NaN;
    case 'infinity': return Number.POSITIVE_INFINITY;
    case 'undefined': return undefined;
    case 'bigint': return BigInt(1);
    case 'unpaired-high-surrogate': return '\ud800';
    case 'unpaired-low-surrogate': return '\udc00';
    case 'cycle': {
      const value: unknown[] = [];
      value.push(value);
      return value;
    }
    default: throw new Error(`Unknown fixture rejection kind: ${kind}`);
  }
}

/**
 * Dev/evidence helper only. It is intentionally not wired into a route or any
 * production path by V7-0.
 */
export async function runV7CanonicalDeviceProbe(
  platform: 'android' | 'ios',
): Promise<V7CanonicalDeviceReport> {
  const engine = (globalThis as typeof globalThis & { HermesInternal?: unknown }).HermesInternal
    ? 'Hermes'
    : 'non-Hermes';
  let passed = true;
  for (const vector of fixture.vectors) {
    const canonical = canonicalizeV2(vector.value as CanonicalV2);
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      canonical,
    );
    passed = passed && canonical === vector.canonical && hash === vector.sha256;
  }
  for (const vector of fixture.reject) {
    const value = vector.kind === 'number' ? vector.value : rejectedValue(vector.kind);
    try {
      canonicalizeV2(value as CanonicalV2);
      passed = false;
    } catch {
      // Expected.
    }
  }
  return {
    format: 'tackbok-v7-canonical-device-report',
    formatVersion: 1,
    platform,
    engine,
    acceptedVectors: fixture.vectors.length,
    rejectedVectors: fixture.reject.length,
    passed,
  };
}
