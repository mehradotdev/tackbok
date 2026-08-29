import { invalid } from './caps';
import { sha256Text } from './sha256';

export type CanonicalValue =
  | null | boolean | number | string
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

function encode(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
      invalid('invalid-number', `${path} is not a non-negative safe integer`);
    }
    return String(value);
  }
  if (typeof value === 'string') {
    assertScalarString(value, path);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    invalid('invalid-value', `${path} contains unsupported ${typeof value}`);
  }
  if (ancestors.has(value)) invalid('cycle', `${path} contains a cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item, index) => encode(item, `${path}[${index}]`, ancestors)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid('invalid-object', `${path} must be a plain object`);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    for (const key of keys) assertScalarString(key, `${path} key`);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`, ancestors)}`).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalize(value: unknown): string {
  return encode(value, '$', new Set());
}

export function encodeCanonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

export function canonicalHash(value: unknown): string {
  return sha256Text(canonicalize(value));
}

