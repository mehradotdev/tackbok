import type { Entry } from '~/types';

/**
 * An entry with other versions of its title or text: the entry (`original`)
 * and one copy of it per other version (`versions`, newest first). See
 * `cloudSync/ui/versions.ts`.
 */
export interface OtherVersionGroup<T extends Pick<Entry, 'note_id'> = Entry> {
  original: T | null;
  versions: T[];
}

/**
 * Whether a group is still an open choice: more than one version. A version
 * left on its own has nothing to choose between.
 */
export function isOpenGroup(group: OtherVersionGroup<Pick<Entry, 'note_id'>>): boolean {
  return (group.original ? 1 : 0) + group.versions.length > 1;
}
