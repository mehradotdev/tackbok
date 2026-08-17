import { eq } from 'drizzle-orm';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';

import { cloudVault, mediaAssets } from '~/db/schema';
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

export function isV7DeviceHardeningProbeEnabled(): boolean {
  const cloudSync = Constants.expoConfig?.extra?.cloudSync as {
    deviceProbesEnabled?: unknown;
  } | undefined;
  return __DEV__ || cloudSync?.deviceProbesEnabled === true;
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

  const source = new File(selectedFixtureUri);
  if (!source.exists) throw new Error('Select the generated V7-5 200 MiB fixture first');
  const inspected = await inspectLocalMediaFile(source.uri);
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
  await copyAsync({ from: source.uri, to: destination.uri });

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
  const file = new File(asset.local_uri);
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
