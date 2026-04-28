/**
 * ZIP filename encoding and decoding.
 *
 * ZIP filenames are either pure UTF-8 (when the UTF-8 general-purpose flag is
 * set) or IBM code page 437 (the MS-DOS legacy encoding).  This module also
 * provides the byte-level UTF-8 encode/decode helpers used when writing
 * filename fields into ZIP binary structures — deliberately avoiding the
 * platform TextEncoder/TextDecoder to keep the codec pure and deterministic.
 */

// CP437 bytes 0x80-0xFF mapped to Unicode code points for legacy ZIP names.
const IBM437_CODES = [
  0xc7, 0xfc, 0xe9, 0xe2, 0xe4, 0xe0, 0xe5, 0xe7, 0xea, 0xeb, 0xe8, 0xef, 0xee, 0xec,
  0xc4, 0xc5, 0xc9, 0xe6, 0xc6, 0xf4, 0xf6, 0xf2, 0xfb, 0xf9, 0xff, 0xd6, 0xdc, 0xa2,
  0xa3, 0xa5, 0x20a7, 0x192, 0xe1, 0xed, 0xf3, 0xfa, 0xf1, 0xd1, 0xaa, 0xba, 0xbf, 0x2310,
  0xac, 0xbd, 0xbc, 0xa1, 0xab, 0xbb, 0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561,
  0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510, 0x2514,
  0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f, 0x255a, 0x2554, 0x2569, 0x2566,
  0x2560, 0x2550, 0x256c, 0x2567, 0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553,
  0x256b, 0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580, 0x3b1, 0xdf,
  0x393, 0x3c0, 0x3a3, 0x3c3, 0xb5, 0x3c4, 0x3a6, 0x398, 0x3a9, 0x3b4, 0x221e, 0x3c6,
  0x3b5, 0x2229, 0x2261, 0xb1, 0x2265, 0x2264, 0x2320, 0x2321, 0xf7, 0x2248, 0xb0, 0x2219,
  0xb7, 0x221a, 0x207f, 0xb2, 0x25a0, 0xa0,
];

function pad(value: string): string {
  return value.length < 2 ? `0${value}` : value;
}

/**
 * Decodes legacy IBM code page 437 filenames when the UTF-8 flag is not set.
 */
export function readIBM(
  buffer: Uint8Array,
  offset: number,
  length: number,
): string | null {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    let codePoint = buffer[offset + index];
    if (codePoint >= 0x80) {
      codePoint = IBM437_CODES[codePoint - 0x80];
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
      // Merge a surrogate pair into a single Unicode code point.
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

    // UTF-8 uses 1 to 4 bytes depending on the code point range.
    if (code < 0x80) {
      buffer[offset + written] = code;
      written += 1;
    } else if (code < 0x800) {
      buffer[offset + written] = 192 | (code >> 6);
      buffer[offset + written + 1] = 128 | (code & 63);
      written += 2;
    } else if (code < 0x10000) {
      buffer[offset + written] = 224 | (code >> 12);
      buffer[offset + written + 1] = 128 | ((code >> 6) & 63);
      buffer[offset + written + 2] = 128 | (code & 63);
      written += 3;
    } else if (code < 0x200000) {
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

    // Mirror writeUTF8 so size calculation stays consistent with encoding.
    if (code < 0x80) {
      size += 1;
    } else if (code < 0x800) {
      size += 2;
    } else if (code < 0x10000) {
      size += 3;
    } else if (code < 0x200000) {
      size += 4;
    } else {
      throw new Error('Unsupported UTF-8 code point');
    }
  }

  return size;
}
