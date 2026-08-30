import fixtures from './fixtures/canonical.json';

import { canonicalHash, canonicalize } from './canonical';

function rejectedValue(kind: string, value?: number): unknown {
  if (kind === 'number') return value;
  if (kind === 'negative-zero') return -0;
  if (kind === 'unsafe-integer') return Number.MAX_SAFE_INTEGER + 1;
  if (kind === 'nan') return Number.NaN;
  if (kind === 'infinity') return Number.POSITIVE_INFINITY;
  if (kind === 'undefined') return undefined;
  if (kind === 'bigint') return BigInt(1);
  if (kind === 'unpaired-high-surrogate') return '\ud800';
  if (kind === 'unpaired-low-surrogate') return '\udc00';
  if (kind === 'cycle') {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    return cycle;
  }
  throw new Error(`Unknown rejection fixture: ${kind}`);
}

describe('snapshot canonicalization', () => {
  it.each(fixtures.vectors)('matches frozen vector $id', (vector) => {
    expect(canonicalize(vector.value)).toBe(vector.canonical);
    expect(canonicalHash(vector.value)).toBe(vector.sha256);
  });

  it.each(fixtures.reject)('rejects frozen invalid vector $id', (vector) => {
    expect(() => canonicalize(rejectedValue(vector.kind, vector.value))).toThrow();
  });
});
