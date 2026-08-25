import type {
  JournalSnapshotPayloadV2,
  ObservedDeviceHeadV2,
  SnapshotDomainV2,
} from '../types';

export type SyncAttentionReason =
  | 'authorization-required'
  | 'account-mismatch'
  | 'consent-incomplete'
  | 'wrong-vault'
  | 'unsupported-format'
  | 'invalid-remote-snapshot'
  | 'head-snapshot-missing'
  | 'ambiguous-device-head'
  | 'frontier-too-wide'
  | 'derived-id-collision'
  | 'local-storage-full'
  | 'provider-quota-full'
  | 'provider-permission-denied'
  | 'missing-media'
  | 'local-media-unreadable'
  | 'normalized-model-not-ready'
  | 'backup-deleted'
  | 'journal-deleted'
  | 'purge-incomplete'
  | 'cleanup-inconsistent';

export type SyncRecoveryAction =
  | 'reconnect-google-drive'
  | 'choose-connected-account'
  | 'finish-connection'
  | 'reconnect-correct-backup'
  | 'update-tackbok'
  | 'retry-verify-backup'
  | 'repair-from-verified-backup'
  | 'inspect-repair-backup'
  | 'consolidate-backups'
  | 'export-repair-backup'
  | 'free-device-storage'
  | 'manage-drive-storage'
  | 'retry-missing-media'
  | 'locate-retry-attachment'
  | 'retry-journal-preparation'
  | 'acknowledge-disconnect'
  | 'review-erase-device'
  | 'resume-deletion'
  | 'verify-backup-health';

/** Stable action IDs used to select localized recovery copy. */
export const ATTENTION_RECOVERY_ACTION: Record<SyncAttentionReason, SyncRecoveryAction> = {
  'authorization-required': 'reconnect-google-drive',
  'account-mismatch': 'choose-connected-account',
  'consent-incomplete': 'finish-connection',
  'wrong-vault': 'reconnect-correct-backup',
  'unsupported-format': 'update-tackbok',
  'invalid-remote-snapshot': 'retry-verify-backup',
  'head-snapshot-missing': 'repair-from-verified-backup',
  'ambiguous-device-head': 'inspect-repair-backup',
  'frontier-too-wide': 'consolidate-backups',
  'derived-id-collision': 'export-repair-backup',
  'local-storage-full': 'free-device-storage',
  'provider-quota-full': 'manage-drive-storage',
  'provider-permission-denied': 'reconnect-google-drive',
  'missing-media': 'retry-missing-media',
  'local-media-unreadable': 'locate-retry-attachment',
  'normalized-model-not-ready': 'retry-journal-preparation',
  'backup-deleted': 'acknowledge-disconnect',
  'journal-deleted': 'review-erase-device',
  'purge-incomplete': 'resume-deletion',
  'cleanup-inconsistent': 'verify-backup-health',
};

export type PendingPublicationStage =
  | 'candidate-persisted'
  | 'snapshot-uploaded'
  | 'snapshot-verified'
  | 'head-advanced'
  | 'domain-applied';

export interface DeviceHeadV2 {
  format: 'tackbok-device-head';
  formatVersion: 2;
  vaultId: string;
  deviceId: string;
  deviceSequence: number;
  snapshotId: string;
  updatedAt: number;
}

export interface ListedDeviceHeadV2 {
  physicalId: string;
  head: DeviceHeadV2;
}

export interface SnapshotObjectV2 {
  snapshotId: string;
  createdAt: number;
  byteCount: number;
}

export type SnapshotProviderErrorCode =
  | 'authorization-required'
  | 'quota-full'
  | 'permission-denied'
  | 'rate-limited'
  | 'wifi-only-media'
  | 'transient'
  | 'invalid-data';

export class SnapshotProviderError extends Error {
  constructor(
    readonly code: SnapshotProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SnapshotProviderError';
  }
}

export class LocalStorageError extends Error {
  constructor(
    readonly reason: Extract<
      SyncAttentionReason,
      'local-storage-full' | 'local-media-unreadable' | 'normalized-model-not-ready'
    >,
    readonly errorClass: string,
  ) {
    super(errorClass);
    this.name = 'LocalStorageError';
  }
}

/** A completed download failed its native size/hash check; safe to retry from zero. */
export class MediaIntegrityError extends Error {
  constructor(readonly errorClass: string) {
    super(errorClass);
    this.name = 'MediaIntegrityError';
  }
}

export interface SnapshotProvider {
  listRevocations(vaultId: string): Promise<('backup-deleted' | 'journal-deleted')[]>;
  /** `refresh=false` is a cleanup-time read of the durable provider cache. */
  listHeads(vaultId: string, refresh?: boolean): Promise<ListedDeviceHeadV2[]>;
  downloadSnapshot(vaultId: string, snapshotId: string): Promise<Uint8Array | null>;
  uploadSnapshot(
    vaultId: string,
    snapshotId: string,
    bytes: Uint8Array,
    createdAt: number,
  ): Promise<void>;
  verifySnapshot(
    vaultId: string,
    snapshotId: string,
    expectedBytes: Uint8Array,
  ): Promise<boolean>;
  updateDeviceHead(vaultId: string, head: DeviceHeadV2): Promise<void>;
  hasMediaBatch(vaultId: string, blobHashes: readonly string[]): Promise<Set<string>>;
  uploadMedia(vaultId: string, blobHash: string, source: MediaUploadSource): Promise<void>;
  downloadMedia(vaultId: string, blobHash: string, sink: MediaDownloadSink): Promise<boolean>;
  listSnapshots(vaultId: string): Promise<SnapshotObjectV2[]>;
  deleteSnapshot(vaultId: string, snapshotId: string): Promise<void>;
}

/** Random-access, bounded media source. No call may return more than `length` bytes. */
export interface MediaUploadSource {
  readonly byteLength: number;
  readonly contentHash: string;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Durable partial-file sink used by restartable ranged downloads. */
export interface MediaDownloadSink {
  byteLength(): Promise<number>;
  appendAndSync(bytes: Uint8Array): Promise<void>;
  reset(): Promise<void>;
  verifyAndPromote(expectedByteLength: number, expectedSha256: string): Promise<void>;
}

export interface CapturedJournalV2 {
  domain: SnapshotDomainV2;
  generation: number;
}

/**
 * The production adapter binds this interface to transaction-scoped
 * normalized-domain repositories; tests use an in-memory implementation.
 */
export interface SnapshotJournalStore {
  capture(): Promise<CapturedJournalV2>;
  applyMergedIfGeneration(
    domain: SnapshotDomainV2,
    expectedGeneration: number,
  ): Promise<boolean>;
}

export interface SnapshotMediaStore {
  hasVerified(blobHash: string): Promise<boolean>;
  openVerifiedSource(blobHash: string): Promise<MediaUploadSource | null>;
  openDownloadSink(blobHash: string): Promise<MediaDownloadSink>;
}

export interface BaseShadowFileStore {
  writeTempAndFsync(fileName: string, bytes: Uint8Array): Promise<void>;
  read(fileName: string): Promise<Uint8Array>;
  replaceAndFsync(tempFileName: string, finalFileName: string): Promise<void>;
  quarantine(fileName: string): Promise<void>;
  delete(fileName: string): Promise<void>;
}

export interface BaseShadowCheckpoint {
  vaultId: string;
  deviceId: string;
  shadowFormatVersion: 1;
  snapshotId: string;
  fileName: string;
  canonicalSha256: string;
  byteCount: number;
  committedGeneration: number;
}

export interface PendingPublication {
  vaultId: string;
  deviceId: string;
  snapshotId: string;
  deviceSequence: number;
  capturedGeneration: number;
  compressedBytes: Uint8Array;
  mediaHashes: string[];
  stage: PendingPublicationStage;
  createdAt: number;
  updatedAt: number;
}

export interface DurableSyncState {
  vaultId: string;
  deviceId: string;
  journalGeneration: number;
  settledGeneration: number;
  nextDeviceSequence: number;
  pauseReason: SyncAttentionReason | null;
  pauseContext: string | null;
  lastErrorClass: string | null;
}

export type SnapshotSyncResult =
  | { status: 'up-to-date'; actionableChanges: 0 }
  | { status: 'published'; snapshotId: string; actionableChanges: number }
  | { status: 'attention'; reason: SyncAttentionReason; actionableChanges: number }
  | {
      status: 'retry';
      reason: 'rate-limited' | 'wifi-only-media' | 'transient';
      actionableChanges: number;
    };

export interface BaseShadowV1 {
  format: 'tackbok-base-shadow';
  shadowFormatVersion: 1;
  protocolFormatVersion: 2;
  vaultId: string;
  snapshotId: string;
  acceptedDeviceHeads: ObservedDeviceHeadV2[];
  payload: JournalSnapshotPayloadV2;
}

export type SnapshotKillPoint =
  | 'after-local-mutation'
  | 'during-media-transfer'
  | 'after-candidate-persisted'
  | 'after-snapshot-uploaded'
  | 'after-snapshot-verified'
  | 'after-head-advanced'
  | 'during-remote-snapshot-download'
  | 'during-merge-application'
  | 'after-base-shadow-temp-fsynced'
  | 'after-base-shadow-readback'
  | 'after-base-shadow-renamed'
  | 'after-base-checkpoint-settled'
  | 'during-snapshot-cleanup';

export interface SnapshotSyncHooks {
  at?(point: SnapshotKillPoint): void | Promise<void>;
  beforeHeadRecheck?(): void | Promise<void>;
}
