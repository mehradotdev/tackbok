import type { Entry } from '~/types';

/**
 * Entries that sync kept two or more versions of. `original` is the entry the
 * versions were copied from, or `null` when it was deleted. A version copied
 * from another version joins that version's group, so each entry is listed once.
 */
export interface OtherVersionGroup<T extends VersionLink = Entry> {
  original: T | null;
  /** Newest first. */
  versions: T[];
}

/** The fields that link an entry to the versions sync kept of it. */
export type VersionLink = Pick<Entry, 'note_id' | 'conflict_origin_id'>;

/** `rows` must be sorted newest first for `versions` to be newest first. */
export function groupOtherVersions<T extends VersionLink>(
  rows: T[],
): OtherVersionGroup<T>[] {
  const byId = new Map(rows.map((entry) => [entry.note_id, entry]));
  // The oldest ancestor still in the journal. Sync cannot link versions in a
  // loop, but if it happens every member gets the same root: the smallest ID.
  const rootOf = (entry: T) => {
    const path = [entry];
    for (;;) {
      const root = path[path.length - 1];
      const parent = root.conflict_origin_id
        ? byId.get(root.conflict_origin_id)
        : undefined;
      if (!parent) return root;
      const loopStart = path.indexOf(parent);
      if (loopStart >= 0) {
        return path
          .slice(loopStart)
          .reduce((smallest, member) =>
            member.note_id < smallest.note_id ? member : smallest,
          );
      }
      path.push(parent);
    }
  };
  const groups = new Map<string, OtherVersionGroup<T>>();
  for (const entry of rows) {
    const root = rootOf(entry);
    // Versions of a deleted original still belong together. Its ID cannot be
    // another group's key: an existing origin is always among `rows`.
    const key =
      root.conflict_origin_id && !byId.has(root.conflict_origin_id)
        ? root.conflict_origin_id
        : root.note_id;
    let group = groups.get(key);
    if (!group) {
      group = { original: root.conflict_origin_id ? null : root, versions: [] };
      groups.set(key, group);
    }
    if (entry !== group.original) group.versions.push(entry);
  }
  return [...groups.values()];
}

/**
 * Whether a group is still an open entry conflict: more than one live
 * version. A version left on its own has nothing to choose between.
 */
export function isOpenGroup(group: OtherVersionGroup<VersionLink>): boolean {
  return (group.original ? 1 : 0) + group.versions.length > 1;
}

/** The groups that are still an open entry conflict (see `isOpenGroup`). */
export function openConflictGroups(rows: VersionLink[]): string[][] {
  return groupOtherVersions(rows)
    .filter(isOpenGroup)
    .map((group) =>
      [group.original, ...group.versions]
        .filter((member) => member !== null)
        .map((member) => member.note_id),
    );
}
