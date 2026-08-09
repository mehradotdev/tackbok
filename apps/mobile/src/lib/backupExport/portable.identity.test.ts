import { AssetType } from '~/types';
import {
  createPortableEntries,
  createPortablePrompts,
  createPortableTags,
} from './portable';

jest.mock('./utils', () => ({
  assetFileExists: () => true,
  createArchiveAssetPath: (_type: string, uri: string) => `media/${uri}`,
  resolveTagIdsToTitles: (csv: string, map: Map<string, string>) =>
    csv
      .split(',')
      .filter(Boolean)
      .map((id) => map.get(id))
      .filter(Boolean),
}));

test('manual backup v1 carries every normalized stable identity additively', () => {
  expect(
    createPortableTags([
      {
        tag_id: 'tag-stable',
        title: 'Family',
        conflict_origin_id: null,
        created_at: 1,
        updated_at: 2,
      },
    ]),
  ).toEqual([
    {
      tagId: 'tag-stable',
      title: 'Family',
      createdAt: 1,
      updatedAt: 2,
    },
  ]);
  expect(
    createPortablePrompts([
      {
        prompt_id: 'prompt-stable',
        title: 'Today I noticed…',
        conflict_origin_id: null,
        created_at: 3,
        updated_at: 4,
      },
    ]),
  ).toEqual([
    {
      promptId: 'prompt-stable',
      title: 'Today I noticed…',
      createdAt: 3,
      updatedAt: 4,
    },
  ]);

  const result = createPortableEntries(
    [
      {
        note_id: 'entry-stable',
        text_title: 'Title',
        text_content: 'Body',
        mood: null,
        assets: [{ type: AssetType.IMAGE, uri: 'legacy.jpg' }],
        tags: 'tag-stable',
        created_at: 5,
        updated_at: 6,
      },
    ],
    new Map([['tag-stable', 'Family']]),
    new Map([
      [
        'entry-stable',
        [
          {
            asset_id: 'asset-stable',
            owner_type: 'entry',
            owner_id: 'entry-stable',
            kind: 'photo',
            local_uri: 'photos/photo.jpg',
            download_state: 'verified',
            mime_type: 'image/jpeg',
            byte_size: 123,
            width: 10,
            height: 20,
            duration_ms: null,
            blob_hash: 'a'.repeat(64),
            created_at: 5,
            updated_at: 6,
            pending_local_delete_at: null,
          },
        ],
      ],
    ]),
    new Map([['entry-stable', ['tag-stable']]]),
  );

  expect(result.portableEntries[0]).toMatchObject({
    noteId: 'entry-stable',
    tagIds: ['tag-stable'],
    assets: [
      {
        assetId: 'asset-stable',
        blobHash: 'a'.repeat(64),
        type: AssetType.IMAGE,
      },
    ],
  });
});
