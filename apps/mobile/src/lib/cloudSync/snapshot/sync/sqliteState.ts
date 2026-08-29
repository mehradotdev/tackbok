import type {
  SyncAttentionReason,
  BaseShadowCheckpoint,
  DurableSyncState,
  PendingPublication,
  PendingPublicationStage,
} from './types';

export interface SyncDatabase {
  execSync(source: string): void;
  getFirstSync<T>(source: string, ...params: unknown[]): T | null;
  getAllSync<T>(source: string, ...params: unknown[]): T[];
  runSync(source: string, ...params: unknown[]): unknown;
}

const STAGE_ORDER: Record<PendingPublicationStage, number> = {
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
  pause_reason: SyncAttentionReason | null;
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
  stage: PendingPublicationStage;
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

export class SQLiteSyncStateStore {
  constructor(
    private readonly database: SyncDatabase,
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
      `INSERT INTO cloud_sync_state(
         vault_id, device_id, journal_generation, settled_generation,
         next_device_sequence, updated_at
       ) VALUES (?, ?, 0, 0, 1, ?)
       ON CONFLICT(vault_id, device_id) DO NOTHING`,
      vaultId,
      deviceId,
      this.now(),
    );
  }

  loadState(vaultId: string, deviceId: string): DurableSyncState {
    this.ensureStateRow(vaultId, deviceId);
    const row = this.database.getFirstSync<StateRow>(
      'SELECT * FROM cloud_sync_state WHERE vault_id = ? AND device_id = ?',
      vaultId,
      deviceId,
    );
    if (!row) throw new Error('Failed to initialize snapshot sync state');
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
        `UPDATE cloud_sync_state
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

  ensureNextSequenceAtLeast(vaultId: string, deviceId: string, minimum: number): void {
    this.ensureStateRow(vaultId, deviceId);
    this.database.runSync(
      `UPDATE cloud_sync_state
       SET next_device_sequence = MAX(next_device_sequence, ?), updated_at = ?
       WHERE vault_id = ? AND device_id = ?`,
      minimum,
      this.now(),
      vaultId,
      deviceId,
    );
  }

  loadPending(vaultId: string, deviceId: string): PendingPublication | null {
    const row = this.database.getFirstSync<PendingRow>(
      'SELECT * FROM cloud_pending_publication WHERE vault_id = ? AND device_id = ?',
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
  ): PendingPublication {
    this.ensureStateRow(vaultId, deviceId);
    const existing = this.loadPending(vaultId, deviceId);
    if (existing) return existing;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const planned = this.loadState(vaultId, deviceId);
      if (capturedGeneration > planned.journalGeneration) {
        throw new Error('Candidate captured a future journal generation');
      }
      // Canonicalization and gzip can be expensive. Keep them outside the
      // BEGIN IMMEDIATE section, then re-check the reserved sequence inside.
      const candidate = build(planned.nextDeviceSequence);
      const persisted = this.transaction((): PendingPublication | null => {
        const concurrent = this.loadPending(vaultId, deviceId);
        if (concurrent) return concurrent;
        const current = this.loadState(vaultId, deviceId);
        if (current.nextDeviceSequence !== planned.nextDeviceSequence) return null;
        const timestamp = this.now();
        this.database.runSync(
          `INSERT INTO cloud_pending_publication(
             vault_id, device_id, snapshot_id, device_sequence, captured_generation,
             compressed_bytes, media_hashes_json, stage, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate-persisted', ?, ?)`,
          vaultId,
          deviceId,
          candidate.snapshotId,
          planned.nextDeviceSequence,
          capturedGeneration,
          candidate.compressedBytes,
          JSON.stringify([...new Set(candidate.mediaHashes)].sort()),
          timestamp,
          timestamp,
        );
        this.database.runSync(
          `UPDATE cloud_sync_state
           SET next_device_sequence = ?, updated_at = ?
           WHERE vault_id = ? AND device_id = ?`,
          planned.nextDeviceSequence + 1,
          timestamp,
          vaultId,
          deviceId,
        );
        return this.loadPending(vaultId, deviceId)!;
      });
      if (persisted) return persisted;
    }
    throw new Error('Device sequence changed during every candidate preparation attempt');
  }

  advancePending(
    vaultId: string,
    deviceId: string,
    snapshotId: string,
    stage: PendingPublicationStage,
  ): PendingPublication {
    return this.transaction(() => {
      const pending = this.loadPending(vaultId, deviceId);
      if (!pending || pending.snapshotId !== snapshotId) {
        throw new Error('Pending snapshot publication changed unexpectedly');
      }
      const requestedOrder = STAGE_ORDER[stage];
      const currentOrder = STAGE_ORDER[pending.stage];
      if (requestedOrder > currentOrder + 1) {
        throw new Error('Pending snapshot publication cannot skip a verification stage');
      }
      if (requestedOrder === currentOrder + 1) {
        this.database.runSync(
          `UPDATE cloud_pending_publication SET stage = ?, updated_at = ?
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
    reason: SyncAttentionReason,
    errorClass: string,
    context: string | null = null,
  ): void {
    this.ensureStateRow(vaultId, deviceId);
    this.database.runSync(
      `UPDATE cloud_sync_state SET pause_reason = ?, pause_context_json = ?,
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
      `UPDATE cloud_sync_state SET last_error_class = ?, updated_at = ?
       WHERE vault_id = ? AND device_id = ?`,
      errorClass,
      this.now(),
      vaultId,
      deviceId,
    );
  }

  clearPause(vaultId: string, deviceId: string, reason?: SyncAttentionReason): void {
    this.ensureStateRow(vaultId, deviceId);
    this.database.runSync(
      `UPDATE cloud_sync_state SET pause_reason = NULL, pause_context_json = NULL,
         last_error_class = NULL, updated_at = ?
       WHERE vault_id = ? AND device_id = ?${reason ? ' AND pause_reason = ?' : ''}`,
      this.now(),
      vaultId,
      deviceId,
      ...(reason ? [reason] : []),
    );
  }

  loadBaseCheckpoint(vaultId: string, deviceId: string): BaseShadowCheckpoint | null {
    const row = this.database.getFirstSync<BaseRow>(
      'SELECT * FROM cloud_base_shadow WHERE vault_id = ? AND device_id = ?',
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
    checkpoint: BaseShadowCheckpoint,
    capturedGeneration: number,
  ): { dirty: boolean; oldFileName: string | null } {
    return this.transaction(() => {
      const pending = this.loadPending(checkpoint.vaultId, checkpoint.deviceId);
      if (!pending || pending.snapshotId !== checkpoint.snapshotId ||
          STAGE_ORDER[pending.stage] < STAGE_ORDER['domain-applied']) {
        throw new Error('Cannot settle an incomplete snapshot publication');
      }
      const old = this.loadBaseCheckpoint(checkpoint.vaultId, checkpoint.deviceId);
      this.database.runSync(
        `INSERT INTO cloud_base_shadow(
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
          `INSERT INTO cloud_shadow_reaper(file_name, queued_at) VALUES (?, ?)
           ON CONFLICT(file_name) DO NOTHING`,
          old.fileName,
          this.now(),
        );
      }
      this.database.runSync(
        `UPDATE cloud_sync_state
         SET settled_generation = MAX(settled_generation, ?), updated_at = ?
         WHERE vault_id = ? AND device_id = ?`,
        capturedGeneration,
        this.now(),
        checkpoint.vaultId,
        checkpoint.deviceId,
      );
      this.database.runSync(
        'DELETE FROM cloud_pending_publication WHERE vault_id = ? AND device_id = ?',
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
      'SELECT file_name FROM cloud_shadow_reaper ORDER BY queued_at, file_name',
    ).map((row) => row.file_name);
  }

  completeShadowReap(fileName: string): void {
    this.database.runSync('DELETE FROM cloud_shadow_reaper WHERE file_name = ?', fileName);
  }
}
