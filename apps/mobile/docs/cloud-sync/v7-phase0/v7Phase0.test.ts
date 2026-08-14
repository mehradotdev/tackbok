import { createHash } from 'node:crypto';
import canonicalFixture from './fixtures/canonical-v2.json';
import mergeFixture from './fixtures/merge-golden-v2.json';
import { canonicalizeV2, type CanonicalV2 } from './tools/canonicalV2';

function rejectedValue(kind: string): unknown {
  switch (kind) {
    case 'negative-zero': return -0;
    case 'unsafe-integer': return Number.MAX_SAFE_INTEGER + 1;
    case 'nan': return Number.NaN;
    case 'infinity': return Number.POSITIVE_INFINITY;
    case 'undefined': return undefined;
    case 'bigint': return BigInt(1);
    case 'unpaired-high-surrogate': return '\ud800';
    case 'unpaired-low-surrogate': return '\udc00';
    case 'cycle': { const value: unknown[] = []; value.push(value); return value; }
    default: throw new Error(`Unknown rejection kind ${kind}`);
  }
}

describe('V7-0 frozen canonical JSON fixtures', () => {
  it.each(canonicalFixture.vectors)('$id is byte- and hash-identical', (vector) => {
    const canonical = canonicalizeV2(vector.value as CanonicalV2);
    expect(canonical).toBe(vector.canonical);
    expect(createHash('sha256').update(canonical, 'utf8').digest('hex')).toBe(vector.sha256);
  });

  it.each(canonicalFixture.reject)('$id is rejected', (vector) => {
    const value = vector.kind === 'number' ? vector.value : rejectedValue(vector.kind);
    expect(() => canonicalizeV2(value as CanonicalV2)).toThrow(TypeError);
  });

  it('does not normalize authored Unicode', () => {
    const composed = canonicalizeV2({ text: 'Café' });
    const decomposed = canonicalizeV2({ text: 'Café' });
    expect(composed).not.toBe(decomposed);
    expect(createHash('sha256').update(composed).digest('hex'))
      .not.toBe(createHash('sha256').update(decomposed).digest('hex'));
  });
});

describe('V7-0 merge golden catalog', () => {
  const required = ['entries', 'tags', 'entryTags', 'prompts', 'profile', 'media', 'tombstones', 'conflicts'];

  it('contains the required synthetic coverage', () => {
    expect(mergeFixture.synthetic).toBe(true);
    expect(mergeFixture.cases.map(({ id }) => id)).toEqual([
      'entry-disjoint-fields-and-set-membership',
      'concurrent-entry-title-and-body-preserve-recovery',
      'delete-versus-entry-edit',
      'tag-rename-and-concurrent-new-reference-defeats-delete',
      'prompt-concurrent-rename',
      'profile-independent-fields-and-photo-conflict',
      'entry-asset-remove-versus-concurrent-reference',
      'unreadable-base-is-conservative',
    ]);
  });

  it('supplies complete domain collection shapes for every concrete branch', () => {
    for (const fixtureCase of mergeFixture.cases) {
      for (const branchName of ['base', 'local', 'remote', 'expected'] as const) {
        const branch = fixtureCase[branchName];
        if (branch === null) continue;
        for (const key of required) expect(branch).toHaveProperty(key);
      }
    }
  });

  it('contains no credential/account/provider-session fields', () => {
    const serialized = JSON.stringify(mergeFixture);
    for (const forbidden of [
      'accessToken', 'refreshToken', 'accountEmail', 'resumableSession',
      'providerFileId', 'localUri', '@gmail.com',
    ]) expect(serialized).not.toContain(forbidden);
  });

  it('freezes deterministic conflict IDs in every exact expected output', () => {
    for (const fixtureCase of mergeFixture.cases) {
      for (const conflict of fixtureCase.expected.conflicts) {
        const candidates = [conflict.localValueHash, conflict.remoteValueHash]
          .filter((value): value is string => value !== null)
          .filter((value, index, values) => values.indexOf(value) === index)
          .sort();
        const identity = canonicalizeV2([
          conflict.entityType,
          conflict.entityId,
          conflict.field,
          conflict.baseValueHash,
          candidates,
        ]);
        expect(createHash('sha256').update(identity).digest('hex')).toBe(conflict.conflictId);
      }
    }
  });
});
