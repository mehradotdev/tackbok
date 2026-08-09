import * as DocumentPicker from 'expo-document-picker';
import type {
  PortableEntry,
  PortablePrompt,
  PortableTag,
} from '../types';

export function getImportTotals(
  portableEntries: PortableEntry[],
  portableTags: PortableTag[],
  portablePrompts: PortablePrompt[],
) {
  return {
    totalEntries: portableEntries.length,
    totalTags: portableTags.length,
    totalPrompts: portablePrompts.length,
  };
}

export async function pickZipImportFile(): Promise<DocumentPicker.DocumentPickerSuccessResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });

  return result.canceled ? null : result;
}
