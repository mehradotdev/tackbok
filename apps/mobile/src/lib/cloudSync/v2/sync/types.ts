import type {
  JournalSnapshotPayloadV2,
  ObservedDeviceHeadV2,
  SnapshotDomainV2,
} from '../types';

export type V2AttentionReason =
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

export type V2RecoveryAction =
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

/** Stable action IDs from ADR V7-0004; V7-4 supplies localized visible copy. */
export const V2_ATTENTION_RECOVERY_ACTION: Record<V2AttentionReason, V2RecoveryAction> = {
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

export type V2PendingStage =
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

export type V2ProviderErrorCode =
  | 'authorization-required'
  | 'quota-full'
  | 'permission-denied'
  | 'rate-limited'
  | 'wifi-only-media'
  | 'transient'
  | 'invalid-data';

export class V2ProviderError extends Error {
  constructor(
    readonly code: V2ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'V2ProviderError';
  }
}

export class V2LocalStorageError extends Error {
  constructor(
    readonly reason: Extract<
      V2AttentionReason,
      'local-storage-full' | 'local-media-unreadable' | 'normalized-model-not-ready'
    >,
    readonly errorClass: string,
  ) {
    super(errorClass);
    this.name = 'V2LocalStorageError';
  }
}

/** A completed download failed its native size/hash check; safe to retry from zero. */
export class V2MediaIntegrityError extends Error {
  constructor(readonly errorClass: string) {
    super(errorClass);
    this.name = 'V2MediaIntegrityError';
  }
}

export interface SnapshotV2Provider {
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
  uploadMedia(vaultId: string, blobHash: string, source: V2MediaUploadSource): Promise<void>;
  downloadMedia(vaultId: string, blobHash: string, sink: V2MediaDownloadSink): Promise<boolean>;
  listSnapshots(vaultId: string): Promise<SnapshotObjectV2[]>;
  deleteSnapshot(vaultId: string, snapshotId: string): Promise<void>;
}

/** Random-access, bounded media source. No call may return more than `length` bytes. */
export interface V2MediaUploadSource {
  readonly byteLength: number;
  readonly contentHash: string;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Durable partial-file sink used by restartable ranged downloads. */
export interface V2MediaDownloadSink {
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
 * V7-4 will bind this interface to the transaction-scoped normalized-domain
 * repositories. V7-2 deliberately exercises it without switching production.
 */
export interface SnapshotV2JournalStore {
  capture(): Promise<CapturedJournalV2>;
  applyMergedIfGeneration(
    domain: SnapshotDomainV2,
    expectedGeneration: number,
  ): Promise<boolean>;
}

export interface SnapshotV2MediaStore {
  hasVerified(blobHash: string): Promise<boolean>;
  openVerifiedSource(blobHash: string): Promise<V2MediaUploadSource | null>;
  openDownloadSink(blobHash: string): Promise<V2MediaDownloadSink>;
}

export interface BaseShadowFileStore {
  writeTempAndFsync(fileName: string, bytes: Uint8Array): Promise<void>;
  read(fileName: string): Promise<Uint8Array>;
  replaceAndFsync(tempFileName: string, finalFileName: string): Promise<void>;
  quarantine(fileName: string): Promise<void>;
  delete(fileName: string): Promise<void>;
}

export interface V2BaseShadowCheckpoint {
  vaultId: string;
  deviceId: string;
  shadowFormatVersion: 1;
  snapshotId: string;
  fileName: string;
  canonicalSha256: string;
  byteCount: number;
  committedGeneration: number;
}

export interface V2PendingPublication {
  vaultId: string;
  deviceId: string;
  snapshotId: string;
  deviceSequence: number;
  capturedGeneration: number;
  compressedBytes: Uint8Array;
  mediaHashes: string[];
  stage: V2PendingStage;
  createdAt: number;
  updatedAt: number;
}

export interface V2DurableState {
  vaultId: string;
  deviceId: string;
  journalGeneration: number;
  settledGeneration: number;
  nextDeviceSequence: number;
  pauseReason: V2AttentionReason | null;
  pauseContext: string | null;
  lastErrorClass: string | null;
}

export type V2SyncResult =
  | { status: 'up-to-date'; actionableChanges: 0 }
  | { status: 'published'; snapshotId: string; actionableChanges: number }
  | { status: 'attention'; reason: V2AttentionReason; actionableChanges: number }
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

export type V2KillPoint =
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

export interface V2SyncHooks {
  at?(point: V2KillPoint): void | Promise<void>;
  beforeHeadRecheck?(): void | Promise<void>;
}
