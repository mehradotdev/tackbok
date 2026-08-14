export type MoodV2 = 'AMAZING' | 'HAPPY' | 'OKAY' | 'SAD' | 'AWFUL';
export type EntityTypeV2 = 'entry' | 'tag' | 'prompt' | 'profile';
export type AssetKindV2 = 'photo' | 'voice' | 'profile-photo';
export type ConflictFieldV2 =
  | 'title'
  | 'content'
  | 'mood'
  | 'displayName'
  | 'photoAssetId'
  | 'tagMembership'
  | 'assetReference'
  | 'deleteEdit'
  | 'referencedDelete';

export interface ObservedDeviceHeadV2 {
  deviceId: string;
  deviceSequence: number;
  snapshotId: string;
}

export interface SnapshotEntryV2 {
  entryId: string;
  title: string | null;
  content: string | null;
  mood: MoodV2 | null;
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface SnapshotTagV2 {
  tagId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface SnapshotEntryTagV2 {
  entryId: string;
  tagId: string;
  createdAt: number;
}

export interface SnapshotPromptV2 {
  promptId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface SnapshotProfileV2 {
  profileId: 'profile';
  displayName: string | null;
  photoAssetId: string | null;
  updatedAt: number;
}

export interface SnapshotMediaV2 {
  assetId: string;
  ownerType: 'entry' | 'profile';
  ownerId: string;
  kind: AssetKindV2;
  blobHash: string;
  mimeType: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SnapshotTombstoneV2 {
  entityType: EntityTypeV2;
  entityId: string;
  baseStateHash: string | null;
  deletedStateHash: string | null;
  deletedByDeviceId: string;
  deletionSequence: number;
}

export interface SnapshotConflictAlternateV2 {
  valueHash: string;
  value: string | null;
}

export interface SnapshotConflictV2 {
  conflictId: string;
  entityType: EntityTypeV2;
  entityId: string;
  field: ConflictFieldV2;
  baseValueHash: string | null;
  localValueHash: string | null;
  remoteValueHash: string | null;
  primaryValueHash: string | null;
  alternates: SnapshotConflictAlternateV2[];
  recoveredEntityIds: string[];
}

export interface SnapshotDomainV2 {
  entries: SnapshotEntryV2[];
  tags: SnapshotTagV2[];
  entryTags: SnapshotEntryTagV2[];
  prompts: SnapshotPromptV2[];
  profile: SnapshotProfileV2;
  media: SnapshotMediaV2[];
  tombstones: SnapshotTombstoneV2[];
  conflicts: SnapshotConflictV2[];
}

export interface JournalSnapshotPayloadV2 extends SnapshotDomainV2 {
  format: 'tackbok-snapshot';
  formatVersion: 2;
  vaultId: string;
  parentSnapshotIds: string[];
  observedDeviceHeads: ObservedDeviceHeadV2[];
  authorDeviceId: string;
  deviceSequence: number;
  createdAt: number;
}

export interface StoredJournalSnapshotV2 {
  snapshotId: string;
  payload: JournalSnapshotPayloadV2;
}

export interface EncodedSnapshotV2 extends StoredJournalSnapshotV2 {
  canonicalBytes: Uint8Array;
  compressedBytes: Uint8Array;
}

