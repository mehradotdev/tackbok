import type { OtherVersionGroup } from '~/db/queries';
import type { TranslationFunction } from '~/lib/i18n';
import type { Entry } from '~/types';

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

/**
 * Deletes the entries one at a time, stopping at the first failure. Resolves
 * whether every entry was deleted; entries before a failure stay deleted.
 */
export async function deleteEach(
  ids: readonly string[],
  deleteOne: (id: string) => Promise<void>,
): Promise<boolean> {
  try {
    for (const id of ids) await deleteOne(id);
    return true;
  } catch (error) {
    console.error('Failed to delete entry', error);
    return false;
  }
}

/**
 * What "Keep this one" deletes, for the confirmation and the button's hint.
 * Attachments belong to one version only, so they are counted too.
 */
export function keepMessage(t: TranslationFunction, others: readonly Entry[]): string {
  const message = t('cloud.conflicts.keepThisOneMessage', { count: others.length });
  const attachments = others.reduce(
    (total, entry) => total + (entry.assets?.length ?? 0),
    0,
  );
  return attachments > 0
    ? `${message} ${t('cloud.conflicts.keepThisOneAttachments', { count: attachments })}`
    : message;
}
