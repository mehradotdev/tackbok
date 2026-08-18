import type { DeviceHeadV2 } from '../sync/types';
import type { V2SyncDatabase } from '../sync/sqliteState';

export type DriveV2ObjectKind = 'snapshot' | 'head' | 'media' | 'revocation';

export interface DriveV2FileRecord {
  fileId: string;
  logicalKey: string;
  kind: DriveV2ObjectKind;
  contentSha256: string;
  byteCount: number;
  createdAt: number | null;
  head: DeviceHeadV2 | null;
}

export interface DriveV2DiscoveryState {
  cursor: string | null;
  inventoryComplete: boolean;
  retryNotBefore: number;
}

export interface DriveV2UploadSession {
  logicalKey: string;
  contentSha256: string;
  uri: string;
  expiresAt: number;
  byteCount: number;
  uploadedBytes: number;
}

export interface DriveV2ProviderStateStore {
  loadDiscovery(vaultId: string): DriveV2DiscoveryState;
  replaceInitialInventory(
    vaultId: string,
    files: readonly DriveV2FileRecord[],
    cursor: string,
  ): void;
  applyChangePage(
    vaultId: string,
    files: readonly DriveV2FileRecord[],
    removedFileIds: readonly string[],
    cursor: string,
  ): void;
  resetDiscovery(vaultId: string): void;
  setRetryNotBefore(vaultId: string, timestamp: number): void;
  listKind(vaultId: string, kind: DriveV2ObjectKind): DriveV2FileRecord[];
  listKey(vaultId: string, logicalKey: string): DriveV2FileRecord[];
  upsertFile(vaultId: string, file: DriveV2FileRecord): void;
  removeFile(vaultId: string, fileId: string): void;
  getUploadSession(
    vaultId: string,
    logicalKey: string,
    contentSha256: string,
  ): DriveV2UploadSession | null;
  setUploadSession(vaultId: string, session: DriveV2UploadSession): void;
  deleteUploadSession(vaultId: string, logicalKey: string, contentSha256: string): void;
}

function cloneRecord(value: DriveV2FileRecord): DriveV2FileRecord {
  return { ...value, head: value.head ? { ...value.head } : null };
}

export class MemoryDriveV2ProviderStateStore implements DriveV2ProviderStateStore {
  private readonly discovery = new Map<string, DriveV2DiscoveryState>();
  private readonly files = new Map<string, DriveV2FileRecord>();
  private readonly sessions = new Map<string, DriveV2UploadSession>();

  private fileKey(vaultId: string, fileId: string): string {
    return `${vaultId}\0${fileId}`;
  }

  private sessionKey(vaultId: string, logicalKey: string, contentSha256: string): string {
    return `${vaultId}\0${logicalKey}\0${contentSha256}`;
  }

  loadDiscovery(vaultId: string): DriveV2DiscoveryState {
    return { ...(this.discovery.get(vaultId) ?? {
      cursor: null, inventoryComplete: false, retryNotBefore: 0,
    }) };
  }

  replaceInitialInventory(
    vaultId: string,
    files: readonly DriveV2FileRecord[],
    cursor: string,
  ): void {
    for (const [key, value] of this.files) {
      if (key.startsWith(`${vaultId}\0`) &&
          (value.kind === 'head' || value.kind === 'snapshot')) {
        this.files.delete(key);
      }
    }
    for (const file of files) this.upsertFile(vaultId, file);
    const retryNotBefore = this.loadDiscovery(vaultId).retryNotBefore;
    this.discovery.set(vaultId, { cursor, inventoryComplete: true, retryNotBefore });
  }

  applyChangePage(
    vaultId: string,
    files: readonly DriveV2FileRecord[],
    removedFileIds: readonly string[],
    cursor: string,
  ): void {
    for (const fileId of removedFileIds) this.removeFile(vaultId, fileId);
    for (const file of files) this.upsertFile(vaultId, file);
    const retryNotBefore = this.loadDiscovery(vaultId).retryNotBefore;
    this.discovery.set(vaultId, { cursor, inventoryComplete: true, retryNotBefore });
  }

  resetDiscovery(vaultId: string): void {
    const retryNotBefore = this.loadDiscovery(vaultId).retryNotBefore;
    this.discovery.set(vaultId, { cursor: null, inventoryComplete: false, retryNotBefore });
    for (const [key, value] of this.files) {
      if (key.startsWith(`${vaultId}\0`) &&
          (value.kind === 'head' || value.kind === 'snapshot')) {
        this.files.delete(key);
      }
    }
  }

  setRetryNotBefore(vaultId: string, timestamp: number): void {
    const current = this.loadDiscovery(vaultId);
    this.discovery.set(vaultId, { ...current, retryNotBefore: timestamp });
  }

  listKind(vaultId: string, kind: DriveV2ObjectKind): DriveV2FileRecord[] {
    return [...this.files.entries()]
      .filter(([key, value]) => key.startsWith(`${vaultId}\0`) && value.kind === kind)
      .map(([, value]) => cloneRecord(value))
      .sort((left, right) => left.logicalKey.localeCompare(right.logicalKey) ||
        left.fileId.localeCompare(right.fileId));
  }

  listKey(vaultId: string, logicalKey: string): DriveV2FileRecord[] {
    return [...this.files.entries()]
      .filter(([key, value]) => key.startsWith(`${vaultId}\0`) &&
        value.logicalKey === logicalKey)
      .map(([, value]) => cloneRecord(value))
      .sort((left, right) => left.fileId.localeCompare(right.fileId));
  }

  upsertFile(vaultId: string, file: DriveV2FileRecord): void {
    this.files.set(this.fileKey(vaultId, file.fileId), cloneRecord(file));
  }

  removeFile(vaultId: string, fileId: string): void {
    this.files.delete(this.fileKey(vaultId, fileId));
  }

  getUploadSession(
    vaultId: string,
    logicalKey: string,
    contentSha256: string,
  ): DriveV2UploadSession | null {
    const value = this.sessions.get(this.sessionKey(vaultId, logicalKey, contentSha256));
    return value ? { ...value } : null;
  }

  setUploadSession(vaultId: string, session: DriveV2UploadSession): void {
    this.sessions.set(
      this.sessionKey(vaultId, session.logicalKey, session.contentSha256),
      { ...session },
    );
  }

  deleteUploadSession(vaultId: string, logicalKey: string, contentSha256: string): void {
    this.sessions.delete(this.sessionKey(vaultId, logicalKey, contentSha256));
  }
}

interface DiscoveryRow {
  change_cursor: string | null;
  inventory_complete: number;
  retry_not_before: number;
}

interface FileRow {
  file_id: string;
  logical_key: string;
  object_kind: DriveV2ObjectKind;
  content_sha256: string;
  byte_count: number;
  created_at: number | null;
  head_json: string | null;
}

interface SessionRow {
  logical_key: string;
  content_sha256: string;
  session_uri: string;
  expires_at: number;
  byte_count: number;
  uploaded_bytes: number;
}

export class SQLiteDriveV2ProviderStateStore implements DriveV2ProviderStateStore {
  constructor(
    private readonly database: V2SyncDatabase,
    private readonly connectionId: string,
    private readonly now: () => number = Date.now,
  ) {
    if (!connectionId) throw new Error('Drive provider connection ID is required');
  }

  loadDiscovery(vaultId: string): DriveV2DiscoveryState {
    const row = this.database.getFirstSync<DiscoveryRow>(
      `SELECT change_cursor, inventory_complete, retry_not_before
       FROM cloud_v2_drive_state
       WHERE connection_id = ? AND vault_id = ?`,
      this.connectionId,
      vaultId,
    );
    return row
      ? {
          cursor: row.change_cursor,
          inventoryComplete: row.inventory_complete === 1,
          retryNotBefore: row.retry_not_before,
        }
      : { cursor: null, inventoryComplete: false, retryNotBefore: 0 };
  }

  replaceInitialInventory(
    vaultId: string,
    files: readonly DriveV2FileRecord[],
    cursor: string,
  ): void {
    this.transaction(() => {
      this.database.runSync(
        `DELETE FROM cloud_v2_drive_objects
         WHERE connection_id = ? AND vault_id = ?
           AND object_kind IN ('head', 'snapshot')`,
        this.connectionId,
        vaultId,
      );
      for (const file of files) this.upsertFile(vaultId, file);
      this.writeDiscovery(vaultId, cursor, true);
    });
  }

  applyChangePage(
    vaultId: string,
    files: readonly DriveV2FileRecord[],
    removedFileIds: readonly string[],
    cursor: string,
  ): void {
    this.transaction(() => {
      for (const fileId of removedFileIds) this.removeFile(vaultId, fileId);
      for (const file of files) this.upsertFile(vaultId, file);
      this.writeDiscovery(vaultId, cursor, true);
    });
  }

  resetDiscovery(vaultId: string): void {
    this.transaction(() => {
      this.database.runSync(
        `DELETE FROM cloud_v2_drive_objects
         WHERE connection_id = ? AND vault_id = ?
           AND object_kind IN ('head', 'snapshot')`,
        this.connectionId,
        vaultId,
      );
      this.writeDiscovery(vaultId, null, false);
    });
  }

  setRetryNotBefore(vaultId: string, timestamp: number): void {
    const current = this.loadDiscovery(vaultId);
    this.database.runSync(
      `INSERT INTO cloud_v2_drive_state(
         connection_id, vault_id, change_cursor, inventory_complete,
         retry_not_before, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(connection_id, vault_id) DO UPDATE SET
         retry_not_before = excluded.retry_not_before,
         updated_at = excluded.updated_at`,
      this.connectionId,
      vaultId,
      current.cursor,
      current.inventoryComplete ? 1 : 0,
      timestamp,
      this.now(),
    );
  }

  listKind(vaultId: string, kind: DriveV2ObjectKind): DriveV2FileRecord[] {
    return this.database.getAllSync<FileRow>(
      `SELECT file_id, logical_key, object_kind, content_sha256,
              byte_count, created_at, head_json
       FROM cloud_v2_drive_objects
       WHERE connection_id = ? AND vault_id = ? AND object_kind = ?
       ORDER BY logical_key, file_id`,
      this.connectionId,
      vaultId,
      kind,
    ).map((row) => this.fileFromRow(row));
  }

  listKey(vaultId: string, logicalKey: string): DriveV2FileRecord[] {
    return this.database.getAllSync<FileRow>(
      `SELECT file_id, logical_key, object_kind, content_sha256,
              byte_count, created_at, head_json
       FROM cloud_v2_drive_objects
       WHERE connection_id = ? AND vault_id = ? AND logical_key = ?
       ORDER BY file_id`,
      this.connectionId,
      vaultId,
      logicalKey,
    ).map((row) => this.fileFromRow(row));
  }

  upsertFile(vaultId: string, file: DriveV2FileRecord): void {
    this.database.runSync(
      `INSERT INTO cloud_v2_drive_objects(
         connection_id, vault_id, file_id, logical_key, object_kind,
         content_sha256, byte_count, created_at, head_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(connection_id, vault_id, file_id) DO UPDATE SET
         logical_key = excluded.logical_key,
         object_kind = excluded.object_kind,
         content_sha256 = excluded.content_sha256,
         byte_count = excluded.byte_count,
         created_at = excluded.created_at,
         head_json = excluded.head_json,
         updated_at = excluded.updated_at`,
      this.connectionId,
      vaultId,
      file.fileId,
      file.logicalKey,
      file.kind,
      file.contentSha256,
      file.byteCount,
      file.createdAt,
      file.head ? JSON.stringify(file.head) : null,
      this.now(),
    );
  }

  removeFile(vaultId: string, fileId: string): void {
    this.database.runSync(
      `DELETE FROM cloud_v2_drive_objects
       WHERE connection_id = ? AND vault_id = ? AND file_id = ?`,
      this.connectionId,
      vaultId,
      fileId,
    );
  }

  getUploadSession(
    vaultId: string,
    logicalKey: string,
    contentSha256: string,
  ): DriveV2UploadSession | null {
    const row = this.database.getFirstSync<SessionRow>(
      `SELECT logical_key, content_sha256, session_uri, expires_at, byte_count,
              uploaded_bytes
       FROM cloud_v2_drive_upload_sessions
       WHERE connection_id = ? AND vault_id = ?
         AND logical_key = ? AND content_sha256 = ?`,
      this.connectionId,
      vaultId,
      logicalKey,
      contentSha256,
    );
    return row ? {
      logicalKey: row.logical_key,
      contentSha256: row.content_sha256,
      uri: row.session_uri,
      expiresAt: row.expires_at,
      byteCount: row.byte_count,
      uploadedBytes: row.uploaded_bytes,
    } : null;
  }

  setUploadSession(vaultId: string, session: DriveV2UploadSession): void {
    this.database.runSync(
      `INSERT INTO cloud_v2_drive_upload_sessions(
         connection_id, vault_id, logical_key, content_sha256,
         session_uri, expires_at, byte_count, uploaded_bytes, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(connection_id, vault_id, logical_key, content_sha256) DO UPDATE SET
         session_uri = excluded.session_uri,
         expires_at = excluded.expires_at,
         byte_count = excluded.byte_count,
         uploaded_bytes = excluded.uploaded_bytes,
         updated_at = excluded.updated_at`,
      this.connectionId,
      vaultId,
      session.logicalKey,
      session.contentSha256,
      session.uri,
      session.expiresAt,
      session.byteCount,
      session.uploadedBytes,
      this.now(),
    );
  }

  deleteUploadSession(vaultId: string, logicalKey: string, contentSha256: string): void {
    this.database.runSync(
      `DELETE FROM cloud_v2_drive_upload_sessions
       WHERE connection_id = ? AND vault_id = ?
         AND logical_key = ? AND content_sha256 = ?`,
      this.connectionId,
      vaultId,
      logicalKey,
      contentSha256,
    );
  }

  private writeDiscovery(vaultId: string, cursor: string | null, complete: boolean): void {
    this.database.runSync(
      `INSERT INTO cloud_v2_drive_state(
         connection_id, vault_id, change_cursor, inventory_complete,
         retry_not_before, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(connection_id, vault_id) DO UPDATE SET
         change_cursor = excluded.change_cursor,
         inventory_complete = excluded.inventory_complete,
         updated_at = excluded.updated_at`,
      this.connectionId,
      vaultId,
      cursor,
      complete ? 1 : 0,
      this.loadDiscovery(vaultId).retryNotBefore,
      this.now(),
    );
  }

  private fileFromRow(row: FileRow): DriveV2FileRecord {
    return {
      fileId: row.file_id,
      logicalKey: row.logical_key,
      kind: row.object_kind,
      contentSha256: row.content_sha256,
      byteCount: row.byte_count,
      createdAt: row.created_at,
      head: row.head_json ? JSON.parse(row.head_json) as DeviceHeadV2 : null,
    };
  }

  private transaction(operation: () => void): void {
    this.database.execSync('BEGIN IMMEDIATE');
    try {
      operation();
      this.database.execSync('COMMIT');
    } catch (error) {
      this.database.execSync('ROLLBACK');
      throw error;
    }
  }
}
