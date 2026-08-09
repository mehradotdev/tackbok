import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';

import {
  DETERMINISTIC_FIXTURES,
  FIXTURE_CHUNK_BYTES,
  fillDeterministicFixtureChunk,
  type DeterministicFixtureId,
} from './deterministicFixture';
import {
  runCanonicalFixtureDeviceProbe,
  type CanonicalFixtureProbeReport,
} from './deviceFixtureProbe';
import { runStreamingHashSpike, type StreamingHashBenchmark } from './streamingHashSpike';

export const DIAGNOSTICS_LOG_TAG = 'PHASE0_DIAGNOSTICS_RESULT';
export const DIAGNOSTICS_REPORT_FILENAME = 'phase0-diagnostics-report.json';

const YIELD_INTERVAL_CHUNKS = 8;

export interface StreamingHashProbeReport {
  fixtureId: DeterministicFixtureId;
  fixtureBytes: number;
  expectedSha256: string;
  firstRun: StreamingHashBenchmark;
  secondRun: StreamingHashBenchmark;
  hashMatchesExpected: boolean;
  runsAgree: boolean;
  generationMs: number;
  passed: boolean;
}

export interface Phase0DiagnosticsReport {
  probeSuite: 'cloud-sync-phase0';
  timestamp: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  buildType: 'debug' | 'release';
  canonicalFixtures: CanonicalFixtureProbeReport;
  streamingHash: StreamingHashProbeReport;
  passed: boolean;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Materializes the deterministic hash fixture in the cache directory. An
 * existing file of the right size is reused; the double hash run against the
 * host-frozen SHA-256 is what proves its content.
 */
async function ensureHashFixtureFile(fixtureId: DeterministicFixtureId): Promise<{
  file: File;
  generationMs: number;
}> {
  const spec = DETERMINISTIC_FIXTURES[fixtureId];
  const file = new File(Paths.cache, `phase0-hash-fixture-${fixtureId}.bin`);

  if (file.exists && file.size === spec.totalBytes) {
    return { file, generationMs: 0 };
  }

  const startedAt = performance.now();
  if (file.exists) {
    file.delete();
  }
  file.create();

  const handle = file.open();
  try {
    const chunk = new Uint8Array(FIXTURE_CHUNK_BYTES);
    const chunkCount = spec.totalBytes / FIXTURE_CHUNK_BYTES;
    for (let index = 0; index < chunkCount; index += 1) {
      fillDeterministicFixtureChunk(index, chunk);
      handle.writeBytes(chunk);
      if ((index + 1) % YIELD_INTERVAL_CHUNKS === 0) {
        await yieldToEventLoop();
      }
    }
  } finally {
    handle.close();
  }

  return { file, generationMs: Math.round(performance.now() - startedAt) };
}

async function runStreamingHashProbe(
  fixtureId: DeterministicFixtureId,
): Promise<StreamingHashProbeReport> {
  const spec = DETERMINISTIC_FIXTURES[fixtureId];
  const { file, generationMs } = await ensureHashFixtureFile(fixtureId);

  const firstRun = await runStreamingHashSpike(file.uri);
  const secondRun = await runStreamingHashSpike(file.uri);

  const hashMatchesExpected =
    firstRun.sha256 === spec.expectedSha256 && firstRun.bytesRead === spec.totalBytes;
  const runsAgree = firstRun.sha256 === secondRun.sha256;

  return {
    fixtureId,
    fixtureBytes: spec.totalBytes,
    expectedSha256: spec.expectedSha256,
    firstRun,
    secondRun,
    hashMatchesExpected,
    runsAgree,
    generationMs,
    passed:
      hashMatchesExpected &&
      runsAgree &&
      firstRun.respectsBoundedRead &&
      secondRun.respectsBoundedRead,
  };
}

/**
 * Development-only Phase-0 diagnostics suite (docs/cloud-sync/phase0/README.md).
 * The report contains only fixture metrics and build metadata — never journal
 * data, tokens, or account identifiers. Throughput numbers from emulators or
 * simulators are recorded but can never satisfy a physical-device gate item.
 */
export async function runPhase0Diagnostics(
  fixtureId: DeterministicFixtureId,
): Promise<Phase0DiagnosticsReport> {
  const canonicalFixtures = runCanonicalFixtureDeviceProbe();
  const streamingHash = await runStreamingHashProbe(fixtureId);

  const report: Phase0DiagnosticsReport = {
    probeSuite: 'cloud-sync-phase0',
    timestamp: new Date().toISOString(),
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildType: __DEV__ ? 'debug' : 'release',
    canonicalFixtures,
    streamingHash,
    passed: canonicalFixtures.passed && streamingHash.passed,
  };

  const reportFile = new File(Paths.document, DIAGNOSTICS_REPORT_FILENAME);
  if (reportFile.exists) {
    reportFile.delete();
  }
  reportFile.create();
  reportFile.write(JSON.stringify(report, null, 2));

  console.log(`${DIAGNOSTICS_LOG_TAG} ${JSON.stringify(report)}`);
  return report;
}
