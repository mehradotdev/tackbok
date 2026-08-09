import { canonicalizeJsonV1 } from '../codec';
import { PROTOCOL_V1_CAPS } from '../protocol/validationCaps';
import { createEditVersion } from './version';
import type {
  AssetDescriptor,
  ConflictRecord,
  DomainState,
  EntityVersionBody,
  EntryState,
} from './types';
import {
  parseAndValidateRevocationMarker,
  validateConflictRecord,
  validateMetadataDepth,
  validateVaultMarkerBytes,
  validateVersionBody,
} from './validation';

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

const asset = (overrides: Partial<AssetDescriptor> = {}): AssetDescriptor => ({
  assetId: 'asset',
  kind: 'photo',
  mimeType: 'image/jpeg',
  byteSize: 1,
  width: 1,
  height: 1,
  durationMs: null,
  blobHash: 'a'.repeat(64),
  ...overrides,
});

const entry = (overrides: Partial<EntryState> = {}): EntryState => ({
  entityType: 'entry',
  title: null,
  content: 'body',
  mood: null,
  tagIds: [],
  assets: [],
  createdAt: 1,
  updatedAt: 1,
  conflictOriginId: null,
  ...overrides,
});

function body(
  state: DomainState = entry(),
  overrides: Partial<EntityVersionBody> = {},
): EntityVersionBody {
  return {
    ...createEditVersion({
      vaultId: 'vault',
      entityType: state.entityType,
      entityId: state.entityType === 'profile' ? 'profile' : 'entity',
      parents: [],
      state,
      authorDeviceId: 'device',
      editSequence: 1,
      batchId: 'batch',
      authoredAt: 1,
    }).body,
    ...overrides,
  } as EntityVersionBody;
}

function expectValid(value: EntityVersionBody): void {
  expect(() =>
    validateVersionBody(value, {
      vaultId: 'vault',
      entityType: value.entityType,
      entityId: value.entityId,
    }),
  ).not.toThrow();
}

function expectTooLarge(value: EntityVersionBody): void {
  expect(() =>
    validateVersionBody(value, {
      vaultId: 'vault',
      entityType: value.entityType,
      entityId: value.entityId,
    }),
  ).toThrow();
}

test('enforces every scalar UTF-8 cap at the boundary', () => {
  const cases: [number, (value: string) => EntityVersionBody][] = [
    [PROTOCOL_V1_CAPS.entityIdUtf8Bytes, (value) => body(entry(), { entityId: value })],
    [
      PROTOCOL_V1_CAPS.deviceIdUtf8Bytes,
      (value) => body(entry(), { authorDeviceId: value } as Partial<EntityVersionBody>),
    ],
    [
      PROTOCOL_V1_CAPS.batchIdUtf8Bytes,
      (value) => body(entry(), { batchId: value } as Partial<EntityVersionBody>),
    ],
    [PROTOCOL_V1_CAPS.titleUtf8Bytes, (value) => body(entry({ title: value }))],
    [PROTOCOL_V1_CAPS.entryContentUtf8Bytes, (value) => body(entry({ content: value }))],
    [
      PROTOCOL_V1_CAPS.displayNameUtf8Bytes,
      (value) => body({ entityType: 'profile', displayName: value, photo: null }),
    ],
    [
      PROTOCOL_V1_CAPS.promptTextUtf8Bytes,
      (value) =>
        body({
          entityType: 'prompt',
          title: value,
          createdAt: 1,
          updatedAt: 1,
          conflictOriginId: null,
        }),
    ],
    [
      PROTOCOL_V1_CAPS.mimeTypeUtf8Bytes,
      (value) => body(entry({ assets: [asset({ mimeType: value })] })),
    ],
  ];
  for (const [cap, make] of cases) {
    expectValid(make('x'.repeat(cap)));
    expectTooLarge(make('x'.repeat(cap + 1)));
  }
});

test('enforces parent, recovery, tag, asset, and media-count caps', () => {
  const hash = 'b'.repeat(64);
  expectValid(body(entry(), { parents: Array(PROTOCOL_V1_CAPS.parentCount).fill(hash) }));
  expectTooLarge(
    body(entry(), { parents: Array(PROTOCOL_V1_CAPS.parentCount + 1).fill(hash) }),
  );
  const recovery = { entityType: 'entry' as const, entityId: 'r', versionHash: hash };
  expectValid(
    body(entry(), {
      recoveries: Array(PROTOCOL_V1_CAPS.recoveryDependencyCount).fill(recovery),
    }),
  );
  expectTooLarge(
    body(entry(), {
      recoveries: Array(PROTOCOL_V1_CAPS.recoveryDependencyCount + 1).fill(recovery),
    }),
  );
  expectValid(
    body(
      entry({
        tagIds: Array.from(
          { length: PROTOCOL_V1_CAPS.tagIdsPerEntry },
          (_, index) => `tag-${index}`,
        ),
      }),
    ),
  );
  expectTooLarge(
    body(
      entry({
        tagIds: Array.from(
          { length: PROTOCOL_V1_CAPS.tagIdsPerEntry + 1 },
          (_, index) => `tag-${index}`,
        ),
      }),
    ),
  );
  expectValid(body(entry({ assets: Array(PROTOCOL_V1_CAPS.assetsPerEntity).fill(asset()) })));
  expectTooLarge(
    body(entry({ assets: Array(PROTOCOL_V1_CAPS.assetsPerEntity + 1).fill(asset()) })),
  );
  expectValid(body(entry({ assets: [asset({ byteSize: PROTOCOL_V1_CAPS.maximumMediaBytes })] })));
  expectTooLarge(
    body(entry({ assets: [asset({ byteSize: PROTOCOL_V1_CAPS.maximumMediaBytes + 1 })] })),
  );
});

test('enforces exact entity-version bytes and metadata depth', () => {
  const tagIds = Array.from({ length: PROTOCOL_V1_CAPS.tagIdsPerEntry }, (_, index) =>
    `${index.toString().padStart(3, '0')}${'t'.repeat(PROTOCOL_V1_CAPS.entityIdUtf8Bytes - 3)}`,
  );
  const assets = Array.from({ length: PROTOCOL_V1_CAPS.assetsPerEntity }, (_, index) =>
    asset({
      assetId: `${index.toString().padStart(3, '0')}${'a'.repeat(PROTOCOL_V1_CAPS.entityIdUtf8Bytes - 3)}`,
      mimeType: 'm'.repeat(PROTOCOL_V1_CAPS.mimeTypeUtf8Bytes),
    }),
  );
  const baseline = body(entry({ content: '', tagIds, assets }));
  const baselineBytes = new TextEncoder().encode(
    canonicalizeJsonV1(baseline as never),
  ).byteLength;
  const remaining = PROTOCOL_V1_CAPS.entityVersionJsonBytes - baselineBytes;
  expect(remaining).toBeGreaterThan(0);
  expect(remaining).toBeLessThanOrEqual(PROTOCOL_V1_CAPS.entryContentUtf8Bytes);
  expectValid(body(entry({ content: 'c'.repeat(remaining), tagIds, assets })));
  expectTooLarge(body(entry({ content: 'c'.repeat(remaining + 1), tagIds, assets })));

  let atLimit: unknown = 'leaf';
  for (let depth = 0; depth < PROTOCOL_V1_CAPS.maximumMetadataDepth; depth++) {
    atLimit = [atLimit];
  }
  expect(() => validateMetadataDepth(atLimit)).not.toThrow();
  expect(() => validateMetadataDepth([atLimit])).toThrow();
});

test('enforces scalar-alternate, vault, and revocation JSON caps and formats', () => {
  const conflict: ConflictRecord = {
    conflictId: 'conflict',
    entityType: 'entry',
    entityId: 'entry',
    headHashes: [],
    resolutionType: 'scalar-alternate',
    alternates: [{ representativeHash: 'a'.repeat(64), values: { mood: 'x' } }],
    recoveredEntityIds: [],
  };
  expect(() => validateConflictRecord(conflict)).not.toThrow();
  conflict.alternates[0].values.mood = 'x'.repeat(PROTOCOL_V1_CAPS.scalarAlternateJsonBytes);
  expect(() => validateConflictRecord(conflict)).toThrow();

  const vault = bytes({ magic: 'tackbok-vault', formatVersion: 1, vaultId: 'vault' });
  expect(() => validateVaultMarkerBytes(vault)).not.toThrow();
  expect(() =>
    validateVaultMarkerBytes(new Uint8Array(PROTOCOL_V1_CAPS.vaultJsonBytes + 1)),
  ).toThrow();
  const revocation = bytes({
    formatVersion: 1,
    vaultId: 'vault',
    kind: 'backup-deleted',
    revocationId: 'r',
    timestamp: 1,
  });
  expect(parseAndValidateRevocationMarker(revocation, 'vault')).toEqual({
    kind: 'backup-deleted',
  });
  expect(() =>
    parseAndValidateRevocationMarker(
      new Uint8Array(PROTOCOL_V1_CAPS.revocationJsonBytes + 1),
      'vault',
    ),
  ).toThrow();
});
