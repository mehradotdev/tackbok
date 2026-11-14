import fixtures from './fixtures/canonical.json';

import { canonicalEqual, canonicalHash, canonicalize } from './canonical';

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

function outcome(compare: () => boolean): unknown {
  try {
    return { result: compare() };
  } catch (error) {
    const { name, message, code } = error as Error & { code?: string };
    return { name, message, code };
  }
}

describe('canonical equality', () => {
  const shared = { b: [1, 'x'], a: null };
  const cycle: unknown[] = [];
  cycle.push(cycle);
  const values: unknown[] = [
    null,
    undefined,
    true,
    false,
    0,
    -0,
    1,
    2 ** 53 - 1,
    2 ** 53,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    BigInt(1),
    '',
    '0',
    '1',
    'null',
    'true',
    'é',
    'é',
    '😀',
    '\ud800',
    '\udc00',
    'a"b\\c\n',
    ' ',
    [],
    {},
    [1],
    ['1'],
    [null],
    { a: 1 },
    { a: 1, b: undefined },
    { b: 2, a: 1 },
    { a: 1, b: 2 },
    shared,
    { a: null, b: [1, 'x'] },
    [shared, shared],
    { a: '\ud800' },
    cycle,
    new Date(0),
  ];

  it('matches comparing canonical forms for every pair, errors included', () => {
    for (const left of values) {
      for (const right of values) {
        expect(outcome(() => canonicalEqual(left, right))).toEqual(
          outcome(() => canonicalize(left) === canonicalize(right)),
        );
      }
    }
  });

  it('matches comparing canonical forms for random JSON-like values', () => {
    let seed = 150;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
    const scalars = [null, true, false, 0, 1, 7, -0, 0.5, '', 'a', 'b', 'é', '\ud800'];
    const value = (depth: number): unknown => {
      const kind = random();
      if (depth > 2 || kind < 0.6) return pick(scalars);
      if (kind < 0.8)
        return Array.from({ length: Math.floor(random() * 3) }, () => value(depth + 1));
      const record: Record<string, unknown> = {};
      for (const key of ['a', 'b', 'c'])
        if (random() < 0.5) record[key] = value(depth + 1);
      return record;
    };
    for (let index = 0; index < 5_000; index++) {
      const left = value(0);
      const right =
        random() < 0.3 ? left : random() < 0.5 ? structuredClone(left) : value(0);
      expect(outcome(() => canonicalEqual(left, right))).toEqual(
        outcome(() => canonicalize(left) === canonicalize(right)),
      );
    }
  });
});

describe('canonicalize with known forms', () => {
  it('produces the same bytes when reusing a nested canonical form', () => {
    const payload = { z: ['é', 2], a: { y: null, x: true } };
    const outer = { b: 1, payload, a: [payload] };
    expect(canonicalize(outer, new Map([[payload, canonicalize(payload)]]))).toBe(
      canonicalize(outer),
    );
  });
});
