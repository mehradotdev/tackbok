import { isOpenGroup } from './otherVersionGroups';

const link = (note_id: string, conflict_origin_id: string | null = null) => ({
  note_id,
  conflict_origin_id,
});

test('a group is open while it has more than one live version', () => {
  expect(isOpenGroup({ original: link('o'), versions: [link('c', 'o')] })).toBe(true);
  expect(
    isOpenGroup({ original: null, versions: [link('c1', 'o'), link('c2', 'o')] }),
  ).toBe(true);
});

test('a version left on its own is not open, whichever one was kept', () => {
  expect(isOpenGroup({ original: link('o'), versions: [] })).toBe(false);
  expect(isOpenGroup({ original: null, versions: [link('c', 'o')] })).toBe(false);
});
