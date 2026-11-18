/**
 * Mass-deletion guard (#185, P10). Before applying a join, the engine counts
 * the entries this device shows that the join would hide. Past the
 * threshold it pauses and asks, writing nothing.
 *
 * Threshold: at least 10 entries and at least a quarter of the entries this
 * device shows, or 100 entries whatever the share.
 * - Only deletes made elsewhere count: this device's own deletes are already
 *   in its journal when the pass starts. "Delete journal everywhere" and
 *   "Delete all" never send deletes (they revoke the vault or start a new
 *   device), so neither is guarded.
 * - 10 keeps small journals out: a few example entries removed with "Remove
 *   all", or a handful of deletes on a phone with a short journal.
 * - A quarter catches what matters (a bug, a damaged or forged snapshot, a
 *   wrong device wiping most of a journal), while one user deleting a run of
 *   old entries on another phone rarely reaches it, and if they do they are
 *   asked once.
 * - 100 guards large journals, where a quarter is a lot: 100 entries are
 *   about three months of daily writing, rarely deleted at once on purpose.
 * - Only entries count. Tags and prompts are small, and a tag that entries
 *   still use stays shown anyway.
 *
 * shortcut: each pass is judged alone, so deletes that arrive in batches
 * under the threshold (a peer publishing a few at a time) are not caught.
 * Upgrade to a baseline kept since the user last answered or confirmed if
 * that turns out to matter.
 */
import { sha256Text } from '../sha256';
import { isLive } from '../../v2/view';
import type { SyncState } from '../../v2/types';

export const MASS_DELETION_MIN_ENTRIES = 10;
export const MASS_DELETION_SHARE = 0.25;
export const MASS_DELETION_ANY_SHARE = 100;

/** The user's answer, stored with the pause's token until the next pass applies it. */
export type MassDeletionChoice = 'apply' | 'keep';

/** Entries shown in `before` that `after` hides. A missing record never deletes. */
export function entriesHidden(before: SyncState, after: SyncState): string[] {
  const hidden: string[] = [];
  for (const [id, entry] of before.entries) {
    if (!isLive(entry)) continue;
    const joined = after.entries.get(id);
    if (joined && !isLive(joined)) hidden.push(id);
  }
  return hidden.sort();
}

export function isMassDeletion(hidden: number, shownBefore: number): boolean {
  return (
    hidden >= MASS_DELETION_ANY_SHARE ||
    (hidden >= MASS_DELETION_MIN_ENTRIES && hidden >= shownBefore * MASS_DELETION_SHARE)
  );
}

/** Names exactly this set of entries: an answer applies only to what was asked. */
export function massDeletionToken(hidden: readonly string[]): string {
  return `${hidden.length}:${sha256Text(hidden.join('\n'))}`;
}
