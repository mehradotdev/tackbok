import { invalid } from './caps';
import { sha256Text } from './sha256';

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function assertScalarString(value: string, path: string): void {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        invalid('invalid-unicode', `${path} contains an unpaired high surrogate`);
      }
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      invalid('invalid-unicode', `${path} contains an unpaired low surrogate`);
    }
  }
}

function assertCanonicalNumber(value: number, path: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    invalid('invalid-number', `${path} is not a non-negative safe integer`);
  }
}

function encode(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  known: ReadonlyMap<object, string> | undefined,
): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    assertCanonicalNumber(value, path);
    return String(value);
  }
  if (typeof value === 'string') {
    assertScalarString(value, path);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    invalid('invalid-value', `${path} contains unsupported ${typeof value}`);
  }
  const reused = known?.get(value);
  if (reused !== undefined) return reused;
  if (ancestors.has(value)) invalid('cycle', `${path} contains a cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item, index) => encode(item, `${path}[${index}]`, ancestors, known)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid('invalid-object', `${path} must be a plain object`);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    for (const key of keys) assertScalarString(key, `${path} key`);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`, ancestors, known)}`).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * `known` maps objects to their canonical form, computed earlier in the same
 * synchronous call, so a value already encoded is not encoded again. Never keep
 * it across an await or a mutation: a stale entry would change the bytes.
 */
export function canonicalize(
  value: unknown,
  known?: ReadonlyMap<object, string>,
): string {
  return encode(value, '$', new Set(), known);
}

/**
 * Same result as `canonicalize(left) === canonicalize(right)`, including the
 * errors it throws, without encoding two strings or numbers. Objects are
 * always encoded twice: a getter could read differently the second time.
 */
export function canonicalEqual(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' && typeof right === 'string') {
    // JSON string encoding is injective, so valid strings compare as values.
    assertScalarString(left, '$');
    if (left !== right) assertScalarString(right, '$');
    return left === right;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    // Valid numbers exclude NaN and -0, where `===` and the encoding disagree.
    assertCanonicalNumber(left, '$');
    assertCanonicalNumber(right, '$');
    return left === right;
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') return left === right;
  return canonicalize(left) === canonicalize(right);
}

export function encodeCanonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

export function canonicalHash(value: unknown): string {
  return sha256Text(canonicalize(value));
}
