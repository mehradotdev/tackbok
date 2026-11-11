import { File } from 'expo-file-system';
import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

type BackupExportSaveNativeModule = {
  saveZip(sourceUri: string, suggestedFileName: string): Promise<void>;
  saveFile(sourceUri: string, suggestedFileName: string, mimeType: string): Promise<void>;
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

/** Android save-as for a single stored file, e.g. a photo or voice note. */
export async function saveFileWithAndroidDocumentPicker(
  sourceUri: string,
  fileName: string,
  mimeType: string,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Android file save is only available on Android');
  }

  await getAndroidSaveModule().saveFile(sourceUri, fileName, mimeType);
}

/** True when the user dismissed the Android save dialog without picking a destination. */
export function isAndroidSaveCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String(error.code).includes('CANCELLED')
  );
}
