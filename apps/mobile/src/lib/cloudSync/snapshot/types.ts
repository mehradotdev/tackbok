export type Mood = 'AMAZING' | 'HAPPY' | 'OKAY' | 'SAD' | 'AWFUL';
export type EntityType = 'entry' | 'tag' | 'prompt' | 'profile';
export type AssetKind = 'photo' | 'voice' | 'profile-photo';
export type ConflictField =
  | 'title'
  | 'content'
  | 'mood'
  | 'displayName'
  | 'photoAssetId'
  | 'tagMembership'
  | 'assetReference'
  | 'deleteEdit'
  | 'referencedDelete';

export interface ObservedDeviceHead {
  deviceId: string;
  deviceSequence: number;
  snapshotId: string;
}

export interface SnapshotEntry {
  entryId: string;
  title: string | null;
  content: string | null;
  mood: Mood | null;
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface SnapshotTag {
  tagId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface SnapshotEntryTag {
  entryId: string;
  tagId: string;
  createdAt: number;
}

export interface SnapshotPrompt {
  promptId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface SnapshotProfile {
  profileId: 'profile';
  displayName: string | null;
  photoAssetId: string | null;
  updatedAt: number;
}

export interface SnapshotMedia {
  assetId: string;
  ownerType: 'entry' | 'profile';
  ownerId: string;
  kind: AssetKind;
  blobHash: string;
  mimeType: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SnapshotTombstone {
  entityType: EntityType;
  entityId: string;
  baseStateHash: string | null;
  deletedStateHash: string | null;
  deletedByDeviceId: string;
  deletionSequence: number;
}

export interface SnapshotConflictAlternate {
  valueHash: string;
  value: string | null;
}

export interface SnapshotConflict {
  conflictId: string;
  entityType: EntityType;
  entityId: string;
  field: ConflictField;
  baseValueHash: string | null;
  localValueHash: string | null;
  remoteValueHash: string | null;
  primaryValueHash: string | null;
  alternates: SnapshotConflictAlternate[];
  recoveredEntityIds: string[];
}

export interface SnapshotDomain {
  entries: SnapshotEntry[];
  tags: SnapshotTag[];
  entryTags: SnapshotEntryTag[];
  prompts: SnapshotPrompt[];
  profile: SnapshotProfile;
  media: SnapshotMedia[];
  tombstones: SnapshotTombstone[];
  conflicts: SnapshotConflict[];
}

export interface JournalSnapshotPayload extends SnapshotDomain {
  format: 'tackbok-snapshot';
  vaultId: string;
  parentSnapshotIds: string[];
  observedDeviceHeads: ObservedDeviceHead[];
  authorDeviceId: string;
  deviceSequence: number;
  createdAt: number;
}

export interface StoredJournalSnapshot {
  snapshotId: string;
  payload: JournalSnapshotPayload;
}

export interface EncodedSnapshot extends StoredJournalSnapshot {
  canonicalBytes: Uint8Array;
  compressedBytes: Uint8Array;
}
