import { deleteEntry } from './entryDeletion';

const mockGetEntryById = jest.fn();
const mockDeleteEntryRecord = jest.fn();
const mockDeletePhotoFile = jest.fn();
const mockDeleteVoiceMemoFile = jest.fn();

jest.mock('~/db/queries', () => ({
  getEntryById: (noteId: string) => mockGetEntryById(noteId),
  deleteEntryRecord: (noteId: string) => mockDeleteEntryRecord(noteId),
}));

jest.mock('~/lib/photoUtils', () => ({
  deletePhotoFile: (uri: string) => mockDeletePhotoFile(uri),
}));

jest.mock('~/lib/voiceMemoUtils', () => ({
  deleteVoiceMemoFile: (uri: string) => mockDeleteVoiceMemoFile(uri),
}));

describe('deleteEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteEntryRecord.mockResolvedValue(undefined);
  });

  test('delegates the atomic tombstone, hard delete, and retention write', async () => {
    mockGetEntryById.mockResolvedValue({
      note_id: 'entry-1',
      assets: [
        { type: 'IMAGE', uri: 'photos/photo-1.jpg' },
        { type: 'AUDIO', uri: 'voice_memos/memo-1.m4a' },
        { type: 'IMAGE', uri: 'photos/photo-2.jpg' },
      ],
    });

    await deleteEntry('entry-1');

    expect(mockDeleteEntryRecord).toHaveBeenCalledWith('entry-1');
    expect(mockGetEntryById).not.toHaveBeenCalled();
    expect(mockDeletePhotoFile).not.toHaveBeenCalled();
    expect(mockDeleteVoiceMemoFile).not.toHaveBeenCalled();
  });

  test('does not remove media when deleting the database record fails', async () => {
    mockGetEntryById.mockResolvedValue({
      note_id: 'entry-1',
      assets: [{ type: 'IMAGE', uri: 'photos/photo-1.jpg' }],
    });
    mockDeleteEntryRecord.mockRejectedValue(new Error('database unavailable'));

    await expect(deleteEntry('entry-1')).rejects.toThrow('database unavailable');

    expect(mockDeletePhotoFile).not.toHaveBeenCalled();
    expect(mockDeleteVoiceMemoFile).not.toHaveBeenCalled();
  });

  test('is idempotent when the entry record is already missing', async () => {
    mockGetEntryById.mockResolvedValue(undefined);

    await expect(deleteEntry('missing-entry')).resolves.toBeUndefined();

    expect(mockDeleteEntryRecord).toHaveBeenCalledWith('missing-entry');
    expect(mockDeletePhotoFile).not.toHaveBeenCalled();
    expect(mockDeleteVoiceMemoFile).not.toHaveBeenCalled();
  });
});
