import { createHash } from 'node:crypto';

import { canonicalizeJsonV1, type CanonicalJsonValue } from '../protocol/canonicalJsonV1';
import { runCanonicalFixtureDeviceProbe } from './deviceFixtureProbe';
import canonicalFixture from './fixtures/canonical-v1.json';
import goldenFixture from './fixtures/golden-v1.json';
import { PROTOCOL_V1_CAPS } from '../protocol/validationCaps';

const REQUIRED_SCENARIOS = [
  'tiny-vault',
  'linear-history',
  'symmetric-fork',
  'asymmetric-fork',
  'three-head-fork',
  'criss-cross-multiple-merge-base',
  'set-merge-fork',
  'text-conflict-recovered-copy',
  'scalar-conflict-stored-alternates',
  'delete-edit-fork',
  'raced-double-resolution',
  'dirty-local-vs-pulled-remote',
  'dirty-local-delete-vs-remote-edit',
  'generation-n-plus-one-during-sync',
  'clean-then-local-edit-before-apply',
  'publish-crash-blob',
  'publish-crash-provisional',
  'publish-crash-recovery-init',
  'publish-crash-resolution',
  'vault-revocation-journal-deleted',
  'vault-revocation-backup-deleted',
  'concurrent-destructive-actions',
  'initial-seeding-raced-edit',
  'initial-seeding-ahead-of-cursor-edit',
  'profile-name-photo-conflict',
  'blob-multiple-obligations',
  'zip-v1-stable-identity-roundtrip',
  'child-before-parent-delivery',
  'missing-parent',
  'corrupt-parent',
  'cross-entity-parent',
  'missing-recovery-dependency',
  'ancestry-cycle-rejection',
  'tombstoned-tag-concurrent-reference',
] as const;

describe('Phase-0 canonical-json-v1 fixtures', () => {
  it.each(canonicalFixture.vectors)('$id is byte-identical and hash-stable', (vector) => {
    const canonical = canonicalizeJsonV1(vector.value as unknown as CanonicalJsonValue);
    expect(canonical).toBe(vector.canonical);
    expect(createHash('sha256').update(canonical, 'utf8').digest('hex')).toBe(vector.sha256);
  });

  it('rejects every forbidden JSON input class', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse: unknown[] = [];
    sparse.length = 1;
    const symbolKeyed = { valid: true } as Record<PropertyKey, unknown>;
    symbolKeyed[Symbol('hidden')] = true;
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => true,
    });
    const cases: unknown[] = [
      1.5,
      -0,
      { value: undefined },
      { ['Cafe\u0301']: true },
      '\ud800',
      cyclic,
      sparse,
      () => true,
      symbolKeyed,
      accessor,
      new Date(0),
    ];

    expect(cases).toHaveLength(canonicalFixture.reject.length);
    for (const value of cases) {
      expect(() => canonicalizeJsonV1(value as CanonicalJsonValue)).toThrow(TypeError);
    }
  });

  it('exposes the same byte comparison used by the physical-device gate', () => {
    const report = runCanonicalFixtureDeviceProbe();
    expect(report.passed).toBe(true);
    expect(report.vectors).toHaveLength(canonicalFixture.vectors.length);
  });
});

describe('Phase-0 semantic fixture catalog', () => {
  it('contains every scenario required by the frozen plan exactly once', () => {
    const ids = goldenFixture.scenarios.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...REQUIRED_SCENARIOS].sort());
  });

  it('freezes a boundary fixture for every numeric validation cap', () => {
    const fixtureCaps = goldenFixture.capFixtures.map(({ cap }) => cap).sort();
    expect(fixtureCaps).toEqual(Object.keys(PROTOCOL_V1_CAPS).sort());
    expect(Object.values(PROTOCOL_V1_CAPS).every(Number.isSafeInteger)).toBe(true);
    expect(Object.values(PROTOCOL_V1_CAPS).every((value) => value > 0)).toBe(true);
  });
});
