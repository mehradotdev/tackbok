import type { DurableSyncState, SyncAttentionReason } from './types';

export interface SyncDatabase {
  execSync(source: string): void;
  getFirstSync<T>(source: string, ...params: unknown[]): T | null;
  getAllSync<T>(source: string, ...params: unknown[]): T[];
  runSync(source: string, ...params: unknown[]): unknown;
}

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

  /**
   * Takes the next device sequence, at least `minimum`, in one transaction
   * (sync v2): two passes can never publish under one sequence.
   */
  reserveSequence(vaultId: string, deviceId: string, minimum: number): number {
    return this.transaction(() => {
      this.ensureStateRow(vaultId, deviceId);
      const sequence = Math.max(
        this.loadState(vaultId, deviceId).nextDeviceSequence,
        minimum,
      );
      this.database.runSync(
        `UPDATE cloud_sync_state SET next_device_sequence = ?, updated_at = ?
         WHERE vault_id = ? AND device_id = ?`,
        sequence + 1,
        this.now(),
        vaultId,
        deviceId,
      );
      return sequence;
    });
  }

  /** Local writes up to `generation` are backed up (sync v2). Never moves back. */
  markSettled(vaultId: string, deviceId: string, generation: number): void {
    this.ensureStateRow(vaultId, deviceId);
    this.database.runSync(
      `UPDATE cloud_sync_state
       SET settled_generation = MAX(settled_generation, MIN(?, journal_generation)),
           updated_at = ?
       WHERE vault_id = ? AND device_id = ?`,
      generation,
      this.now(),
      vaultId,
      deviceId,
    );
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
}
