import { stringifyArrayInPieces } from './jsonInPieces';

test('matches JSON.stringify with two-space indent, in pieces', async () => {
  const items = Array.from({ length: 600 }, (_, index) => ({
    noteId: `note-${index}`,
    text: `line one\nline "two" ${index}`,
    tags: index % 3 === 0 ? [] : ['a', 'b'],
    assets: [{ path: `media/photos/${index}.jpg`, nested: { deep: [1, { x: null }] } }],
    mood: index % 2 ? null : 'HAPPY',
  }));
  const timers = jest.spyOn(global, 'setTimeout');
  expect(await stringifyArrayInPieces(items)).toBe(JSON.stringify(items, null, 2));
  // Pauses between the 250-item pieces.
  expect(timers.mock.calls.filter(([, delay]) => delay === 0)).toHaveLength(2);
  timers.mockRestore();
  expect(await stringifyArrayInPieces([])).toBe(JSON.stringify([], null, 2));
  // Arrays, dates and toJSON inside items, as JSON.stringify handles them.
  const mixed = [
    [1, 'two'],
    { at: new Date(0), own: { toJSON: () => 'x' }, gone: undefined },
  ];
  expect(await stringifyArrayInPieces(mixed)).toBe(JSON.stringify(mixed, null, 2));
});
