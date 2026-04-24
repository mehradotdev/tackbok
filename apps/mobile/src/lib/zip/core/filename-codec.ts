/**
 * ZIP filename encoding and decoding.
 *
 * ZIP filenames are either pure UTF-8 (when the UTF-8 general-purpose flag is
 * set) or IBM code page 437 (the MS-DOS legacy encoding).  This module also
 * provides the byte-level UTF-8 encode/decode helpers used when writing
 * filename fields into ZIP binary structures — deliberately avoiding the
 * platform TextEncoder/TextDecoder to keep the codec pure and deterministic.
 */

function pad(value: string): string {
  return value.length < 2 ? `0${value}` : value;
}

/**
 * Decodes legacy IBM code page 437 filenames when the UTF-8 flag is not set.
 * Returns null for code points above 0xaf that are not covered by the table.
 */
export function readIBM(
  buffer: Uint8Array,
  offset: number,
  length: number,
): string | null {
  const codes = [
    0xc7, 0xfc, 0xe9, 0xe2, 0xe4, 0xe0, 0xe5, 0xe7, 0xea, 0xeb, 0xe8, 0xef, 0xee, 0xec,
    0xc4, 0xc5, 0xc9, 0xe6, 0xc6, 0xf4, 0xf6, 0xf2, 0xfb, 0xf9, 0xff, 0xd6, 0xdc, 0xa2,
    0xa3, 0xa5, 0xa7, 0x192, 0xe1, 0xed, 0xf3, 0xfa, 0xf1, 0xd1, 0xaa, 0xba, 0xbf, 0x2310,
    0xac, 0xbd, 0xbc, 0xa1, 0xab, 0xbb,
  ];

  let value = '';
  for (let index = 0; index < length; index += 1) {
    let codePoint = buffer[offset + index];
    if (codePoint >= 0x80) {
      if (codePoint >= 0xb0) {
        return null;
      }
      codePoint = codes[codePoint - 0x80];
    }
    value += String.fromCharCode(codePoint);
  }

  return value;
}

export function readUTF8(buffer: Uint8Array, offset: number, length: number): string {
  let encoded = '';
  for (let index = 0; index < length; index += 1) {
    encoded += `%${pad(buffer[offset + index].toString(16))}`;
  }

  try {
    return decodeURIComponent(encoded);
  } catch {
    return readASCIIFallback(buffer, offset, length);
  }
}

function readASCIIFallback(
  buffer: Uint8Array,
  offset: number,
  length: number,
): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(buffer[offset + index]);
  }
  return value;
}

function readCodePoint(value: string, index: number): [number, number] {
  const first = value.charCodeAt(index);

  if (first >= 0xd800 && first <= 0xdbff && index + 1 < value.length) {
    const second = value.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) {
      return [((first - 0xd800) << 10) + (second - 0xdc00) + 0x10000, 2];
    }
  }

  if (first >= 0xdc00 && first <= 0xdfff) {
    return [0xfffd, 1];
  }

  return [first, 1];
}

/**
 * Writes a JS string into a ZIP filename field using byte-level UTF-8 encoding.
 * Returns the number of bytes written.
 */
export function writeUTF8(buffer: Uint8Array, offset: number, value: string): number {
  let written = 0;

  for (let index = 0; index < value.length; ) {
    const [code, width] = readCodePoint(value, index);
    index += width;

    if ((code & (0xffffffff - (1 << 7) + 1)) === 0) {
      buffer[offset + written] = code;
      written += 1;
    } else if ((code & (0xffffffff - (1 << 11) + 1)) === 0) {
      buffer[offset + written] = 192 | (code >> 6);
      buffer[offset + written + 1] = 128 | (code & 63);
      written += 2;
    } else if ((code & (0xffffffff - (1 << 16) + 1)) === 0) {
      buffer[offset + written] = 224 | (code >> 12);
      buffer[offset + written + 1] = 128 | ((code >> 6) & 63);
      buffer[offset + written + 2] = 128 | (code & 63);
      written += 3;
    } else if ((code & (0xffffffff - (1 << 21) + 1)) === 0) {
      buffer[offset + written] = 240 | (code >> 18);
      buffer[offset + written + 1] = 128 | ((code >> 12) & 63);
      buffer[offset + written + 2] = 128 | ((code >> 6) & 63);
      buffer[offset + written + 3] = 128 | (code & 63);
      written += 4;
    } else {
      throw new Error('Unsupported UTF-8 code point');
    }
  }

  return written;
}

/**
 * Returns the number of bytes a string will occupy in a ZIP filename field.
 */
export function sizeUTF8(value: string): number {
  let size = 0;

  for (let index = 0; index < value.length; ) {
    const [code, width] = readCodePoint(value, index);
    index += width;

    if ((code & (0xffffffff - (1 << 7) + 1)) === 0) {
      size += 1;
    } else if ((code & (0xffffffff - (1 << 11) + 1)) === 0) {
      size += 2;
    } else if ((code & (0xffffffff - (1 << 16) + 1)) === 0) {
      size += 3;
    } else if ((code & (0xffffffff - (1 << 21) + 1)) === 0) {
      size += 4;
    } else {
      throw new Error('Unsupported UTF-8 code point');
    }
  }

  return size;
}
