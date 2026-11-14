import type { OtherVersionGroup } from '~/db/queries';
import type { Entry } from '~/types';
import { entriesToDelete } from './keepVersion';

const entry = (noteId: string) => ({ note_id: noteId }) as Entry;
const groups: OtherVersionGroup[] = [
  { original: entry('a'), versions: [entry('a-copy'), entry('a-copy-2')] },
  { original: null, versions: [entry('orphan'), entry('orphan-sibling')] },
];

test('deletes the confirmed entries of the kept entry’s group', () => {
  expect(entriesToDelete(groups, 'a-copy', ['a', 'a-copy-2'])).toEqual(['a', 'a-copy-2']);
  expect(entriesToDelete(groups, 'orphan', ['orphan-sibling'])).toEqual([
    'orphan-sibling',
  ]);
});

test('never deletes the kept entry or an entry from another group', () => {
  expect(entriesToDelete(groups, 'a', ['a', 'orphan', 'a-copy'])).toEqual(['a-copy']);
});

test('deletes nothing when the kept entry is no longer listed', () => {
  expect(entriesToDelete(groups, 'gone', ['a', 'a-copy'])).toEqual([]);
});
