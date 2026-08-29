import { decodeGzipBounded, encodeGzip } from '~/lib/zip/core/gzip-codec';

import { encodeCanonicalBytes } from '../canonical';
import { SNAPSHOT_CAPS } from '../caps';
import { encodeSnapshot } from '../codec';
import { sha256Bytes, sha256Text } from '../sha256';
import { decodeUtf8Strict, parseJsonStrict } from '../strictJson';
import type { JournalSnapshotPayload, ObservedDeviceHead } from '../types';
import type {
  BaseShadowFileStore,
  BaseShadow,
  BaseShadowCheckpoint,
  SnapshotSyncHooks,
} from './types';

const ID = /^[\x20-\x7e]+$/;
const HASH = /^[0-9a-f]{64}$/;

export class BaseShadowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaseShadowValidationError';
  }
}

export class BaseShadowCommitError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BaseShadowCommitError';
  }
}

export class BaseShadowReadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BaseShadowReadError';
  }
}

function invalid(message: string): never {
  throw new BaseShadowValidationError(message);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function assertClosedObject(
  value: unknown,
  keys: readonly string[],
  path: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${path} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid(`${path} has missing or unknown keys`);
  }
}

function validateHeads(value: unknown): ObservedDeviceHead[] {
  if (!Array.isArray(value) || value.length > SNAPSHOT_CAPS.observedDeviceHeads) {
    invalid('acceptedDeviceHeads is not a bounded array');
  }
  let previous = '';
  for (const [index, item] of value.entries()) {
    assertClosedObject(item, ['deviceId', 'deviceSequence', 'snapshotId'], `acceptedDeviceHeads[${index}]`);
    if (typeof item.deviceId !== 'string' || !ID.test(item.deviceId) ||
        new TextEncoder().encode(item.deviceId).length > SNAPSHOT_CAPS.idBytes) {
      invalid('Base-shadow device ID is invalid');
    }
    if (!Number.isSafeInteger(item.deviceSequence) || (item.deviceSequence as number) < 0) {
      invalid('Base-shadow device sequence is invalid');
    }
    if (typeof item.snapshotId !== 'string' || !HASH.test(item.snapshotId)) {
      invalid('Base-shadow snapshot observation is invalid');
    }
    if (item.deviceId <= previous) invalid('Base-shadow device heads are not strictly sorted');
    previous = item.deviceId;
  }
  return value as ObservedDeviceHead[];
}

export function encodeBaseShadow(shadow: BaseShadow): {
  canonicalBytes: Uint8Array;
  canonicalSha256: string;
  compressedBytes: Uint8Array;
} {
  const validated = validateBaseShadow(shadow);
  const canonicalBytes = encodeCanonicalBytes(validated);
  if (canonicalBytes.length > SNAPSHOT_CAPS.uncompressedBytes) {
    invalid('Base shadow exceeds the uncompressed snapshot cap');
  }
  const compressedBytes = encodeGzip(canonicalBytes, { level: 6 });
  if (compressedBytes.length > SNAPSHOT_CAPS.compressedBytes) {
    invalid('Base shadow exceeds the compressed snapshot cap');
  }
  return {
    canonicalBytes,
    canonicalSha256: sha256Bytes(canonicalBytes),
    compressedBytes,
  };
}

export function validateBaseShadow(value: unknown): BaseShadow {
  assertClosedObject(value, [
    'format', 'vaultId', 'snapshotId', 'acceptedDeviceHeads', 'payload',
  ], '$');
  if (value.format !== 'tackbok-base-shadow') invalid('Unsupported base-shadow format');
  if (typeof value.vaultId !== 'string' || !ID.test(value.vaultId)) invalid('Invalid base-shadow vault ID');
  if (typeof value.snapshotId !== 'string' || !HASH.test(value.snapshotId)) invalid('Invalid base-shadow snapshot ID');
  const acceptedDeviceHeads = validateHeads(value.acceptedDeviceHeads);
  const encodedPayload = encodeSnapshot(value.payload as JournalSnapshotPayload);
  if (encodedPayload.snapshotId !== value.snapshotId) invalid('Base-shadow payload hash does not match');
  if (!bytesEqual(encodedPayload.canonicalBytes, encodeCanonicalBytes(value.payload))) {
    invalid('Base-shadow payload is not normalized canonical protocol state');
  }
  if (encodedPayload.payload.vaultId !== value.vaultId) invalid('Base-shadow vault does not match its payload');
  return {
    format: 'tackbok-base-shadow',
    vaultId: value.vaultId,
    snapshotId: value.snapshotId,
    acceptedDeviceHeads: acceptedDeviceHeads.map((head) => ({ ...head })),
    payload: encodedPayload.payload,
  };
}

export function decodeBaseShadow(compressedBytes: Uint8Array): {
  shadow: BaseShadow;
  canonicalSha256: string;
} {
  const canonicalBytes = decodeGzipBounded(compressedBytes, {
    maxCompressedBytes: SNAPSHOT_CAPS.compressedBytes,
    maxUncompressedBytes: SNAPSHOT_CAPS.uncompressedBytes,
  });
  const parsed = parseJsonStrict(decodeUtf8Strict(canonicalBytes));
  const shadow = validateBaseShadow(parsed);
  if (!bytesEqual(canonicalBytes, encodeCanonicalBytes(shadow))) {
    invalid('Base shadow is valid JSON but not canonical JSON');
  }
  return { shadow, canonicalSha256: sha256Bytes(canonicalBytes) };
}

export class BaseShadowManager {
  constructor(private readonly files: BaseShadowFileStore) {}

  async prepareAndReplace(
    deviceId: string,
    capturedGeneration: number,
    shadow: BaseShadow,
    at?: SnapshotSyncHooks['at'],
  ): Promise<BaseShadowCheckpoint> {
    const encoded = encodeBaseShadow(shadow);
    const finalFileName = `base-${shadow.snapshotId}.json.gz`;
    const deviceToken = sha256Text(deviceId).slice(0, 12);
    const tempFileName = `${finalFileName}.${deviceToken}.tmp`;
    try {
      await this.files.writeTempAndFsync(tempFileName, encoded.compressedBytes);
    } catch (error) {
      throw new BaseShadowCommitError('Base-shadow temp write/fsync failed', { cause: error });
    }
    await at?.('after-base-shadow-temp-fsynced');
    try {
      const readBack = await this.files.read(tempFileName);
      const verified = decodeBaseShadow(readBack);
      if (verified.canonicalSha256 !== encoded.canonicalSha256 ||
          verified.shadow.snapshotId !== shadow.snapshotId) {
        invalid('Base-shadow read-back verification failed');
      }
    } catch (error) {
      throw new BaseShadowCommitError('Base-shadow read-back verification failed', {
        cause: error,
      });
    }
    await at?.('after-base-shadow-readback');
    try {
      await this.files.replaceAndFsync(tempFileName, finalFileName);
    } catch (error) {
      throw new BaseShadowCommitError('Base-shadow atomic replace/fsync failed', {
        cause: error,
      });
    }
    await at?.('after-base-shadow-renamed');
    return {
      vaultId: shadow.vaultId,
      deviceId,
      snapshotId: shadow.snapshotId,
      fileName: finalFileName,
      canonicalSha256: encoded.canonicalSha256,
      byteCount: encoded.compressedBytes.length,
      committedGeneration: capturedGeneration,
    };
  }

  async load(
    checkpoint: BaseShadowCheckpoint | null,
  ): Promise<{ shadow: BaseShadow | null; degraded: boolean }> {
    if (!checkpoint) return { shadow: null, degraded: false };
    let bytes: Uint8Array;
    try {
      bytes = await this.files.read(checkpoint.fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/missing|not found/i.test(message)) return { shadow: null, degraded: true };
      throw new BaseShadowReadError('Base-shadow file could not be read', { cause: error });
    }
    try {
      if (bytes.length !== checkpoint.byteCount) invalid('Base-shadow byte count changed');
      const decoded = decodeBaseShadow(bytes);
      if (decoded.canonicalSha256 !== checkpoint.canonicalSha256 ||
          decoded.shadow.snapshotId !== checkpoint.snapshotId ||
          decoded.shadow.vaultId !== checkpoint.vaultId) {
        invalid('Base-shadow checkpoint does not match its file');
      }
      return { shadow: decoded.shadow, degraded: false };
    } catch {
      try {
        await this.files.quarantine(checkpoint.fileName);
      } catch {
        // Quarantine is best effort; the SQLite checkpoint remains evidence.
      }
      return { shadow: null, degraded: true };
    }
  }

  async reap(fileName: string): Promise<void> {
    await this.files.delete(fileName);
  }
}
