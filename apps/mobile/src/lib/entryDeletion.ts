import { deleteEntryRecord } from '~/db/queries';

/**
 * Delete an entry while retaining its media until every sync obligation is safe.
 * The repository copies normalized media metadata to the retained-media ledger
 * in the same transaction as the tombstone and hard delete. A later ledger
 * worker is the only code allowed to remove the bytes.
 */
export async function deleteEntry(noteId: string): Promise<void> {
  await deleteEntryRecord(noteId);
}
