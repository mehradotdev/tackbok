import type { CloudConflictItem } from '~/lib/cloudSync/ui';

/** What this device remembers about notices the user has already seen. */
export interface ConflictNoticeSeen {
  /** The newest conflict time hidden with the notice's close button. */
  hiddenAt: number | null;
  /** When Other versions was last opened; covers entry conflicts only. */
  otherVersionsSeenAt: number | null;
}

export type ConflictNotice =
  | {
      /** Only entry conflicts are open: compare the versions directly. */
      route: 'other-versions';
      entryCount: number;
      newestAt: number;
    }
  | {
      /** Name, photo or returned-entry rows (or a failed load) need Cloud backup. */
      route: 'cloud-backup';
      /** `null` when the conflicts could not be loaded. */
      newestAt: number | null;
    };

/**
 * The Home notice for `items` (the conflicts card's active rows), or `null`
 * when there is nothing new: it shows while any row has a conflict newer than
 * what the user hid or, for entry conflicts, saw on Other versions.
 */
export function conflictNotice(
  items: readonly CloudConflictItem[],
  loadFailed: boolean,
  seen: ConflictNoticeSeen,
): ConflictNotice | null {
  // A failed load still shows the notice, so the retry on Cloud backup is
  // reachable, unless the user hid it: there is no time to compare with.
  if (loadFailed) {
    return seen.hiddenAt === null ? { route: 'cloud-backup', newestAt: null } : null;
  }
  const hiddenAt = seen.hiddenAt ?? 0;
  const entriesSeenAt = Math.max(hiddenAt, seen.otherVersionsSeenAt ?? 0);
  const hasNews = items.some(
    (item) => item.latestAt > (item.kind === 'entries' ? entriesSeenAt : hiddenAt),
  );
  if (!hasNews) return null;
  const newestAt = Math.max(...items.map((item) => item.latestAt));
  const [only] = items;
  if (items.length === 1 && only.kind === 'entries') {
    return { route: 'other-versions', entryCount: only.entryCount, newestAt };
  }
  return { route: 'cloud-backup', newestAt };
}
