import { File } from 'expo-file-system';
import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

type BackupExportSaveNativeModule = {
  saveZip(sourceUri: string, suggestedFileName: string): Promise<void>;
};

function getAndroidSaveModule(): BackupExportSaveNativeModule {
  try {
    return requireNativeModule<BackupExportSaveNativeModule>('BackupExportSaveModule');
  } catch (error) {
    throw new Error('Android backup save module is unavailable', {
      cause: error,
    });
  }
}

/**
 * Android export needs a native save-as flow because ACTION_CREATE_DOCUMENT returns a SAF
 * content URI. The backup ZIP is created with expo-file-system, but writing the final user-picked
 * destination reliably requires Android's ContentResolver output stream API.
 */
export async function saveZipWithAndroidDocumentPicker(
  file: File,
  fileName: string,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Android backup save is only available on Android');
  }

  await getAndroidSaveModule().saveZip(file.uri, fileName);
}