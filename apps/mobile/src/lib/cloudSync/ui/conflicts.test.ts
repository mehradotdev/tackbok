import { resolveNameConflict, resolvePhotoConflict } from './conflicts';

const mockEvents: unknown[][] = [];
const mockSetProfileName = jest.fn(async (name: string | null) => {
  mockEvents.push(['setProfileName', name]);
});
const mockUpdateProfile = jest.fn(async (_tx: unknown, update: unknown) => {
  mockEvents.push(['updateProfile', update]);
});
const mockHydrate = jest.fn();
const mockNotify = jest.fn();

jest.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown) => ({ inArray: [column, values] }),
  isNull: (column: unknown) => ({ isNull: column }),
  isNotNull: (column: unknown) => ({ isNotNull: column }),
}));
jest.mock('~/db', () => ({
  runExclusiveDbTransaction: async (operation: (tx: unknown) => Promise<void>) =>
    operation({
      update: () => ({
        set: (values: unknown) => ({
          where: async (condition: unknown) => {
            mockEvents.push(['acknowledge', values, condition]);
          },
        }),
      }),
    }),
  db: {
    select: () => ({
      from: () => ({ limit: async () => [{ vault_id: 'vault' }] }),
    }),
  },
  cloudConflicts: { vault_id: 'vault_id', conflict_id: 'conflict_id' },
  cloudVault: {},
  entries: {},
  mediaAssets: {},
  userProfile: {},
}));
jest.mock('~/lib/photoUtils', () => ({ photoFileExists: () => true }));
jest.mock('~/lib/settings', () => ({
  hydrateProfileCache: (profile: unknown) => mockHydrate(profile),
  useSettingsStore: {
    getState: () => ({
      profileName: 'Mehra',
      profileEmail: 'me@example.com',
      setProfileName: mockSetProfileName,
    }),
  },
}));
jest.mock('../runtime/production', () => ({
  notifyProductionCloudSyncChanged: () => mockNotify(),
}));
jest.mock('../storage/repositories', () => ({
  runInCloudSyncTransaction: async (operation: (tx: unknown) => Promise<void>) =>
    operation('tx'),
  updateProfileInTransaction: (tx: unknown, update: unknown) =>
    mockUpdateProfile(tx, update),
}));

beforeEach(() => {
  mockEvents.length = 0;
  jest.clearAllMocks();
});

const acknowledged = (ids: string[]) => [
  'acknowledge',
  { acknowledged_at: expect.any(Number) },
  {
    and: [
      { eq: ['vault_id', 'vault'] },
      { inArray: ['conflict_id', ids] },
      { isNull: undefined },
    ],
  },
];

describe('resolveNameConflict', () => {
  const item = {
    kind: 'name' as const,
    conflictIds: ['n1', 'n2'],
    current: 'Mehra',
    other: 'Mehra A',
    archived: false,
  };

  test('"Use" saves the other name through the profile write path, then dismisses the row', async () => {
    await resolveNameConflict(item, 'use');
    expect(mockEvents).toEqual([
      ['setProfileName', 'Mehra A'],
      acknowledged(['n1', 'n2']),
    ]);
    expect(mockNotify).toHaveBeenCalled();
  });

  test('"Use" with no other name clears the name', async () => {
    await resolveNameConflict({ ...item, other: null }, 'use');
    expect(mockSetProfileName).toHaveBeenCalledWith(null);
  });

  test('"Keep current" only dismisses the row', async () => {
    await resolveNameConflict(item, 'keep');
    expect(mockEvents).toEqual([acknowledged(['n1', 'n2'])]);
  });

  test('a failed profile write leaves the row in place', async () => {
    mockSetProfileName.mockRejectedValueOnce(new Error('write failed'));
    await expect(resolveNameConflict(item, 'use')).rejects.toThrow('write failed');
    expect(mockEvents).toEqual([]);
  });
});

describe('resolvePhotoConflict', () => {
  const item = {
    kind: 'photo' as const,
    conflictIds: ['p1'],
    otherAssetId: 'photo-other',
    otherUri: 'photos/other.jpg',
  };

  test('"Use this photo" points the profile at the existing asset, then dismisses the row', async () => {
    await resolvePhotoConflict(item, 'use');
    expect(mockEvents).toEqual([
      ['updateProfile', { photoAssetId: 'photo-other', photoUri: 'photos/other.jpg' }],
      acknowledged(['p1']),
    ]);
    expect(mockHydrate).toHaveBeenCalledWith({
      profileName: 'Mehra',
      profileEmail: 'me@example.com',
      profileImageUri: 'photos/other.jpg',
    });
  });

  test('"Keep current" only dismisses the row', async () => {
    await resolvePhotoConflict(item, 'keep');
    expect(mockEvents).toEqual([acknowledged(['p1'])]);
    expect(mockHydrate).not.toHaveBeenCalled();
  });
});
