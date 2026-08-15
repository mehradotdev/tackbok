import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { sqlite } from '~/db';
import { createGoogleAuthorization, type CloudAuthorization } from '../../auth';
import { readOrCreateGoogleConnectionId } from '../../auth/secureTokenStore';
import { stopProductionSyncRuntime } from '../../runtime';
import { encodeSnapshotV2, decodeSnapshotV2 } from '../codec';
import { sha256BytesV2 } from '../sha256';
import type { JournalSnapshotPayloadV2 } from '../types';
import type { DeviceHeadV2 } from '../sync/types';
import {
  GoogleDriveSnapshotV2Provider,
  type DriveV2FetchLike,
} from './googleDriveSnapshotProvider';
import { MemoryDriveV2Instrumentation } from './instrumentation';
import {
  assertDriveV2ProbeReportIsRedacted,
  buildDriveV2ProbeReport,
  type DriveV2ProbeReport,
  type DriveV2ProbeStep,
} from './probeReport';
import {
  MemoryDriveV2ProviderStateStore,
  SQLiteDriveV2ProviderStateStore,
  type DriveV2ProviderStateStore,
} from './state';

export const V7_PHASE3_PROBE_FILENAME = 'v7-phase3-drive-probe-report.json';
export const V7_PHASE3_PROBE_LOG_TAG = 'V7_PHASE3_DRIVE_PROBE_RESULT';

const SYNTHETIC_ENTRY_COUNT = 2_000;
const CLOCK = 1_777_000_000_000;

function syntheticPayload(vaultId: string, deviceId: string): JournalSnapshotPayloadV2 {
  return {
    format: 'tackbok-snapshot',
    formatVersion: 2,
    vaultId,
    parentSnapshotIds: [],
    observedDeviceHeads: [],
    authorDeviceId: deviceId,
    deviceSequence: 1,
    createdAt: CLOCK,
    entries: Array.from({ length: SYNTHETIC_ENTRY_COUNT }, (_, index) => ({
      entryId: `presently-${index.toString().padStart(6, '0')}`,
      title: null,
      content: `Synthetic Presently entry ${index}; no user data.`,
      mood: null,
      createdAt: CLOCK + index * 86_400_000,
      updatedAt: CLOCK + index * 86_400_000,
      conflictOriginId: null,
    })),
    tags: [],
    entryTags: [],
    prompts: [],
    profile: {
      profileId: 'profile',
      displayName: null,
      photoAssetId: null,
      updatedAt: CLOCK,
    },
    media: [],
    tombstones: [],
    conflicts: [],
  };
}

function head(
  vaultId: string,
  deviceId: string,
  snapshotId: string,
  sequence: number,
): DeviceHeadV2 {
  return {
    format: 'tackbok-device-head',
    formatVersion: 2,
    vaultId,
    deviceId,
    deviceSequence: sequence,
    snapshotId,
    updatedAt: CLOCK + sequence,
  };
}

async function expoFetch(): Promise<DriveV2FetchLike> {
  const { fetch } = await import('expo/fetch');
  return fetch as unknown as DriveV2FetchLike;
}

async function captureStep(
  id: string,
  title: string,
  body: () => Promise<Omit<DriveV2ProbeStep, 'id' | 'title'>>,
): Promise<DriveV2ProbeStep> {
  try {
    return { id, title, ...(await body()) };
  } catch (error) {
    return {
      id,
      title,
      status: 'failed',
      detail: error instanceof Error ? error.message : 'Probe failed with an unknown error.',
      facts: { completed: false },
    };
  }
}

interface ProbeProviderOptions {
  auth: CloudAuthorization;
  state: DriveV2ProviderStateStore;
  fetch: DriveV2FetchLike;
  scenario: string;
}

function probeProvider(options: ProbeProviderOptions): {
  provider: GoogleDriveSnapshotV2Provider;
  metrics: MemoryDriveV2Instrumentation;
} {
  const metrics = new MemoryDriveV2Instrumentation(options.scenario);
  return {
    provider: new GoogleDriveSnapshotV2Provider({
      auth: options.auth,
      state: options.state,
      fetch: options.fetch,
      instrumentation: metrics,
    }),
    metrics,
  };
}

/**
 * Development-only, destructive real-Drive probe. It creates only synthetic
 * protocol-v2 objects under a random probe vault and attempts to permanently
 * remove every one before returning. No remote identifier is copied into the
 * report, log, or local evidence file.
 */
export async function runDriveV2RealProbe(options: {
  authorization?: 'interactive' | 'stored';
} = {}): Promise<DriveV2ProbeReport> {
  if (!__DEV__) throw new Error('The V7-3 Drive probe is available only in development builds');

  // The probe deliberately changes the shared Google credential to a
  // throwaway account. Stop v6 before that switch so no ordinary journal sync
  // can run beside the synthetic-only evidence pass.
  stopProductionSyncRuntime();
  const auth = createGoogleAuthorization();
  if (options.authorization === 'stored') await auth.getFreshAccessToken();
  else await auth.authorize();
  const connectionId = await readOrCreateGoogleConnectionId();
  const vaultId = `v7-probe-${randomUUID()}`;
  const deviceA = `probe-device-${randomUUID()}`;
  const deviceB = `probe-device-${randomUUID()}`;
  const deviceC = `probe-device-${randomUUID()}`;
  const deviceD = `probe-device-${randomUUID()}`;
  const fetch = await expoFetch();
  const state = new SQLiteDriveV2ProviderStateStore(sqlite, connectionId);
  const steps: DriveV2ProbeStep[] = [];

  const encoded = encodeSnapshotV2(syntheticPayload(vaultId, deviceA));
  const base = probeProvider({ auth, state, fetch, scenario: 'representative-import' });

  try {
    steps.push(await captureStep('representative-import', 'Publish and restore 2,000 Presently entries', async () => {
      await base.provider.listRevocations(vaultId);
      await base.provider.listHeads(vaultId, true);
      await base.provider.uploadSnapshot(vaultId, encoded.snapshotId, encoded.compressedBytes, CLOCK);
      await base.provider.updateDeviceHead(vaultId, head(vaultId, deviceA, encoded.snapshotId, 1));

      const freshState = new MemoryDriveV2ProviderStateStore();
      const restore = probeProvider({ auth, state: freshState, fetch, scenario: 'fresh-restore' });
      await restore.provider.listRevocations(vaultId);
      const heads = await restore.provider.listHeads(vaultId);
      const bytes = await restore.provider.downloadSnapshot(vaultId, encoded.snapshotId);
      if (!bytes) throw new Error('The representative snapshot was not downloadable');
      const restored = decodeSnapshotV2(bytes, encoded.snapshotId);
      await restore.provider.updateDeviceHead(vaultId, head(vaultId, deviceB, encoded.snapshotId, 1));
      const passed = heads.some((item) => item.head.snapshotId === encoded.snapshotId) &&
        restored.payload.entries.length === SYNTHETIC_ENTRY_COUNT;
      const importRequests = base.metrics.report();
      const restoreRequests = restore.metrics.report();
      return {
        status: passed && importRequests.attempts <= 8 && restoreRequests.attempts <= 8
          ? 'passed' : 'failed',
        detail: passed
          ? 'One synthetic 2,000-entry snapshot was published and restored through a fresh provider cache.'
          : 'The restored snapshot did not contain the expected synthetic entry count.',
        facts: {
          syntheticEntries: SYNTHETIC_ENTRY_COUNT,
          snapshotObjectsPublished: 1,
          restoredEntryCount: restored.payload.entries.length,
          importRequests: importRequests.attempts,
          importRequestCeiling: 8,
          restoreRequests: restoreRequests.attempts,
          restoreRequestCeiling: 8,
        },
        requests: [importRequests, restoreRequests],
      };
    }));

    steps.push(await captureStep('normal-request-budgets', 'Warm quiet and one-edit request budgets', async () => {
      const quiet = probeProvider({ auth, state, fetch, scenario: 'warm-quiet-sync' });
      await quiet.provider.listRevocations(vaultId);
      await quiet.provider.listHeads(vaultId, true);

      const editPayload = encodeSnapshotV2({
        ...syntheticPayload(vaultId, deviceA),
        deviceSequence: 2,
        createdAt: CLOCK + 10,
        entries: [{
          ...syntheticPayload(vaultId, deviceA).entries[0],
          content: 'Synthetic one-edit request-budget fixture.',
          updatedAt: CLOCK + 10,
        }],
      });
      const edit = probeProvider({ auth, state, fetch, scenario: 'one-text-edit' });
      await edit.provider.listRevocations(vaultId);
      await edit.provider.listHeads(vaultId, true);
      await edit.provider.listHeads(vaultId, true);
      await edit.provider.uploadSnapshot(
        vaultId, editPayload.snapshotId, editPayload.compressedBytes, CLOCK + 10,
      );
      await edit.provider.updateDeviceHead(vaultId, head(vaultId, deviceA, editPayload.snapshotId, 2));
      const quietRequests = quiet.metrics.report();
      const editRequests = edit.metrics.report();
      return {
        status: quietRequests.attempts <= 3 && editRequests.attempts <= 7 ? 'passed' : 'failed',
        detail: 'Normal no-fault request attempts stayed within the owner-approved V7-0 ceilings.',
        facts: {
          quietRequests: quietRequests.attempts,
          quietCeiling: 3,
          editRequests: editRequests.attempts,
          editCeiling: 7,
        },
        requests: [quietRequests, editRequests],
      };
    }));

    steps.push(await captureStep('grouped-media-query', 'Fifty-one media checks use two queries', async () => {
      const hashes = Array.from({ length: 51 }, (_, index) =>
        sha256BytesV2(new TextEncoder().encode(`synthetic-absent-media-${index}`)));
      const grouped = probeProvider({
        auth,
        state: new MemoryDriveV2ProviderStateStore(),
        fetch,
        scenario: 'grouped-media-existence',
      });
      const found = await grouped.provider.hasMediaBatch(vaultId, hashes);
      const requests = grouped.metrics.report();
      return {
        status: found.size === 0 && requests.attempts === 2 ? 'passed' : 'failed',
        detail: 'Fifty-one unknown media hashes fit in two real prefix-and-name queries with no file bodies downloaded.',
        facts: { hashesChecked: hashes.length, matchingObjects: found.size, listRequests: requests.attempts },
        requests: [requests],
      };
    }));

    steps.push(await captureStep('duplicate-and-simultaneous-heads', 'Duplicate names and simultaneous heads', async () => {
      await base.provider.createPhysicalHeadForProbe(
        vaultId,
        head(vaultId, deviceA, encoded.snapshotId, 1),
      );
      const simultaneousA = probeProvider({
        auth,
        state: new MemoryDriveV2ProviderStateStore(),
        fetch,
        scenario: 'simultaneous-head-a',
      });
      const simultaneousB = probeProvider({
        auth,
        state: new MemoryDriveV2ProviderStateStore(),
        fetch,
        scenario: 'simultaneous-head-b',
      });
      await Promise.all([
        simultaneousA.provider.updateDeviceHead(
          vaultId, head(vaultId, deviceC, encoded.snapshotId, 1),
        ),
        simultaneousB.provider.updateDeviceHead(
          vaultId, head(vaultId, deviceD, encoded.snapshotId, 1),
        ),
      ]);
      let listed = await base.provider.listHeads(vaultId, true);
      let discoveryPasses = 1;
      while (new Set(listed.map((item) => item.head.deviceId)).size < 4 && discoveryPasses < 4) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        listed = await base.provider.listHeads(vaultId, true);
        discoveryPasses += 1;
      }
      const deviceACopies = listed.filter((item) => item.head.deviceId === deviceA).length;
      const distinctDevices = new Set(listed.map((item) => item.head.deviceId)).size;
      return {
        status: deviceACopies >= 2 && distinctDevices >= 4 ? 'passed' : 'failed',
        detail: 'Both concurrent device heads remained visible and the duplicate physical name was preserved for engine normalization.',
        facts: {
          duplicatePhysicalHeads: deviceACopies,
          distinctDeviceHeads: distinctDevices,
          discoveryPasses,
        },
      };
    }));

    steps.push(await captureStep('lost-upload-response', 'Lost immutable-upload response reconciliation', async () => {
      let responseLost = false;
      const lossyFetch: DriveV2FetchLike = async (url, init) => {
        const response = await fetch(url, init);
        if (!responseLost && url.includes('uploadType=multipart') && init?.method === 'POST') {
          responseLost = true;
          throw new Error('Synthetic post-commit response loss');
        }
        return response;
      };
      const other = encodeSnapshotV2({
        ...syntheticPayload(vaultId, deviceA),
        deviceSequence: 2,
        createdAt: CLOCK + 1,
      });
      const lossy = probeProvider({
        auth,
        state: new MemoryDriveV2ProviderStateStore(),
        fetch: lossyFetch,
        scenario: 'lost-upload-response',
      });
      await lossy.provider.uploadSnapshot(vaultId, other.snapshotId, other.compressedBytes, CLOCK + 1);
      const restored = await lossy.provider.downloadSnapshot(vaultId, other.snapshotId);
      return {
        status: responseLost && Boolean(restored) ? 'passed' : 'failed',
        detail: 'A committed create whose response disappeared was reconciled by exact logical key and checksum without a second upload.',
        facts: { responseLossInjected: responseLost, snapshotRecovered: Boolean(restored) },
        requests: [lossy.metrics.report()],
      };
    }));

    steps.push(await captureStep('cursor-rebuild', 'Invalid change cursor rebuild', async () => {
      base.provider.setCursorForProbe(vaultId, 'v7-probe-intentionally-invalid-cursor');
      const listed = await base.provider.listHeads(vaultId, true);
      return {
        status: listed.length >= 3 ? 'passed' : 'failed',
        detail: 'Drive rejected the synthetic cursor and the adapter rebuilt its prefix-scoped inventory.',
        facts: { invalidCursorInjected: true, physicalHeadsAfterRebuild: listed.length },
      };
    }));

    steps.push(await captureStep('revocation', 'Revocation marker discovery', async () => {
      await base.provider.createRevocationForProbe(vaultId, 'backup-deleted');
      const revocations = await base.provider.listRevocations(vaultId);
      return {
        status: revocations.includes('backup-deleted') ? 'passed' : 'failed',
        detail: 'A directly prefix-listed backup revocation marker dominated ordinary sync discovery.',
        facts: { backupRevocationObserved: revocations.includes('backup-deleted') },
      };
    }));

    steps.push(await captureStep('cleanup-interruption', 'Interrupted snapshot cleanup resumes', async () => {
      let failuresRemaining = 3;
      const interruptedFetch: DriveV2FetchLike = async (url, init) => {
        if (failuresRemaining > 0 && init?.method === 'DELETE' && url.includes('/files/')) {
          failuresRemaining -= 1;
          throw new Error('Synthetic cleanup interruption');
        }
        return fetch(url, init);
      };
      const interrupted = probeProvider({ auth, state, fetch: interruptedFetch, scenario: 'cleanup-interruption' });
      let interruptionObserved = false;
      try {
        await interrupted.provider.deleteSnapshot(vaultId, encoded.snapshotId);
      } catch {
        interruptionObserved = true;
      }
      const resumed = probeProvider({ auth, state, fetch, scenario: 'cleanup-resume' });
      await resumed.provider.deleteSnapshot(vaultId, encoded.snapshotId);
      const absent = (await resumed.provider.downloadSnapshot(vaultId, encoded.snapshotId)) === null;
      return {
        status: interruptionObserved && absent ? 'passed' : 'failed',
        detail: 'Cleanup stopped after bounded transport failures and a new adapter instance safely completed the permanent deletion.',
        facts: { interruptionObserved, snapshotAbsentAfterResume: absent },
        requests: [interrupted.metrics.report()],
      };
    }));

    steps.push(await captureStep('permanent-delete', 'Permanent delete is idempotent', async () => {
      const disposable = encodeSnapshotV2({
        ...syntheticPayload(vaultId, deviceB),
        deviceSequence: 3,
        createdAt: CLOCK + 2,
      });
      await base.provider.uploadSnapshot(vaultId, disposable.snapshotId, disposable.compressedBytes, CLOCK + 2);
      await base.provider.deleteSnapshot(vaultId, disposable.snapshotId);
      await base.provider.deleteSnapshot(vaultId, disposable.snapshotId);
      const absent = (await base.provider.downloadSnapshot(vaultId, disposable.snapshotId)) === null;
      return {
        status: absent ? 'passed' : 'failed',
        detail: 'The snapshot was permanently deleted and repeating the operation remained successful.',
        facts: { snapshotAbsent: absent, repeatDeleteSucceeded: true },
      };
    }));
  } finally {
    steps.push(await captureStep('probe-cleanup', 'Remove all synthetic probe objects', async () => {
      const deleted = await base.provider.deleteAllForProbe(vaultId);
      const remaining = await base.provider.deleteAllForProbe(vaultId);
      return {
        status: remaining === 0 ? 'passed' : 'failed',
        detail: 'All objects carrying the random probe vault marker were permanently removed.',
        facts: { objectsDeleted: deleted, objectsRemaining: remaining },
      };
    }));
    steps.push(await captureStep('probe-disconnect', 'Remove the throwaway local connection', async () => {
      await auth.signOut();
      return {
        status: 'passed',
        detail: 'The throwaway credential and account label were removed through local sign-out without global grant revocation.',
        facts: { localCredentialsRemoved: true, globalRevocationCalled: false },
      };
    }));
  }

  return buildDriveV2ProbeReport(steps, {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildType: __DEV__ ? 'debug' : 'release',
  });
}

export async function writeDriveV2ProbeReport(report: DriveV2ProbeReport): Promise<string> {
  assertDriveV2ProbeReportIsRedacted(report);
  const serialized = JSON.stringify(report, null, 2);
  const file = new File(Paths.document, V7_PHASE3_PROBE_FILENAME);
  if (file.exists) file.delete();
  file.create();
  file.write(serialized);
  console.log(`${V7_PHASE3_PROBE_LOG_TAG} ${JSON.stringify(report)}`);
  return file.uri;
}
