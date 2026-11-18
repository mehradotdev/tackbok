import type { OtherVersionGroup } from '~/db/queries';
import type { TranslationFunction } from '~/lib/i18n';
import type { Entry } from '~/types';
import { parseVersionCopyId } from '~/lib/cloudSync/ui/versions';

/** Every entry in a group: the original, when it still exists, then its versions. */
export function groupMembers(group: OtherVersionGroup) {
  return group.original ? [group.original, ...group.versions] : group.versions;
}

/**
 * What "Keep this one" on `kept` keeps it instead of, for the confirmation
 * and the button's hint. The entry's own button settles every field, so all
 * other versions; another version settles only its field, so the entry's
 * value of it and that field's other versions. Attachments stay.
 */
export function keepMessage(
  t: TranslationFunction,
  kept: Pick<Entry, 'note_id'>,
  others: readonly Pick<Entry, 'note_id'>[],
): string {
  const field = parseVersionCopyId(kept.note_id)?.field;
  const count = field
    ? others.filter((member) => {
        const copy = parseVersionCopyId(member.note_id);
        return !copy || copy.field === field;
      }).length
    : others.length;
  return t('cloud.conflicts.keepThisOneMessage', { count });
}
