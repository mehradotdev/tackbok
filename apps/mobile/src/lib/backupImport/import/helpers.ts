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
): void {
  const settingsState = useSettingsStore.getState();
  settingsState.setProfileName(profile.name ?? null);
  settingsState.setProfileEmail(profile.email ?? null);
  settingsState.setProfileImageUri(imageUri);
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