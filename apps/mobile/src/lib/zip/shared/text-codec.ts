const textEncoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder();
const textDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder();

export function ensureTextEncoder(): TextEncoder {
  if (!textEncoder) {
    throw new Error('TextEncoder is not available in this runtime');
  }

  return textEncoder;
}

export function ensureTextDecoder(): TextDecoder {
  if (!textDecoder) {
    throw new Error('TextDecoder is not available in this runtime');
  }

  return textDecoder;
}
