import type {
  V2AttentionReason,
  V2BaseShadowCheckpoint,
  V2DurableState,
  V2PendingPublication,
  V2PendingStage,
} from './types';

export interface V2SyncDatabase {
  execSync(source: string): void;
  getFirstSync<T>(source: string, ...params: unknown[]): T | null;
  getAllSync<T>(source: string, ...params: unknown[]): T[];
  runSync(source: string, ...params: unknown[]): unknown;
}

const STAGE_ORDER: Record<V2PendingStage, number> = {
  'candidate-persisted': 0,
  'snapshot-uploaded': 1,
  'snapshot-verified': 2,
  'head-advanced': 3,
  'domain-applied': 4,
};

interface StateRow {
  vault_id: string;
  device_id: string;
  journal_generation: number;
  settled_generation: number;
  next_device_sequence: number;
  pause_reason: V2AttentionReason | null;
  pause_context_json: string | null;
  last_error_class: string | null;
}

interface PendingRow {
  vault_id: string;
  device_id: string;
  snapshot_id: string;
  device_sequence: number;
  captured_generation: number;
  compressed_bytes: Uint8Array;
  media_hashes_json: string;
  stage: V2PendingStage;
  created_at: number;
  updated_at: number;
}

interface BaseRow {
  vault_id: string;
  device_id: string;
  shadow_format_version: 1;
  snapshot_id: string;
  file_name: string;
  canonical_sha256: string;
  byte_count: number;
  committed_generation: number;
}

function asBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
}

export class SQLiteV2SyncStateStore {
  constructor(
    private readonly database: V2SyncDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  private transaction<T>(operation: () => T): T {
    this.database.execSync('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.execSync('COMMIT');
      return result;
    } catch (error) {
      this.database.execSync('ROLLBACK');
      throw error;
    }
  }

  private ensureStateRow(vaultId: string, deviceId: string): void {
    this.database.runSync(
      `INSERT INTO cloud_v2_sync_state(
         vault_id, device_id, journal_generation, settled_generation,
         next_device_sequence, updated_at
       ) VALUES (?, ?, 0, 0, 1, ?)
       ON CONFLICT(vault_id, device_id) DO NOTHING`,
      vaultId,
      deviceId,
      this.now(),
    );
  }

  loadState(vaultId: string, deviceId: string): V2DurableState {
    this.ensureStateRow(vaultId, deviceId);
    const row = this.database.getFirstSync<StateRow>(
      'SELECT * FROM cloud_v2_sync_state WHERE vault_id = ? AND device_id = ?',
      vaultId,
      deviceId,
    );
    if (!row) throw new Error('Failed to initialize protocol-v2 sync state');
    return {
      vaultId: row.vault_id,
      deviceId: row.device_id,
      journalGeneration: row.journal_generation,
      settledGeneration: row.settled_generation,
      nextDeviceSequence: row.next_device_sequence,
      pauseReason: row.pause_reason,
      pauseContext: row.pause_context_json,
      lastErrorClass: row.last_error_class,
    };
  }

  markDirty(vaultId: string, deviceId: string, increments = 1): number {
    if (!Number.isSafeInteger(increments) || increments < 1) {
      throw new Error('Dirty-generation increment must be a positive safe integer');
    }
    return this.transaction(() => {
      this.ensureStateRow(vaultId, deviceId);
      this.database.runSync(
        `UPDATE cloud_v2_sync_state
         SET journal_generation = journal_generation + ?, updated_at = ?
         WHERE vault_id = ? AND device_id = ?`,
        increments,
        this.now(),
        vaultId,
        deviceId,
      );
      return this.loadState(vaultId, deviceId).journalGeneration;
    });
  }

  /** Alpha transition republishes local state without importing v1 cloud internals. */
  transitionFromV1LocalOnly(vaultId: string, deviceId: string): number {
    const state = this.loadState(vaultId, deviceId);
    return state.journalGeneration > state.settledGeneration
      ? state.journalGeneration
      : this.markDirty(vaultId, deviceId);
  }

  ensureNextSequenceAtLeast(vaultId: string, deviceId: string, minimum: number): void {
    this.ensureStateRow(vaultId, deviceId);
    this.database.runSync(
      `UPDATE cloud_v2_sync_state
       SET next_device_sequence = MAX(next_device_sequence, ?), updated_at = ?
       WHERE vault_id = ? AND device_id = ?`,
      minimum,
      this.now(),
      vaultId,
      deviceId,
    );
  }

  loadPending(vaultId: string, deviceId: string): V2PendingPublication | null {
    const row = this.database.getFirstSync<PendingRow>(
      'SELECT * FROM cloud_v2_pending_publication WHERE vault_id = ? AND device_id = ?',
      vaultId,
      deviceId,
    );
    return row ? {
      vaultId: row.vault_id,
      deviceId: row.device_id,
      snapshotId: row.snapshot_id,
      deviceSequence: row.device_sequence,
      capturedGeneration: row.captured_generation,
      compressedBytes: asBytes(row.compressed_bytes),
      mediaHashes: JSON.parse(row.media_hashes_json) as string[],
      stage: row.stage,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : null;
  }

  createPending(
    vaultId: string,
    deviceId: string,
    capturedGeneration: number,
    build: (deviceSequence: number) => {
      snapshotId: string;
      compressedBytes: Uint8Array;
      mediaHashes: string[];
    },
  ): V2PendingPublication {
    return this.transaction(() => {
      this.ensureStateRow(vaultId, deviceId);
      const existing = this.loadPending(vaultId, deviceId);
      if (existing) return existing;
      const state = this.loadState(vaultId, deviceId);
      if (capturedGeneration > state.journalGeneration) {
        throw new Error('Candidate captured a future journal generation');
      }
      const candidate = build(state.nextDeviceSequence);
      const timestamp = this.now();
      this.database.runSync(
        `INSERT INTO cloud_v2_pending_publication(
           vault_id, device_id, snapshot_id, device_sequence, captured_generation,
           compressed_bytes, media_hashes_json, stage, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate-persisted', ?, ?)`,
        vaultId,
        deviceId,
        candidate.snapshotId,
        state.nextDeviceSequence,
        capturedGeneration,
        candidate.compressedBytes,
        JSON.stringify([...new Set(candidate.mediaHashes)].sort()),
        timestamp,
        timestamp,
      );
      this.database.runSync(
        `UPDATE cloud_v2_sync_state
         SET next_device_sequence = ?, updated_at = ?
         WHERE vault_id = ? AND device_id = ?`,
        state.nextDeviceSequence + 1,
        timestamp,
        vaultId,
        deviceId,
      );
      return this.loadPending(vaultId, deviceId)!;
    });
  }

  advancePending(
    vaultId: string,
    deviceId: string,
    snapshotId: string,
    stage: V2PendingStage,
  ): V2PendingPublication {
    return this.transaction(() => {
      const pending = this.loadPending(vaultId, deviceId);
      if (!pending || pending.snapshotId !== snapshotId) {
        throw new Error('Pending protocol-v2 publication changed unexpectedly');
      }
      const requestedOrder = STAGE_ORDER[stage];
      const currentOrder = STAGE_ORDER[pending.stage];
      if (requestedOrder > currentOrder + 1) {
        throw new Error('Pending protocol-v2 publication cannot skip a verification stage');
      }
      if (requestedOrder === currentOrder + 1) {
        this.database.runSync(
          `UPDATE cloud_v2_pending_publication SET stage = ?, updated_at = ?
           WHERE vault_id = ? AND device_id = ? AND snapshot_id = ?`,
          stage,
          this.now(),
          vaultId,
          deviceId,
          snapshotId,
        );
      }
      return this.loadPending(vaultId, deviceId)!;
    });
  }

  setPause(
    vaultId: string,
    deviceId: string,
    reason: V2AttentionReason,
    errorClass: string,
    context: string | null = null,
  ): void {
    this.ensureStateRow(vaultId, deviceId);
    this.database.runSync(
      `UPDATE cloud_v2_sync_state SET pause_reason = ?, pause_context_json = ?,
         last_error_class = ?, updated_at = ? WHERE vault_id = ? AND device_id = ?`,
      reason,
      context,
      errorClass,
      this.now(),
      vaultId,
      deviceId,
    );
  }

  setRetryError(vaultId: string, deviceId: string, errorClass: string): void {
    this.ensureStateRow(vaultId, deviceId);
    this.database.runSync(
      `UPDATE cloud_v2_sync_state SET last_error_class = ?, updated_at = ?
       WHERE vault_id = ? AND device_id = ?`,
      errorClass,
      this.now(),
      vaultId,
      deviceId,
    );
  }

  clearPause(vaultId: string, deviceId: string, reason?: V2AttentionReason): void {
    this.ensureStateRow(vaultId, deviceId);
    this.database.runSync(
      `UPDATE cloud_v2_sync_state SET pause_reason = NULL, pause_context_json = NULL,
         last_error_class = NULL, updated_at = ?
       WHERE vault_id = ? AND device_id = ?${reason ? ' AND pause_reason = ?' : ''}`,
      this.now(),
      vaultId,
      deviceId,
      ...(reason ? [reason] : []),
    );
  }

  loadBaseCheckpoint(vaultId: string, deviceId: string): V2BaseShadowCheckpoint | null {
    const row = this.database.getFirstSync<BaseRow>(
      'SELECT * FROM cloud_v2_base_shadow WHERE vault_id = ? AND device_id = ?',
      vaultId,
      deviceId,
    );
    return row ? {
      vaultId: row.vault_id,
      deviceId: row.device_id,
      shadowFormatVersion: row.shadow_format_version,
      snapshotId: row.snapshot_id,
      fileName: row.file_name,
      canonicalSha256: row.canonical_sha256,
      byteCount: row.byte_count,
      committedGeneration: row.committed_generation,
    } : null;
  }

  settleWithBase(
    checkpoint: V2BaseShadowCheckpoint,
    capturedGeneration: number,
  ): { dirty: boolean; oldFileName: string | null } {
    return this.transaction(() => {
      const pending = this.loadPending(checkpoint.vaultId, checkpoint.deviceId);
      if (!pending || pending.snapshotId !== checkpoint.snapshotId ||
          STAGE_ORDER[pending.stage] < STAGE_ORDER['domain-applied']) {
        throw new Error('Cannot settle an incomplete protocol-v2 publication');
      }
      const old = this.loadBaseCheckpoint(checkpoint.vaultId, checkpoint.deviceId);
      this.database.runSync(
        `INSERT INTO cloud_v2_base_shadow(
           vault_id, device_id, shadow_format_version, snapshot_id, file_name,
           canonical_sha256, byte_count, committed_generation, updated_at
         ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(vault_id, device_id) DO UPDATE SET
           shadow_format_version = excluded.shadow_format_version,
           snapshot_id = excluded.snapshot_id,
           file_name = excluded.file_name,
           canonical_sha256 = excluded.canonical_sha256,
           byte_count = excluded.byte_count,
           committed_generation = excluded.committed_generation,
           updated_at = excluded.updated_at`,
        checkpoint.vaultId,
        checkpoint.deviceId,
        checkpoint.snapshotId,
        checkpoint.fileName,
        checkpoint.canonicalSha256,
        checkpoint.byteCount,
        capturedGeneration,
        this.now(),
      );
      if (old && old.fileName !== checkpoint.fileName) {
        this.database.runSync(
          `INSERT INTO cloud_v2_shadow_reaper(file_name, queued_at) VALUES (?, ?)
           ON CONFLICT(file_name) DO NOTHING`,
          old.fileName,
          this.now(),
        );
      }
      this.database.runSync(
        `UPDATE cloud_v2_sync_state
         SET settled_generation = MAX(settled_generation, ?), updated_at = ?
         WHERE vault_id = ? AND device_id = ?`,
        capturedGeneration,
        this.now(),
        checkpoint.vaultId,
        checkpoint.deviceId,
      );
      this.database.runSync(
        'DELETE FROM cloud_v2_pending_publication WHERE vault_id = ? AND device_id = ?',
        checkpoint.vaultId,
        checkpoint.deviceId,
      );
      const state = this.loadState(checkpoint.vaultId, checkpoint.deviceId);
      return {
        dirty: state.journalGeneration > state.settledGeneration,
        oldFileName: old?.fileName ?? null,
      };
    });
  }

  listShadowReaperFiles(): string[] {
    return this.database.getAllSync<{ file_name: string }>(
      'SELECT file_name FROM cloud_v2_shadow_reaper ORDER BY queued_at, file_name',
    ).map((row) => row.file_name);
  }

  completeShadowReap(fileName: string): void {
    this.database.runSync('DELETE FROM cloud_v2_shadow_reaper WHERE file_name = ?', fileName);
  }
}
