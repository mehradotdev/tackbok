import { versionDifferences } from './versionDifferences';

const at = (iso: string) => new Date(iso).getTime();
const version = (
  fields: Partial<Parameters<typeof versionDifferences>[0][number]> = {},
) => ({
  text_title: 'Walk',
  text_content: 'Sunny morning',
  mood: null,
  created_at: at('2026-11-15T09:00:00'),
  ...fields,
});

test('names each field that differs', () => {
  expect(
    versionDifferences([
      version(),
      version({ text_title: 'Run', text_content: 'Rainy', mood: 'HAPPY' }),
    ]),
  ).toEqual([
    'cloud.conflicts.titleDiffers',
    'cloud.conflicts.textDiffers',
    'cloud.conflicts.moodDiffers',
  ]);
});

test('only the text differs', () => {
  expect(versionDifferences([version(), version({ text_content: 'Rainy' })])).toEqual([
    'cloud.conflicts.textDiffers',
  ]);
});

test('no title and an empty title are the same', () => {
  expect(
    versionDifferences([version({ text_title: null }), version({ text_title: '' })]),
  ).toEqual([]);
});

test('a different day is a date difference, the same day a time difference', () => {
  expect(
    versionDifferences([version(), version({ created_at: at('2026-11-14T09:00:00') })]),
  ).toEqual(['cloud.conflicts.dateDiffers']);
  expect(
    versionDifferences([version(), version({ created_at: at('2026-11-15T18:30:00') })]),
  ).toEqual(['cloud.conflicts.timeDiffers']);
});

test('with three versions, a field differs when any version differs', () => {
  expect(
    versionDifferences([version(), version(), version({ text_title: 'Run' })]),
  ).toEqual(['cloud.conflicts.titleDiffers']);
});

test('identical versions name nothing', () => {
  expect(versionDifferences([version(), version()])).toEqual([]);
});

test('seconds alone are not a time difference: entries show minutes', () => {
  expect(
    versionDifferences([version(), version({ created_at: at('2026-11-15T09:00:42') })]),
  ).toEqual([]);
});
