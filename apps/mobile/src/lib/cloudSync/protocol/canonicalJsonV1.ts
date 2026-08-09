/**
 * Canonical JSON encoding for vault protocol v1 — frozen in
 * `docs/cloud-sync/phase0/0001-protocol-v1.md` and verified against the golden
 * fixtures in `../phase0/fixtures/`.
 *
 * Every version file's identity is the SHA-256 of these bytes, so changing this
 * encoder changes every hash in every existing vault. Treat it as immutable:
 * a real change is a new protocol version with a migration, not an edit here.
 *
 * This is production code, not phase-0 scaffolding. It lived under `phase0/`
 * until 2026-08-09 and was moved because "phase 0 is closed" is not a reason to
 * delete the encoder the whole feature depends on.
 */
export type CanonicalJsonPrimitive = boolean | null | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function assertUnicodeScalarString(value: string, path: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(`${path} contains an unpaired high surrogate`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(`${path} contains an unpaired low surrogate`);
    }
  }

  return value.normalize('NFC');
}

function encode(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(assertUnicodeScalarString(value, path));
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new TypeError(`${path} must be a safe integer and must not be -0`);
    }
    return String(value);
  }

  if (typeof value !== 'object' || value === undefined) {
    throw new TypeError(`${path} contains a non-JSON value`);
  }

  if (ancestors.has(value)) {
    throw new TypeError(`${path} contains a cycle`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError(`${path} contains a symbol property`);
      }

      const encodedItems: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) {
          throw new TypeError(`${path} contains an array hole at index ${index}`);
        }
        if (!descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError(`${path}[${index}] must be an enumerable data property`);
        }
        encodedItems.push(encode(descriptor.value, `${path}[${index}]`, ancestors));
      }

      if (Object.keys(value).length !== value.length) {
        throw new TypeError(`${path} contains a non-index array property`);
      }
      return `[${encodedItems.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must be a plain object`);
    }

    const record = value as Record<string, unknown>;
    const ownKeys = Reflect.ownKeys(record);
    if (ownKeys.some((key) => typeof key === 'symbol')) {
      throw new TypeError(`${path} contains a symbol property`);
    }
    const keys = ownKeys as string[];
    for (const key of keys) {
      const normalized = assertUnicodeScalarString(key, `${path} key`);
      if (normalized !== key) {
        throw new TypeError(`${path} contains a non-NFC object key`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new TypeError(`${path}.${key} must be an enumerable data property`);
      }
    }

    keys.sort();
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${encode(
            Object.getOwnPropertyDescriptor(record, key)?.value,
            `${path}.${key}`,
            ancestors,
          )}`,
      )
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Phase-0 reference encoder for canonical-json-v1.
 *
 * Schema-level collection sorting (parents, recoveries, tags, and assets) happens
 * before this function. This encoder preserves array order and sorts object keys
 * by ECMAScript UTF-16 code-unit order, matching RFC 8785's property ordering.
 */
export function canonicalizeJsonV1(value: CanonicalJsonValue): string {
  return encode(value, '$', new Set());
}

export function canonicalJsonV1Bytes(value: CanonicalJsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalizeJsonV1(value));
}
