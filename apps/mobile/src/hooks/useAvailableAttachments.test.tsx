import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { bumpMediaRevision } from '~/lib/cloudSync/runtime/mediaRevision';
import { type Asset, AssetType } from '~/types';
import { useAvailableAttachments } from './useAvailableAttachments';

const mockFiles = new Set<string>();
jest.mock('~/lib/photoUtils', () => ({
  filterExistingPhotos: (assets: Asset[] | null) =>
    (assets ?? []).filter((a) => a.type === 'IMAGE' && mockFiles.has(a.uri)),
  filterUnavailableAttachments: (assets: Asset[] | null) =>
    (assets ?? []).filter((a) => !mockFiles.has(a.uri)),
}));
jest.mock('~/lib/voiceMemoUtils', () => ({
  filterExistingVoiceMemos: (assets: Asset[] | null) =>
    (assets ?? []).filter((a) => a.type === 'AUDIO' && mockFiles.has(a.uri)),
}));

// One unchanged entry, as React Query keeps it while its files download.
const assets: Asset[] = [
  { type: AssetType.IMAGE, uri: 'photos/a.jpg' },
  { type: AssetType.AUDIO, uri: 'voice_memos/b.m4a' },
];

function Entry() {
  const { photos, voiceMemos, unavailable } = useAvailableAttachments(assets);
  return React.createElement(
    'Attachments',
    null,
    `${photos.length}/${voiceMemos.length}/${unavailable.length}`,
  );
}

test('attachments appear when their downloads arrive, with the entry unchanged', async () => {
  mockFiles.clear();
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<Entry />);
  });
  expect(root.toJSON()).toMatchObject({ children: ['0/0/2'] });

  mockFiles.add('photos/a.jpg');
  await act(async () => bumpMediaRevision());
  expect(root.toJSON()).toMatchObject({ children: ['1/0/1'] });

  mockFiles.add('voice_memos/b.m4a');
  await act(async () => bumpMediaRevision());
  expect(root.toJSON()).toMatchObject({ children: ['1/1/0'] });
  await act(async () => root.unmount());
});
