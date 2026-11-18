import type { CloudConflictItem } from '~/lib/cloudSync/ui';

export type ConflictNotice =
  | {
      /** Only entry conflicts are open: compare the versions directly. */
      route: 'other-versions';
      entryCount: number;
    }
  | {
      /** Name, photo or returned-entry rows (or a failed load) need Cloud backup. */
      route: 'cloud-backup';
    };

/**
 * The Home notice for `items` (the conflicts card's active rows), or `null`
 * when there is nothing new: it shows while any row holds a value from
 * another device that the user has not seen (`isNew`; seen values sync).
 */
export function conflictNotice(
  items: readonly CloudConflictItem[],
  loadFailed: boolean,
): ConflictNotice | null {
  // A failed load still shows the notice, so the retry on Cloud backup is reachable.
  if (loadFailed) return { route: 'cloud-backup' };
  if (!items.some((item) => item.isNew)) return null;
  const [only] = items;
  if (items.length === 1 && only.kind === 'entries') {
    return { route: 'other-versions', entryCount: only.entryCount };
  }
  return { route: 'cloud-backup' };
}
