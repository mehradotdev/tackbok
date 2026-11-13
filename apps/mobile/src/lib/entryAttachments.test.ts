import { type Asset, AssetType } from '~/types';
import { attachmentsToSave } from './entryAttachments';

const photo = (uri: string): Asset => ({ type: AssetType.IMAGE, uri });
const voice = (uri: string): Asset => ({ type: AssetType.AUDIO, uri });

test('attachments still downloading keep their place when an entry is saved', () => {
  const original = [photo('A'), voice('V'), photo('B'), voice('W')];
  // A and W are still downloading, so the editor shows only B and V.
  expect(
    attachmentsToSave(original, [photo('B'), voice('V')], [photo('A'), voice('W')]),
  ).toEqual(original);
});

test('removed attachments are dropped and new ones follow the kept ones', () => {
  const original = [photo('A'), photo('B'), voice('V')];
  expect(
    attachmentsToSave(original, [photo('B'), photo('C'), voice('X')], [photo('A')]),
  ).toEqual([photo('A'), photo('B'), photo('C'), voice('X')]);
});

test('a new entry saves what the editor shows', () => {
  expect(attachmentsToSave(null, [photo('C'), voice('X')], [])).toEqual([
    photo('C'),
    voice('X'),
  ]);
});
