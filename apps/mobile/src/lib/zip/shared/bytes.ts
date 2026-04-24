/**
 * Copies entry bytes so callers cannot mutate shared archive state by reference.
 */
export function cloneBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

/**
 * Extracts the exact byte window used by a Uint8Array as a standalone ArrayBuffer.
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
