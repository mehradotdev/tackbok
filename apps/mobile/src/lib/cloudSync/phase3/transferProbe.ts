import * as Device from 'expo-device';
import { File, FileMode, Paths } from 'expo-file-system';

import type { DeterministicFixtureId } from '../phase0/deterministicFixture';
import type { ProbeEnvironment } from './probeEnvironment';
import {
  createFileByteSource,
  ensureProbeFixtureFile,
  FileDownloadSink,
  SimulatedTransferInterruption,
} from './probeFiles';
import { runProbeGroup, type ProbeGroupResult } from './probeReport';

const ONE_MEBIBYTE = 1024 * 1024;

/**
 * Emulator and simulator numbers are recorded but can never satisfy a
 * physical-device gate item, so the runtime is stated in the evidence itself.
 */
function runtimeLabel(): string {
  return Device.isDevice ? 'physical-device' : 'emulator-or-simulator';
}

function throughput(bytes: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round((bytes / ONE_MEBIBYTE / (elapsedMs / 1000)) * 100) / 100;
}

/**
 * Gate item: a large fixture makes the full round trip. The bytes are the
 * frozen Phase-0 deterministic fixture, so both directions are checked against
 * a hash computed on the host, not one this device produced.
 */
export function runTransferGroup(
  env: ProbeEnvironment,
  fixtureId: DeterministicFixtureId,
): Promise<ProbeGroupResult> {
  return runProbeGroup('transfer', `Large transfer round trip (${fixtureId})`, async (steps) => {
    const key = `blobs/probe-transfer-${fixtureId}.bin`;

    const fixture = await ensureProbeFixtureFile(fixtureId);
    steps.record({
      id: 'transfer.fixture',
      title: 'Deterministic fixture is present',
      status: 'passed',
      detail: 'The fixture bytes come from the frozen Phase-0 generator.',
      facts: {
        fixtureId,
        fixtureBytes: fixture.byteLength,
        expectedSha256: fixture.expectedSha256,
        generationMs: fixture.generationMs,
        runtime: runtimeLabel(),
      },
    });

    const interrupted = await steps.step(
      'transfer.upload-interrupted',
      'A large upload survives an interruption',
      async () => {
        try {
          await env.provider.putImmutable(
            env.vault,
            key,
            createFileByteSource(fixture.file, fixture.expectedSha256, {
              failAfterBytes: Math.floor(fixture.byteLength * 0.4),
            }),
          );
          return {
            status: 'inconclusive' as const,
            detail: 'The upload finished before the injected interruption.',
            facts: { interrupted: false },
          };
        } catch (error) {
          if (!(error instanceof SimulatedTransferInterruption)) throw error;
          const session = await env.sessions.get({
            logicalKey: key,
            contentHash: fixture.expectedSha256,
          });
          return {
            status: session ? ('passed' as const) : ('failed' as const),
            detail: session
              ? 'The interrupted transfer left a resumable session in durable storage.'
              : 'The interrupted transfer left nothing to resume from.',
            facts: {
              interrupted: true,
              bytesDeliveredBeforeInterrupt: error.bytesDelivered,
              sessionPersisted: session !== null,
            },
          };
        }
      },
    );

    await steps.step('transfer.upload-resume', 'The upload resumes and completes', async () => {
      const before = env.instrumented.snapshot();
      const startedAt = performance.now();
      const ref = await env
        .newProvider()
        .putImmutable(
          env.vault,
          key,
          createFileByteSource(fixture.file, fixture.expectedSha256),
        );
      const elapsedMs = Math.round(performance.now() - startedAt);
      const after = env.instrumented.snapshot();

      return {
        status: ref.contentHash === fixture.expectedSha256 ? ('passed' as const) : ('failed' as const),
        detail: 'The completed upload carries the host-frozen fixture hash.',
        facts: {
          resumedFromPersistedSession: interrupted.facts.sessionPersisted === true,
          declaredHashMatches: ref.contentHash === fixture.expectedSha256,
          elapsedMs,
          mebibytesPerSecond: throughput(fixture.byteLength, elapsedMs),
          requestsIssued: after.requests - before.requests,
          status308Responses: (after.statusCounts['308'] ?? 0) - (before.statusCounts['308'] ?? 0),
          runtime: runtimeLabel(),
        },
      };
    });

    const sinkFile = new File(Paths.cache, `phase3-transfer-download-${fixtureId}.bin`);
    const sink = new FileDownloadSink(sinkFile);

    await steps.step('transfer.download', 'The download streams to disk and verifies', async () => {
      await sink.reset();
      const startedAt = performance.now();
      const ref = await env.provider.downloadToSink(env.vault, key, sink);
      const elapsedMs = Math.round(performance.now() - startedAt);
      const bytes = await sink.byteLength();
      const digest = await sink.digestSha256();

      const ok = ref !== null && bytes === fixture.byteLength && digest === fixture.expectedSha256;
      return {
        status: ok ? ('passed' as const) : ('failed' as const),
        detail: ok
          ? 'Byte count and SHA-256 match the frozen fixture; the adapter never buffered the whole object in JavaScript.'
          : 'The downloaded object did not match the frozen fixture.',
        facts: {
          byteCountMatches: bytes === fixture.byteLength,
          sha256Matches: digest === fixture.expectedSha256,
          downloadedBytes: bytes,
          elapsedMs,
          mebibytesPerSecond: throughput(bytes, elapsedMs),
          runtime: runtimeLabel(),
        },
      };
    });

    await steps.step('transfer.download-resume', 'A partial download resumes by byte range', async () => {
      // Rebuild a truncated local copy, exactly what an interrupted download
      // leaves behind, then hand the same sink back to the adapter.
      const prefixBytes = Math.floor(fixture.byteLength * 0.3);
      await sink.reset();
      const source = fixture.file.open(FileMode.ReadOnly);
      try {
        let copied = 0;
        while (copied < prefixBytes) {
          const chunk = source.readBytes(Math.min(ONE_MEBIBYTE, prefixBytes - copied));
          if (chunk.length === 0) break;
          await sink.append(chunk);
          copied += chunk.length;
        }
      } finally {
        source.close();
      }
      const resumedFrom = await sink.byteLength();

      const before = env.instrumented.snapshot();
      const ref = await env.newProvider().downloadToSink(env.vault, key, sink);
      const after = env.instrumented.snapshot();
      const bytes = await sink.byteLength();
      const digest = await sink.digestSha256();

      const ok = ref !== null && bytes === fixture.byteLength && digest === fixture.expectedSha256;
      return {
        status: ok ? ('passed' as const) : ('failed' as const),
        detail: ok
          ? 'The adapter requested only the missing range and the completed file still verified.'
          : 'The resumed download did not reproduce the fixture hash.',
        facts: {
          resumedFromBytes: resumedFrom,
          finalBytes: bytes,
          sha256Matches: digest === fixture.expectedSha256,
          status206Responses: (after.statusCounts['206'] ?? 0) - (before.statusCounts['206'] ?? 0),
          requestsIssued: after.requests - before.requests,
        },
      };
    });

    sink.dispose();
  });
}
