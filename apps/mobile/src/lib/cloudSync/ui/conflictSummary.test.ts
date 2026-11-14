import {
  deriveConflictItems,
  parseConflictRecord,
  type CloudConflictRecord,
  type ConflictSummaryContext,
} from './conflictSummary';

const JOINED_AT = 1_000;

const context: ConflictSummaryContext = {
  joinedAt: JOINED_AT,
  currentName: 'Mehra',
  currentPhotoAssetId: 'photo-current',
  currentPhotoBlobHash: 'current-hash',
  localPhotos: new Map([
    ['photo-current', { uri: 'photos/current.jpg', blobHash: 'current-hash' }],
    ['photo-other', { uri: 'photos/other.jpg', blobHash: 'other-hash' }],
    ['photo-other-copy', { uri: 'photos/other-copy.jpg', blobHash: 'other-hash' }],
    ['photo-same-blob', { uri: 'photos/same.jpg', blobHash: 'current-hash' }],
    ['photo-unhashed', { uri: 'photos/unhashed.jpg', blobHash: null }],
  ]),
  existingEntryIds: new Set(['recovered-a', 'recovered-b']),
  returnedEntries: new Map([
    [
      'returned-old',
      { entryId: 'returned-old', createdAt: 10, title: 'Walk', preview: 'Sunny' },
    ],
    [
      'returned-new',
      { entryId: 'returned-new', createdAt: 20, title: null, preview: 'Rain' },
    ],
  ]),
};

function record(overrides: Partial<CloudConflictRecord>): CloudConflictRecord {
  return {
    conflictId: 'c',
    entityType: 'profile',
    entityId: 'profile',
    field: 'displayName',
    alternateValue: undefined,
    recoveredEntityIds: [],
    createdAt: JOINED_AT + 1,
    archived: false,
    ...overrides,
  };
}

describe('parseConflictRecord', () => {
  test('keeps the field and the alternate value, including a null name', () => {
    const json = JSON.stringify({
      conflictId: 'x',
      entityType: 'profile',
      entityId: 'profile',
      field: 'displayName',
      baseValueHash: null,
      localValueHash: null,
      remoteValueHash: null,
      primaryValueHash: null,
      alternates: [{ valueHash: 'h', value: null }],
      recoveredEntityIds: [],
    });
    expect(parseConflictRecord('x', json, 5)).toEqual({
      conflictId: 'x',
      entityType: 'profile',
      entityId: 'profile',
      field: 'displayName',
      alternateValue: null,
      recoveredEntityIds: [],
      createdAt: 5,
      archived: false,
    });
    expect(parseConflictRecord('x', json, 5, true).archived).toBe(true);
  });

  test('reports no alternate when the merge kept none', () => {
    const json = JSON.stringify({
      entityType: 'entry',
      field: 'content',
      alternates: [],
      recoveredEntityIds: ['recovered-a'],
    });
    expect(parseConflictRecord('y', json, 5)).toMatchObject({
      field: 'content',
      alternateValue: undefined,
      recoveredEntityIds: ['recovered-a'],
    });
  });
});

describe('deriveConflictItems', () => {
  test('exposes both names and groups identical alternates into one row', () => {
    expect(
      deriveConflictItems(
        [
          record({ conflictId: 'n1', alternateValue: 'Mehra A' }),
          record({ conflictId: 'n2', alternateValue: 'Mehra A' }),
          record({ conflictId: 'n3', alternateValue: null }),
        ],
        context,
      ),
    ).toEqual([
      {
        kind: 'name',
        conflictIds: ['n1', 'n2'],
        current: 'Mehra',
        other: 'Mehra A',
        archived: false,
      },
      {
        kind: 'name',
        conflictIds: ['n3'],
        current: 'Mehra',
        other: null,
        archived: false,
      },
    ]);
  });

  test('a name row is archived only when every record behind it is archived', () => {
    expect(
      deriveConflictItems(
        [
          record({ conflictId: 'a1', alternateValue: 'Old', archived: true }),
          record({ conflictId: 'a2', alternateValue: 'Both', archived: true }),
          record({ conflictId: 'a3', alternateValue: 'Both' }),
        ],
        context,
      ).map(({ conflictIds, ...item }) => [
        conflictIds,
        'archived' in item && item.archived,
      ]),
    ).toEqual([
      [['a1'], true],
      [['a2', 'a3'], false],
    ]);
  });

  test('hides a name that already matches the current one', () => {
    expect(deriveConflictItems([record({ alternateValue: 'Mehra' })], context)).toEqual(
      [],
    );
  });

  test('lists a photo only when the other file exists and its content differs from the current one', () => {
    const photo = (conflictId: string, alternateValue: string | null) =>
      record({ conflictId, field: 'photoAssetId', alternateValue });
    expect(
      deriveConflictItems(
        [
          photo('p1', 'photo-other'),
          photo('p2', 'photo-missing'),
          photo('p3', 'photo-current'),
          photo('p4', null),
          photo('p5', 'photo-same-blob'),
          photo('p6', 'photo-other-copy'),
          photo('p7', 'photo-unhashed'),
        ],
        context,
      ),
    ).toEqual([
      {
        kind: 'photo',
        conflictIds: ['p1', 'p6'],
        otherAssetId: 'photo-other',
        otherUri: 'photos/other.jpg',
      },
      {
        kind: 'photo',
        conflictIds: ['p7'],
        otherAssetId: 'photo-unhashed',
        otherUri: 'photos/unhashed.jpg',
      },
    ]);
  });

  test('groups entry conflicts by the recovered entries that still exist', () => {
    expect(
      deriveConflictItems(
        [
          record({
            conflictId: 'e1',
            entityType: 'entry',
            field: 'title',
            recoveredEntityIds: ['recovered-a'],
          }),
          record({
            conflictId: 'e2',
            entityType: 'entry',
            field: 'content',
            recoveredEntityIds: ['recovered-a'],
          }),
          record({
            conflictId: 'e3',
            entityType: 'entry',
            field: 'content',
            recoveredEntityIds: ['recovered-b'],
          }),
          record({
            conflictId: 'e4',
            entityType: 'entry',
            field: 'content',
            recoveredEntityIds: ['recovered-deleted'],
          }),
        ],
        context,
      ),
    ).toEqual([
      {
        kind: 'entries',
        conflictIds: ['e1', 'e2', 'e3'],
        recoveredEntryIds: ['recovered-a', 'recovered-b'],
      },
    ]);
  });

  test('lists each entry kept after a delete/edit race once, newest first', () => {
    const deleteEdit = (
      conflictId: string,
      entityType: 'entry' | 'tag',
      entityId: string,
    ) =>
      record({
        conflictId,
        entityType,
        entityId,
        field: 'deleteEdit',
        alternateValue: null,
      });
    expect(
      deriveConflictItems(
        [
          deleteEdit('d1', 'entry', 'returned-old'),
          deleteEdit('d2', 'entry', 'returned-new'),
          deleteEdit('d3', 'entry', 'returned-old'),
          // Deleted on both sides, or deleted again since: not in the journal.
          deleteEdit('d4', 'entry', 'still-deleted'),
          // A tag ID that happens to match an entry ID is not an entry.
          deleteEdit('d5', 'tag', 'returned-new'),
          record({
            conflictId: 'e1',
            entityType: 'entry',
            entityId: 'origin',
            field: 'content',
            recoveredEntityIds: ['recovered-a'],
          }),
        ],
        context,
      ),
    ).toEqual([
      { kind: 'entries', conflictIds: ['e1'], recoveredEntryIds: ['recovered-a'] },
      {
        kind: 'returnedEntry',
        conflictIds: ['d2'],
        entry: context.returnedEntries.get('returned-new'),
      },
      {
        kind: 'returnedEntry',
        conflictIds: ['d1', 'd3'],
        entry: context.returnedEntries.get('returned-old'),
      },
    ]);
  });

  test('hides records with nothing to act on', () => {
    expect(
      deriveConflictItems(
        [
          record({ field: 'assetReference', alternateValue: null }),
          record({ entityType: 'entry', field: 'assetReference', alternateValue: null }),
          record({ entityType: 'entry', field: 'deleteEdit', alternateValue: null }),
          record({ entityType: 'tag', field: 'deleteEdit', alternateValue: null }),
          record({ entityType: 'entry', field: 'mood', alternateValue: 'HAPPY' }),
          record({ entityType: 'tag', field: 'title', alternateValue: 'Family' }),
        ],
        context,
      ),
    ).toEqual([]);
  });

  test('hides records this device first saw before it joined the backup', () => {
    expect(
      deriveConflictItems(
        [
          record({ conflictId: 'old', alternateValue: 'Old', createdAt: JOINED_AT }),
          record({ conflictId: 'new', alternateValue: 'New', createdAt: JOINED_AT + 1 }),
        ],
        context,
      ).map((item) => item.conflictIds),
    ).toEqual([['new']]);
  });
});
