import * as DocumentPicker from 'expo-document-picker';
import { useSettingsStore } from '~/lib/settings';
import type {
  PortableEntry,
  PortableProfile,
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

export function applyImportedProfile(
  profile: PortableProfile,
  imageUri: string | null,
): Promise<void> {
  const settingsState = useSettingsStore.getState();
  return Promise.all([
    settingsState.setProfileName(profile.name ?? null),
    settingsState.setProfileEmail(profile.email ?? null),
    settingsState.setProfileImageUri(imageUri),
  ]).then(() => undefined);
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
