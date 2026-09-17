// Fifty rows of the widest snapshot table (16 columns) stay below even the
// older SQLite 999-parameter limit. Call inside the caller's atomic transaction.
const ROWS_PER_BATCH = 50;

export async function writeBatches<T>(
  rows: readonly T[],
  write: (batch: T[]) => PromiseLike<unknown>,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += ROWS_PER_BATCH) {
    await write(rows.slice(offset, offset + ROWS_PER_BATCH));
  }
}
