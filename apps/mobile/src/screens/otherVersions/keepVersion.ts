import type { OtherVersionGroup } from '~/db/queries';
import type { TranslationFunction } from '~/lib/i18n';
import type { Entry } from '~/types';

/** Every entry in a group: the original, when it still exists, then its versions. */
export function groupMembers(group: OtherVersionGroup) {
  return group.original ? [group.original, ...group.versions] : group.versions;
}

/**
 * What "Keep this one" removes, for the confirmation and the button's hint:
 * the other versions of the text. Attachments belong to the entry and stay.
 */
export function keepMessage(t: TranslationFunction, others: readonly Entry[]): string {
  return t('cloud.conflicts.keepThisOneMessage', { count: others.length });
}
