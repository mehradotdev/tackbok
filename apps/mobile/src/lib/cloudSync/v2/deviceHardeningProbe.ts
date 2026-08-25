import { and, count, eq, isNotNull, isNull, or } from 'drizzle-orm';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';

import { cloudVault, entries, mediaAssets } from '~/db/schema';
import { db } from '~/db';
import { AssetType } from '~/types';
import { inspectLocalMediaFile } from '../media/streamingHash';
import {
  runInCloudSyncTransaction,
  upsertEntryInTransaction,
} from '../storage/repositories';

const PROBE_ENTRY_ID = 'v7-phase5-probe-entry';
const PROBE_ASSET_ID = 'v7-phase5-probe-media';
const PROBE_DIRECTORY = 'cloud-sync-v7-phase5-probes';
const EXPECTED_BYTE_COUNT = 200 * 1024 * 1024;
const EXPECTED_SHA256 = '502bfded85f94ec7c5a6284ba359cc6f219438aada6099ab5f2c8560fcbc3868';

export interface SeededV7LargeMediaProbe {
  entryId: string;
  assetId: string;
  byteCount: number;
}

export interface VerifiedV7LargeMediaProbe {
  present: boolean;
  byteCount: number;
  byteCountMatched: boolean;
  sha256Matched: boolean;
  productionHashRecorded: boolean;
  productionHashMatched: boolean;
  productionByteSizeMatched: boolean;
  elapsedMs: number;
}

export interface RedactedPendingMediaDiagnostic {
  pendingCount: number;
  candidates: {
    index: number;
    kind: string;
    uriClass: 'content' | 'file' | 'absolute' | 'document-relative';
    directoryClass: 'voice-memos' | 'photos' | 'probe' | 'other';
    fileExists: boolean | null;
    nativeInspection: 'passed' | 'failed';
    byteCount: number | null;
  }[];
}

export interface RedactedV1PurgePreflight {
  configuredVaultCount: number;
  protocolVersion: 1 | 2 | null;
  eligibility: 'eligible-v1' | 'not-v1' | 'no-configured-vault' | 'ambiguous';
  localJournalPresent: boolean;
}

export function isV7DeviceHardeningProbeEnabled(): boolean {
  const cloudSync = Constants.expoConfig?.extra?.cloudSync as {
    deviceProbesEnabled?: unknown;
  } | undefined;
  return __DEV__ || cloudSync?.deviceProbesEnabled === true;
}

function classifyLocalUri(uri: string): Pick<
  RedactedPendingMediaDiagnostic['candidates'][number],
  'uriClass' | 'directoryClass'
> {
  const uriClass = uri.startsWith('content:')
    ? 'content'
    : uri.startsWith('file:')
      ? 'file'
      : uri.startsWith('/')
        ? 'absolute'
        : 'document-relative';
  const directoryClass = uri.includes('voice_memos/')
    ? 'voice-memos'
    : uri.includes('photos/')
      ? 'photos'
      : uri.includes('cloud-sync-v7-phase5-probes/')
        ? 'probe'
        : 'other';
  return { uriClass, directoryClass };
}

/**
 * DEV-only, redacted diagnosis for media that blocks production hashing.
 * It deliberately exposes no URI, asset/owner ID, digest, account value, or
 * native exception text.
 */
export async function diagnosePendingV7Media(): Promise<RedactedPendingMediaDiagnostic> {
  if (!isV7DeviceHardeningProbeEnabled()) {
    throw new Error('V7-5 media diagnosis is disabled in this build');
  }
  const rows = await db.select({
    kind: mediaAssets.kind,
    localUri: mediaAssets.local_uri,
  }).from(mediaAssets).where(and(
    isNotNull(mediaAssets.local_uri),
    or(isNull(mediaAssets.blob_hash), isNull(mediaAssets.byte_size)),
  )).limit(10);

  const candidates = await Promise.all(rows.map(async (row, index) => {
    const uri = row.localUri!;
    const classification = classifyLocalUri(uri);
    let fileExists: boolean | null = null;
    if (classification.uriClass !== 'content') {
      try {
        const file = classification.uriClass === 'document-relative'
          ? new File(Paths.document, uri)
          : new File(uri);
        fileExists = file.exists;
      } catch {
        fileExists = false;
      }
    }
    try {
      const inspected = await inspectLocalMediaFile(uri);
      return {
        index,
        kind: row.kind,
        ...classification,
        fileExists,
        nativeInspection: 'passed' as const,
        byteCount: inspected.byteSize,
      };
    } catch {
      return {
        index,
        kind: row.kind,
        ...classification,
        fileExists,
        nativeInspection: 'failed' as const,
        byteCount: null,
      };
    }
  }));
  return { pendingCount: rows.length, candidates };
}

/**
 * DEV-only destructive-action preflight. The result contains no vault/device
 * identifier, provider object, account value, token, or journal content.
 */
export async function inspectV1PurgePreflight(): Promise<RedactedV1PurgePreflight> {
  if (!isV7DeviceHardeningProbeEnabled()) {
    throw new Error('V7-5 purge preflight is disabled in this build');
  }
  const vaults = await db.select({
    protocolVersion: cloudVault.protocol_version,
    remoteRootPresent: isNotNull(cloudVault.remote_root_id),
    status: cloudVault.status,
  }).from(cloudVault);
  const configured = vaults.filter((vault) =>
    vault.remoteRootPresent && !['disabled', 'revoked'].includes(vault.status));
  const [journal] = await db.select({ value: count() }).from(entries);
  const protocolVersion = configured.length === 1
    ? configured[0].protocolVersion === 2 ? 2 : 1
    : null;
  const eligibility: RedactedV1PurgePreflight['eligibility'] = configured.length === 0
    ? 'no-configured-vault'
    : configured.length > 1
      ? 'ambiguous'
      : protocolVersion === 1
        ? 'eligible-v1'
        : 'not-v1';
  return {
    configuredVaultCount: configured.length,
    protocolVersion,
    eligibility,
    localJournalPresent: (journal?.value ?? 0) > 0,
  };
}

/**
 * Development-only preparation for V7-5's real production-path media run.
 *
 * The normal journal repository records the synthetic attachment, so Sync now
 * exercises exactly the v2 production journal/media/provider path. The helper
 * deliberately does not upload or delete anything itself. The owner must use
 * a disposable v2 vault and the reviewed production controls from the device
 * checklist.
 */
export async function seedV7LargeMediaProductionProbe(
  selectedFixtureUri: string,
): Promise<SeededV7LargeMediaProbe> {
  if (!isV7DeviceHardeningProbeEnabled()) {
    throw new Error('V7-5 media seeding is disabled in this build');
  }
  const [vault] = await db.select().from(cloudVault)
    .where(eq(cloudVault.protocol_version, 2)).limit(1);
  if (!vault || !vault.remote_root_id || ['disabled', 'revoked'].includes(vault.status)) {
    throw new Error('Connect a disposable protocol-v2 cloud backup first');
  }

  // Android's document picker returns a content:// URI. Pass it through to
  // the native hasher and copier unchanged; constructing an Expo File from it
  // incorrectly treats the URI as a path under the app document directory.
  const inspected = await inspectLocalMediaFile(selectedFixtureUri);
  if (inspected.byteSize !== EXPECTED_BYTE_COUNT || inspected.sha256 !== EXPECTED_SHA256) {
    throw new Error('Selected file is not the frozen synthetic V7-5 200 MiB fixture');
  }
  const directory = new Directory(Paths.document, PROBE_DIRECTORY);
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(directory, 'synthetic-200mib.bin');
  if (destination.exists) destination.delete();
  // File.copy currently materializes external content URIs on Android. The
  // 200 MiB gate fixture therefore exceeds the app heap before the production
  // streaming hasher can run. The legacy native relocation API streams the
  // copy in the filesystem module and keeps the bytes off the JS bridge.
  await copyAsync({ from: selectedFixtureUri, to: destination.uri });

  const now = Date.now();
  await runInCloudSyncTransaction(async (tx) => {
    await upsertEntryInTransaction(tx, {
      note_id: PROBE_ENTRY_ID,
      text_title: 'Synthetic V7-5 media probe',
      text_content: 'Synthetic fixture only. Delete the disposable test vault after evidence capture.',
      mood: null,
      assets: [{
        type: AssetType.AUDIO,
        uri: destination.uri,
        assetId: PROBE_ASSET_ID,
        mimeType: 'application/octet-stream',
      }],
      tags: '',
      created_at: now,
      updated_at: now,
    }, { now });
    // A repeated probe must still exercise the ordinary production hashing
    // step rather than retaining values computed by an earlier run.
    await tx.update(mediaAssets).set({ blob_hash: null, byte_size: null })
      .where(eq(mediaAssets.asset_id, PROBE_ASSET_ID));
  });

  return {
    entryId: PROBE_ENTRY_ID,
    assetId: PROBE_ASSET_ID,
    byteCount: EXPECTED_BYTE_COUNT,
  };
}

/** Verifies the restored production media file without exposing bytes or its digest. */
export async function verifyV7LargeMediaProductionProbe(): Promise<VerifiedV7LargeMediaProbe> {
  if (!isV7DeviceHardeningProbeEnabled()) {
    throw new Error('V7-5 media verification is disabled in this build');
  }
  const [asset] = await db.select().from(mediaAssets)
    .where(eq(mediaAssets.asset_id, PROBE_ASSET_ID)).limit(1);
  if (!asset?.local_uri) {
    return {
      present: false,
      byteCount: 0,
      byteCountMatched: false,
      sha256Matched: false,
      productionHashRecorded: false,
      productionHashMatched: false,
      productionByteSizeMatched: false,
      elapsedMs: 0,
    };
  }
  const file = asset.local_uri.startsWith('file:') || asset.local_uri.startsWith('/')
    ? new File(asset.local_uri)
    : new File(Paths.document, asset.local_uri);
  if (!file.exists) {
    return {
      present: false,
      byteCount: 0,
      byteCountMatched: false,
      sha256Matched: false,
      productionHashRecorded: Boolean(asset.blob_hash),
      productionHashMatched: asset.blob_hash === EXPECTED_SHA256,
      productionByteSizeMatched: asset.byte_size === EXPECTED_BYTE_COUNT,
      elapsedMs: 0,
    };
  }
  const startedAt = performance.now();
  const result = await inspectLocalMediaFile(file.uri);
  return {
    present: true,
    byteCount: result.byteSize,
    byteCountMatched: result.byteSize === EXPECTED_BYTE_COUNT,
    sha256Matched: result.sha256 === EXPECTED_SHA256,
    productionHashRecorded: Boolean(asset.blob_hash),
    productionHashMatched: asset.blob_hash === EXPECTED_SHA256,
    productionByteSizeMatched: asset.byte_size === EXPECTED_BYTE_COUNT,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
