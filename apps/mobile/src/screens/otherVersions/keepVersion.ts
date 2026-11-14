import type { OtherVersionGroup } from '~/db/queries';

/** Every entry in a group: the original, when it still exists, then its versions. */
export function groupMembers(group: OtherVersionGroup) {
  return group.original ? [group.original, ...group.versions] : group.versions;
}

/**
 * The entries "Keep this one" deletes: those the user confirmed that are still
 * in the kept entry's group. Sync can change the groups while the confirmation
 * is open, so anything that left the group, or the kept entry itself, is spared.
 */
export function entriesToDelete(
  groups: readonly OtherVersionGroup[],
  keepId: string,
  confirmedIds: readonly string[],
): string[] {
  const group = groups.find((candidate) =>
    groupMembers(candidate).some((entry) => entry.note_id === keepId),
  );
  if (!group) return [];
  const members = new Set(groupMembers(group).map((entry) => entry.note_id));
  return confirmedIds.filter((id) => id !== keepId && members.has(id));
}
