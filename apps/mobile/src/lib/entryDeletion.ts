import { getEntryById, deleteEntryRecord } from '~/db/queries';
import { AssetType } from '~/types';
import { deletePhotoFile } from '~/lib/photoUtils';
import { deleteVoiceMemoFile } from '~/lib/voiceMemoUtils';

/**
 * Delete an entry and the media files owned by it.
 *
 * The entry is read before its database record is removed so its denormalized
 * asset list remains available for filesystem cleanup. The database delete
 * happens first: if it fails, the entry and its media both remain intact.
 */
export async function deleteEntry(noteId: string): Promise<void> {
  const entry = await getEntryById(noteId);

  await deleteEntryRecord(noteId);

  for (const asset of entry?.assets ?? []) {
    if (asset.type === AssetType.IMAGE) {
      deletePhotoFile(asset.uri);
    } else if (asset.type === AssetType.AUDIO) {
      deleteVoiceMemoFile(asset.uri);
    }
  }
}
