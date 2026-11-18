import { isOpenGroup } from './otherVersionGroups';

const entry = (note_id: string) => ({ note_id });

test('a group is open while it has more than one version', () => {
  expect(isOpenGroup({ original: entry('o'), versions: [entry('c')] })).toBe(true);
  expect(isOpenGroup({ original: null, versions: [entry('c1'), entry('c2')] })).toBe(
    true,
  );
});

test('a version left on its own is not open', () => {
  expect(isOpenGroup({ original: entry('o'), versions: [] })).toBe(false);
  expect(isOpenGroup({ original: null, versions: [entry('c')] })).toBe(false);
});
