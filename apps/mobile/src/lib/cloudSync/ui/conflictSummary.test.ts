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
  localPhotoUris: new Map([['photo-other', 'photos/other.jpg']]),
  existingEntryIds: new Set(['recovered-a', 'recovered-b']),
};

function record(overrides: Partial<CloudConflictRecord>): CloudConflictRecord {
  return {
    conflictId: 'c',
    entityType: 'profile',
    field: 'displayName',
    alternateValue: undefined,
    recoveredEntityIds: [],
    createdAt: JOINED_AT + 1,
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
      field: 'displayName',
      alternateValue: null,
      recoveredEntityIds: [],
      createdAt: 5,
    });
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
      { kind: 'name', conflictIds: ['n1', 'n2'], current: 'Mehra', other: 'Mehra A' },
      { kind: 'name', conflictIds: ['n3'], current: 'Mehra', other: null },
    ]);
  });

  test('hides a name that already matches the current one', () => {
    expect(deriveConflictItems([record({ alternateValue: 'Mehra' })], context)).toEqual(
      [],
    );
  });

  test('lists a photo only when the other file exists and differs from the current one', () => {
    const photo = (conflictId: string, alternateValue: string | null) =>
      record({ conflictId, field: 'photoAssetId', alternateValue });
    expect(
      deriveConflictItems(
        [
          photo('p1', 'photo-other'),
          photo('p2', 'photo-missing'),
          photo('p3', 'photo-current'),
          photo('p4', null),
        ],
        context,
      ),
    ).toEqual([
      {
        kind: 'photo',
        conflictIds: ['p1'],
        otherAssetId: 'photo-other',
        otherUri: 'photos/other.jpg',
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
