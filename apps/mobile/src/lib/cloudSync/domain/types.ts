export type EntityType = 'entry' | 'tag' | 'prompt' | 'profile';
export type VersionKind = 'edit' | 'resolution' | 'recovery-init' | 'join';

export interface AssetDescriptor {
  assetId: string;
  kind: 'photo' | 'voice' | 'profile-photo';
  mimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  blobHash: string;
}

export interface EntryState {
  entityType: 'entry';
  title: string | null;
  content: string | null;
  mood: string | null;
  tagIds: string[];
  assets: AssetDescriptor[];
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface TagState {
  entityType: 'tag';
  title: string;
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface PromptState {
  entityType: 'prompt';
  title: string;
  createdAt: number;
  updatedAt: number;
  conflictOriginId: string | null;
}

export interface ProfileState {
  entityType: 'profile';
  displayName: string | null;
  photo: AssetDescriptor | null;
}

export type DomainState = EntryState | TagState | PromptState | ProfileState;

export interface RecoveryRef {
  entityType: EntityType;
  entityId: string;
  versionHash: string;
}

interface VersionBase {
  formatVersion: 1;
  vaultId: string;
  entityType: EntityType;
  entityId: string;
  kind: VersionKind;
  parents: string[];
  state: DomainState | null;
  deleted: boolean;
  recoveries: RecoveryRef[];
  derivedTimestamp: number | null;
}

export interface EditVersionBody extends VersionBase {
  kind: 'edit';
  authorDeviceId: string;
  editSequence: number;
  batchId: string | null;
  authoredAt: number;
}

export interface SystemVersionBody extends VersionBase {
  kind: 'resolution' | 'recovery-init' | 'join';
}

export type EntityVersionBody = EditVersionBody | SystemVersionBody;

export interface HashedVersion {
  hash: string;
  canonical: string;
  body: EntityVersionBody;
  status: 'provisional' | 'incomplete' | 'complete';
  published: boolean;
}

export interface ConflictAlternate {
  representativeHash: string;
  values: Record<string, string | number | null | AssetDescriptor>;
}

export interface ConflictRecord {
  conflictId: string;
  entityType: EntityType;
  entityId: string;
  headHashes: string[];
  resolutionType: string;
  alternates: ConflictAlternate[];
  recoveredEntityIds: string[];
}

export function sortAssetDescriptors(assets: AssetDescriptor[]): AssetDescriptor[] {
  return [...assets].sort((left, right) => left.assetId.localeCompare(right.assetId));
}

export function normalizeDomainState(state: DomainState): DomainState {
  if (state.entityType === 'entry') {
    return {
      ...state,
      tagIds: Array.from(new Set(state.tagIds)).sort(),
      assets: sortAssetDescriptors(state.assets),
    };
  }
  return state;
}

export function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
