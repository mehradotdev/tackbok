/**
 * Shared internal types for the local TypeScript port of Photopea's UZIP.js codec.
 */
export type ZipEntries = Record<string, Uint8Array>;

/**
 * Internal DEFLATE tuning options used by the ZIP codec.
 */
export interface DeflateOptions {
  level?: number;
}

/**
 * Internal representation of a file prepared for ZIP central directory output.
 */
export interface EncodedZipEntry {
  cpr: boolean;
  usize: number;
  crc: number;
  file: Uint8Array;
}

export interface HuffmanNode {
  lit: number;
  f: number;
  d: number;
  l?: HuffmanNode;
  r?: HuffmanNode;
}

/**
 * Mutable scratch buffers reused by the DEFLATE encoder and decoder.
 */
export interface CodecState {
  nextCode: Uint16Array;
  blCount: Uint16Array;
  order: number[];
  lengthBase: number[];
  lengthExtra: number[];
  lengthDefs: Uint16Array;
  distanceBase: number[];
  distanceExtra: number[];
  distanceDefs: Uint32Array;
  fixedLiteralMap: Uint16Array;
  fixedLiteralTree: number[];
  fixedDistanceMap: Uint16Array;
  fixedDistanceTree: number[];
  literalMap: Uint16Array;
  literalTree: number[];
  tempTree: number[];
  distanceMap: Uint16Array;
  distanceTree: number[];
  codeLengthMap: Uint16Array;
  codeLengthTree: number[];
  rev15: Uint16Array;
  literalHist: Uint32Array;
  distanceHist: Uint32Array;
  codeLengthHist: Uint32Array;
  literals: Uint32Array;
  starts: Uint16Array;
  previous: Uint16Array;
}
