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
  | 'merge-failed'
  | 'local-storage-full'
  | 'provider-quota-full'
  | 'provider-permission-denied'
  | 'provider-request-rejected'
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
export const ATTENTION_RECOVERY_ACTION: Record<SyncAttentionReason, SyncRecoveryAction> =
  {
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
    // Running the same merge again fails again; see the engine's retry rule.
    'merge-failed': 'export-repair-backup',
    'local-storage-full': 'free-device-storage',
    'provider-quota-full': 'manage-drive-storage',
    'provider-permission-denied': 'reconnect-google-drive',
    'provider-request-rejected': 'update-tackbok',
    'missing-media': 'retry-missing-media',
    'local-media-unreadable': 'locate-retry-attachment',
    'normalized-model-not-ready': 'retry-journal-preparation',
    'backup-deleted': 'acknowledge-disconnect',
    'journal-deleted': 'review-erase-device',
    'purge-incomplete': 'resume-deletion',
    'cleanup-inconsistent': 'verify-backup-health',
  };

/**
 * A device head (#185). `major` and `required` follow the snapshot's
 * versioning rules: an unknown major version or required feature pauses sync
 * and asks for an update before any snapshot is downloaded, and nothing is
 * written or deleted.
 */
export interface DeviceHead {
  format: 'tackbok-head';
  major: number;
  /** Required features of the snapshot it points to. */
  required: string[];
  vaultId: string;
  deviceId: string;
  deviceSequence: number;
  snapshotId: string;
  updatedAt: number;
}

/**
 * A head as stored on the provider: canonical JSON whose format and shape
 * the engine has not checked yet (`V2SyncEngine.readHeads`).
 */
export interface StoredDeviceHead {
  format: string;
  vaultId: string;
  deviceId: string;
  deviceSequence: number;
  snapshotId: string;
  updatedAt: number;
}

export interface ListedDeviceHead {
  physicalId: string;
  head: StoredDeviceHead;
  /** Compressed size of the head's snapshot when the provider already knows it. */
  snapshotBytes?: number;
}

export interface SnapshotObject {
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
  | 'invalid-request'
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
  listHeads(vaultId: string, refresh?: boolean): Promise<ListedDeviceHead[]>;
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
  updateDeviceHead(vaultId: string, head: DeviceHead): Promise<void>;
  hasMediaBatch(vaultId: string, blobHashes: readonly string[]): Promise<Set<string>>;
  /**
   * False when a transfer policy would refuse media uploads now, such as
   * Wi-Fi-only media on mobile data. Uploads report the refusal themselves;
   * this only spares reading files that would wait anyway.
   */
  mediaTransfersAllowed?(): Promise<boolean>;
  uploadMedia(
    vaultId: string,
    blobHash: string,
    source: MediaUploadSource,
  ): Promise<void>;
  downloadMedia(
    vaultId: string,
    blobHash: string,
    sink: MediaDownloadSink,
  ): Promise<boolean>;
  listSnapshots(vaultId: string): Promise<SnapshotObject[]>;
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

export interface SnapshotMediaStore {
  hasVerified(blobHash: string): Promise<boolean>;
  openVerifiedSource(blobHash: string): Promise<MediaUploadSource | null>;
  openDownloadSink(blobHash: string): Promise<MediaDownloadSink>;
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

/** New attachments left out of the backup until uploads may run on Wi-Fi. */
interface DeferredMediaResult {
  deferredMediaCount: number;
  /**
   * Other devices' heads left unread because their clock is more
   * than 7 days ahead of this one (read again by later passes).
   */
  refusedHeads?: number;
}

export type SnapshotSyncResult =
  | ({ status: 'up-to-date'; actionableChanges: 0 } & DeferredMediaResult)
  | ({
      status: 'pulled';
      snapshotId: string;
      actionableChanges: number;
    } & DeferredMediaResult)
  | ({
      status: 'published';
      snapshotId: string;
      actionableChanges: number;
    } & DeferredMediaResult)
  | { status: 'attention'; reason: SyncAttentionReason; actionableChanges: number }
  | {
      status: 'retry';
      reason: 'rate-limited' | 'wifi-only-media' | 'transient';
      actionableChanges: number;
    };

export type SnapshotKillPoint =
  | 'after-local-mutation'
  | 'during-media-inspection'
  | 'during-media-transfer'
  | 'after-snapshot-uploaded'
  | 'after-snapshot-verified'
  | 'after-head-advanced'
  | 'during-remote-snapshot-download'
  | 'during-merge-application'
  | 'during-snapshot-cleanup';

/**
 * Work the engine is about to start. Reported before the work, unlike kill
 * points, so progress never describes work that has already finished.
 */
export type SnapshotSyncActivity =
  | 'preparing-local-changes'
  | 'reading-remote-snapshot'
  | 'publishing-local-snapshot'
  | 'applying-remote-snapshot';

/** What the progress line describes. Finer than activity: media has its own phases. */
export type SyncProgressPhase =
  | 'preparing'
  | 'checking'
  | 'downloading'
  | 'merging'
  | 'uploading'
  | 'uploading-media'
  | 'downloading-media';

export type SyncWaitReason =
  | 'rate-limited'
  | 'retry-backoff'
  | 'offline'
  | 'wifi-only-media';

export interface SyncProgressCount {
  done: number;
  total: number;
}

/**
 * Progress reported by the engine, provider and transport. Like activity, a
 * plan or phase is reported before its work starts. Display only: progress
 * never changes what a pass does.
 */
export type SyncProgressReport =
  /** A pass starts or ends; progress from the previous pass is dropped. */
  | { type: 'pass'; state: 'start' | 'end' }
  /** Work for a phase is known; resets that phase's counts and makes it current. */
  | {
      type: 'plan';
      phase: SyncProgressPhase;
      items?: SyncProgressCount;
      bytesTotal?: number;
    }
  /** Work continues in a phase whose counts are kept, such as media directions. */
  | { type: 'phase'; phase: SyncProgressPhase }
  /** One planned item in `phase` finished. */
  | { type: 'item'; phase: SyncProgressPhase }
  /** Bytes moved so far for one object, counted toward the current phase. */
  | { type: 'bytes'; key: string; done: number }
  /** A wait started (with its end time when known) or ended (`reason: null`). */
  | { type: 'wait'; reason: SyncWaitReason | null; until?: number };

export type SyncProgressListener = (report: SyncProgressReport) => void;

/**
 * Progress is display only, so a failing listener is logged and never thrown
 * into the sync work that reported it.
 */
export function isolateProgress(
  listener: SyncProgressListener | undefined,
): SyncProgressListener {
  return (report) => {
    try {
      listener?.(report);
    } catch (error) {
      console.warn('Cloud sync progress listener failed', error);
    }
  };
}

export interface SnapshotSyncHooks {
  at?(point: SnapshotKillPoint): void | Promise<void>;
  activity?(activity: SnapshotSyncActivity): void;
  progress?(report: SyncProgressReport): void;
}
