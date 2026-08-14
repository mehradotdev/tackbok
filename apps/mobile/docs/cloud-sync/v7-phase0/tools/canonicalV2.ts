export type CanonicalV2 =
  | null
  | boolean
  | number
  | string
  | CanonicalV2[]
  | { [key: string]: CanonicalV2 };

function assertUnicodeScalars(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError('Unpaired high surrogate');
      }
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('Unpaired low surrogate');
    }
  }
}

function encode(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
      throw new TypeError('Canonical JSON v2 accepts non-negative safe integers only');
    }
    return String(value);
  }
  if (typeof value === 'string') {
    assertUnicodeScalars(value);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported canonical JSON type: ${typeof value}`);
  }

  if (ancestors.has(value)) throw new TypeError('Cyclic canonical JSON value');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => encode(item, ancestors)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON objects must be plain objects');
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const members = keys.map((key) => {
      assertUnicodeScalars(key);
      return `${JSON.stringify(key)}:${encode(record[key], ancestors)}`;
    });
    return `{${members.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeV2(value: CanonicalV2): string {
  return encode(value, new Set());
}

export function canonicalBytesV2(value: CanonicalV2): Uint8Array {
  return new TextEncoder().encode(canonicalizeV2(value));
}

