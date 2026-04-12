import type { Asset, Mood } from '~/types';

export type ImportMode = 'skip' | 'overwrite';
export type BackupImportSource = 'tackbok' | 'gratitudeApp' | 'presently';
export type BackupImportPhase =
  | 'reading'
  | 'validating'
  | 'profile'
  | 'taxonomy'
  | 'entries'
  | 'finishing';

export interface BackupImportSummary {
  importedEntries: number;
  updatedEntries: number;
  skippedEntries: number;
  importedPrompts: number;
  importedTags: number;
  importedPhotos: number;
  importedAudio: number;
}

export interface BackupImportProgress {
  source: BackupImportSource;
  phase: BackupImportPhase;
  progress: number;
  phaseProgress: number;
  totalEntries: number;
  processedEntries: number;
  totalTags: number;
  totalPrompts: number;
  importedPhotos: number;
  importedAudio: number;
  importedTags: number;
  importedPrompts: number;
}

export type BackupImportProgressMetrics = Omit<
  BackupImportProgress,
  'source' | 'phase' | 'progress' | 'phaseProgress'
>;

export interface TackbokBackupManifest {
  format: 'tackbok-backup';
  backupVersion: 1;
  exportedAt: string;
  counts: {
    entries: number;
    tags: number;
    customPrompts: number;
    photos: number;
    voiceMemos: number;
  };
}

export interface PortableTag {
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface PortablePrompt {
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface PortableAsset {
  type: Asset['type'];
  path: string;
  width?: number;
  height?: number;
}

export interface PortableEntry {
  noteId: string;
  textTitle: string | null;
  textContent: string | null;
  mood: Mood | null;
  tagTitles: string[];
  createdAt: number;
  updatedAt: number;
  assets: PortableAsset[];
}

export interface PortableProfile {
  name: string | null;
  email: string | null;
  imagePath: string | null;
}

export interface GratitudeAppTagRecord {
  title: string;
  createdAt?: number;
}

export interface GratitudeAppEntryRecord {
  noteId: string;
  noteText: string | null;
  createdOn: number;
  updatedOn: number;
  prompt: string | null;
  imagePath: string | null;
}

export interface GratitudeAppAssetRecord {
  entityId: string;
  assetType: 'image' | 'audio';
  assetPath: string | null;
  index?: number;
  createdAt?: number;
}

export interface GratitudeAppPromptRecord {
  text: string;
}

export interface GratitudeAppRecordingRecord {
  noteId: string;
  recordingPath: string;
}

export interface GratitudeAppConfigRecord {
  Name?: string | null;
  'Email Id'?: string | null;
  'Profile Image Name'?: string | null;
}

export const BACKUP_MANIFEST_PATH = 'manifest.json';
export const BACKUP_ENTRIES_PATH = 'data/entries.json';
export const BACKUP_TAGS_PATH = 'data/tags.json';
export const BACKUP_PROMPTS_PATH = 'data/custom-prompts.json';
export const BACKUP_PROFILE_PATH = 'data/profile.json';
export const BACKUP_MEDIA_PREFIX = 'media';

export const GRATITUDE_APP_ENTRIES_PATH = 'gratitudeEntries.json';
export const GRATITUDE_APP_ASSETS_PATH = 'gratitudeAssets.json';
export const GRATITUDE_APP_PROMPTS_PATH = 'gratitudePrompts.json';
export const GRATITUDE_APP_TAGS_PATH = 'journalTags.json';
export const GRATITUDE_APP_RECORDINGS_PATH = 'journalRecordings.json';
export const GRATITUDE_APP_CONFIG_PATH = 'gratitudeConfig.json';
export const GRATITUDE_APP_IMAGES_DIR = 'gratitudeImages';
export const GRATITUDE_APP_RECORDINGS_DIR = 'journalRecordingsFolder';

export const IMPORT_PHASE_ORDER: readonly BackupImportPhase[] = [
  'reading',
  'validating',
  'profile',
  'taxonomy',
  'entries',
  'finishing',
];

export const PRESENTLY_IMPORT_PHASE_ORDER: readonly BackupImportPhase[] = [
  'reading',
  'entries',
  'finishing',
];
