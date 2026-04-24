// ─── Internal types ─────────────────────────────────────────────────────────
// These are implementation details of the DEFLATE codec and are not part of
// the public ZIP API surface.

interface HuffmanNode {
  lit: number;
  f: number;
  d: number;
  l?: HuffmanNode;
  r?: HuffmanNode;
}

interface DeflateOptions {
  level?: number;
}

interface CodecState {
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

/**
 * Shared DEFLATE tables and scratch space reused by ZIP archive reading and writing.
 */
const state: CodecState = {
  nextCode: new Uint16Array(16),
  blCount: new Uint16Array(16),
  order: [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
  lengthBase: [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99,
    115, 131, 163, 195, 227, 258, 999, 999, 999,
  ],
  lengthExtra: [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
    0, 0, 0,
  ],
  lengthDefs: new Uint16Array(32),
  distanceBase: [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025,
    1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 65535, 65535,
  ],
  distanceExtra: [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12,
    12, 13, 13, 0, 0,
  ],
  distanceDefs: new Uint32Array(32),
  fixedLiteralMap: new Uint16Array(512),
  fixedLiteralTree: [],
  fixedDistanceMap: new Uint16Array(32),
  fixedDistanceTree: [],
  literalMap: new Uint16Array(32768),
  literalTree: [],
  tempTree: [],
  distanceMap: new Uint16Array(32768),
  distanceTree: [],
  codeLengthMap: new Uint16Array(512),
  codeLengthTree: [],
  rev15: new Uint16Array(1 << 15),
  literalHist: new Uint32Array(286),
  distanceHist: new Uint32Array(30),
  codeLengthHist: new Uint32Array(19),
  literals: new Uint32Array(15000),
  starts: new Uint16Array(1 << 16),
  previous: new Uint16Array(1 << 15),
};

function makeCodes(tree: number[], maxBits: number): void {
  for (let index = 0; index <= maxBits; index += 1) {
    state.blCount[index] = 0;
  }
  for (let index = 1; index < tree.length; index += 2) {
    state.blCount[tree[index]] += 1;
  }

  let code = 0;
  state.blCount[0] = 0;
  for (let bits = 1; bits <= maxBits; bits += 1) {
    code = (code + state.blCount[bits - 1]) << 1;
    state.nextCode[bits] = code;
  }

  for (let index = 0; index < tree.length; index += 2) {
    const length = tree[index + 1];
    if (length !== 0) {
      tree[index] = state.nextCode[length];
      state.nextCode[length] += 1;
    }
  }
}

function codesToMap(tree: number[], maxBits: number, map: Uint16Array): void {
  for (let index = 0; index < tree.length; index += 2) {
    if (tree[index + 1] === 0) {
      continue;
    }

    const literal = index >> 1;
    const codeLength = tree[index + 1];
    const value = (literal << 4) | codeLength;
    let first = tree[index] << (maxBits - codeLength);
    const last = first + (1 << (maxBits - codeLength));

    while (first !== last) {
      const reversed = state.rev15[first] >>> (15 - maxBits);
      map[reversed] = value;
      first += 1;
    }
  }
}

function reverseCodes(tree: number[], maxBits: number): void {
  const shift = 15 - maxBits;
  for (let index = 0; index < tree.length; index += 2) {
    const value = tree[index] << (maxBits - tree[index + 1]);
    tree[index] = state.rev15[value] >>> shift;
  }
}

function assertBitWriteCapacity(buffer: Uint8Array, position: number, byteCount: number): void {
  const offset = position >>> 3;
  if (offset + byteCount > buffer.length) {
    throw new Error('DEFLATE output buffer is too small');
  }
}

function requiredReadBytes(position: number, length: number): number {
  return (((position & 7) + length + 7) >>> 3);
}

function assertBitReadCapacity(buffer: Uint8Array, position: number, length: number): void {
  const offset = position >>> 3;
  if (offset + requiredReadBytes(position, length) > buffer.length) {
    throw new Error('Invalid DEFLATE data: truncated bitstream');
  }
}

function putBitsExact(buffer: Uint8Array, position: number, value: number): void {
  assertBitWriteCapacity(buffer, position, 2);
  const shifted = value << (position & 7);
  const offset = position >>> 3;
  buffer[offset] |= shifted;
  buffer[offset + 1] |= shifted >>> 8;
}

function putBitsFast(buffer: Uint8Array, position: number, value: number): void {
  assertBitWriteCapacity(buffer, position, 3);
  const shifted = value << (position & 7);
  const offset = position >>> 3;
  buffer[offset] |= shifted;
  buffer[offset + 1] |= shifted >>> 8;
  buffer[offset + 2] |= shifted >>> 16;
}

function readBitsExact(buffer: Uint8Array, position: number, length: number): number {
  assertBitReadCapacity(buffer, position, length);
  return (
    ((buffer[position >>> 3] | (buffer[(position >>> 3) + 1] << 8)) >>> (position & 7)) &
    ((1 << length) - 1)
  );
}

function readBitsFast(buffer: Uint8Array, position: number, length: number): number {
  if ((position >>> 3) + 3 > buffer.length) {
    return readBitsExact(buffer, position, length);
  }

  return (
    ((buffer[position >>> 3] |
      (buffer[(position >>> 3) + 1] << 8) |
      (buffer[(position >>> 3) + 2] << 16)) >>>
      (position & 7)) &
    ((1 << length) - 1)
  );
}

function read17Bits(buffer: Uint8Array, position: number): number {
  const offset = position >>> 3;
  if (offset >= buffer.length) {
    throw new Error('Invalid DEFLATE data: truncated bitstream');
  }

  const first = buffer[offset];
  const second = offset + 1 < buffer.length ? buffer[offset + 1] : 0;
  const third = offset + 2 < buffer.length ? buffer[offset + 2] : 0;
  return (
    (first | (second << 8) | (third << 16)) >>> (position & 7)
  );
}

function initializeState(): void {
  for (let index = 0; index < 1 << 15; index += 1) {
    let value = index;
    value = ((value & 0xaaaaaaaa) >>> 1) | ((value & 0x55555555) << 1);
    value = ((value & 0xcccccccc) >>> 2) | ((value & 0x33333333) << 2);
    value = ((value & 0xf0f0f0f0) >>> 4) | ((value & 0x0f0f0f0f) << 4);
    value = ((value & 0xff00ff00) >>> 8) | ((value & 0x00ff00ff) << 8);
    state.rev15[index] = ((value >>> 16) | (value << 16)) >>> 17;
  }

  const pushValues = (target: number[], count: number, value: number): void => {
    for (let index = 0; index < count; index += 1) {
      target.push(0, value);
    }
  };

  for (let index = 0; index < 32; index += 1) {
    state.lengthDefs[index] = (state.lengthBase[index] << 3) | state.lengthExtra[index];
    state.distanceDefs[index] =
      (state.distanceBase[index] << 4) | state.distanceExtra[index];
  }

  pushValues(state.fixedLiteralTree, 144, 8);
  pushValues(state.fixedLiteralTree, 255 - 143, 9);
  pushValues(state.fixedLiteralTree, 279 - 255, 7);
  pushValues(state.fixedLiteralTree, 287 - 279, 8);
  makeCodes(state.fixedLiteralTree, 9);
  codesToMap(state.fixedLiteralTree, 9, state.fixedLiteralMap);
  reverseCodes(state.fixedLiteralTree, 9);

  pushValues(state.fixedDistanceTree, 32, 5);
  makeCodes(state.fixedDistanceTree, 5);
  codesToMap(state.fixedDistanceTree, 5, state.fixedDistanceMap);
  reverseCodes(state.fixedDistanceTree, 5);

  pushValues(state.codeLengthTree, 19, 0);
  pushValues(state.literalTree, 286, 0);
  pushValues(state.distanceTree, 30, 0);
  pushValues(state.tempTree, 320, 0);
}

/**
 * Compresses raw bytes using the DEFLATE format used inside ZIP entries.
 */
export function deflateRaw(
  data: Uint8Array,
  options: DeflateOptions = { level: 6 },
): Uint8Array {
  const buffer = new Uint8Array(50 + Math.floor(data.length * 1.1));
  const offset = deflateRawBlock(data, buffer, 0, options.level ?? 6);
  return new Uint8Array(buffer.buffer, 0, offset);
}

function deflateRawBlock(
  data: Uint8Array,
  out: Uint8Array,
  offset: number,
  level: number,
): number {
  const options = [
    [0, 0, 0, 0, 0],
    [4, 4, 8, 4, 0],
    [4, 5, 16, 8, 0],
    [4, 6, 16, 16, 0],
    [4, 10, 16, 32, 0],
    [8, 16, 32, 32, 0],
    [8, 16, 128, 128, 0],
    [8, 32, 128, 256, 0],
    [32, 128, 258, 1024, 1],
    [32, 258, 258, 4096, 1],
  ];

  const option = options[level] ?? options[6];
  let index = 0;
  let bitPosition = offset << 3;
  let covered = 0;

  if (level === 0) {
    while (index < data.length) {
      const length = Math.min(0xffff, data.length - index);
      putBitsExact(out, bitPosition, index + length === data.length ? 1 : 0);
      bitPosition = writeStoredBlock(data, index, length, out, bitPosition + 8);
      index += length;
    }
    return bitPosition >>> 3;
  }

  const literals = state.literals;
  const starts = state.starts;
  const previous = state.previous;

  let literalIndex = 0;
  let literalCount = 0;
  let blockStart = 0;
  let extraBits = 0;
  let currentHash = 0;
  let nextHash = 0;

  if (data.length > 2) {
    nextHash = hashTriplet(data, 0);
    starts[nextHash] = 0;
  }

  for (index = 0; index < data.length; index += 1) {
    currentHash = nextHash;

    if (index + 1 < data.length - 2) {
      nextHash = hashTriplet(data, index + 1);
      const wrappedIndex = (index + 1) & 0x7fff;
      previous[wrappedIndex] = starts[nextHash];
      starts[nextHash] = wrappedIndex;
    }

    if (covered <= index) {
      if ((literalIndex > 14000 || literalCount > 26697) && data.length - index > 100) {
        if (covered < index) {
          literals[literalIndex] = index - covered;
          literalIndex += 2;
          covered = index;
        }

        bitPosition = writeDeflateBlock(
          index === data.length - 1 || covered === data.length ? 1 : 0,
          literals,
          literalIndex,
          extraBits,
          data,
          blockStart,
          index - blockStart,
          out,
          bitPosition,
        );
        literalIndex = 0;
        literalCount = 0;
        extraBits = 0;
        blockStart = index;
      }

      let match = 0;
      if (index < data.length - 2) {
        match = findBestMatch(
          data,
          index,
          previous,
          currentHash,
          Math.min(option[2], data.length - index),
          option[3],
        );
      }

      if (match !== 0) {
        const length = match >>> 16;
        const distance = match & 0xffff;
        const lengthIndex = findCodeIndex(length, state.lengthBase);
        const distanceIndex = findCodeIndex(distance, state.distanceBase);

        state.literalHist[257 + lengthIndex] += 1;
        state.distanceHist[distanceIndex] += 1;
        extraBits += state.lengthExtra[lengthIndex] + state.distanceExtra[distanceIndex];

        literals[literalIndex] = (length << 23) | (index - covered);
        literals[literalIndex + 1] =
          (distance << 16) | (lengthIndex << 8) | distanceIndex;
        literalIndex += 2;
        covered = index + length;
      } else {
        state.literalHist[data[index]] += 1;
      }

      literalCount += 1;
    }
  }

  if (blockStart !== index || data.length === 0) {
    if (covered < index) {
      literals[literalIndex] = index - covered;
      literalIndex += 2;
    }

    bitPosition = writeDeflateBlock(
      1,
      literals,
      literalIndex,
      extraBits,
      data,
      blockStart,
      index - blockStart,
      out,
      bitPosition,
    );
  }

  while ((bitPosition & 7) !== 0) {
    bitPosition += 1;
  }

  return bitPosition >>> 3;
}

function findBestMatch(
  data: Uint8Array,
  index: number,
  previous: Uint16Array,
  hash: number,
  nice: number,
  chain: number,
): number {
  let cursor = index & 0x7fff;
  let previousCursor = previous[cursor];
  let distance = (cursor - previousCursor + (1 << 15)) & 0x7fff;

  if (previousCursor === cursor || hash !== hashTriplet(data, index - distance)) {
    return 0;
  }

  let bestLength = 0;
  let bestDistance = 0;
  const distanceLimit = Math.min(0x7fff, index);

  while (distance <= distanceLimit && --chain !== 0 && previousCursor !== cursor) {
    if (
      bestLength === 0 ||
      data[index + bestLength] === data[index + bestLength - distance]
    ) {
      let currentLength = countMatchLength(data, index, distance);
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestDistance = distance;

        if (bestLength >= nice) {
          break;
        }

        if (distance + 2 < currentLength) {
          currentLength = distance + 2;
        }

        let furthestDistance = 0;
        for (let offset = 0; offset < currentLength - 2; offset += 1) {
          const entryIndex = (index - distance + offset + (1 << 15)) & 0x7fff;
          const linked = previous[entryIndex];
          const linkedDistance = (entryIndex - linked + (1 << 15)) & 0x7fff;
          if (linkedDistance > furthestDistance) {
            furthestDistance = linkedDistance;
            previousCursor = entryIndex;
          }
        }
      }
    }

    cursor = previousCursor;
    previousCursor = previous[cursor];
    distance += (cursor - previousCursor + (1 << 15)) & 0x7fff;
  }

  return (bestLength << 16) | bestDistance;
}

function countMatchLength(data: Uint8Array, index: number, distance: number): number {
  if (
    data[index] !== data[index - distance] ||
    data[index + 1] !== data[index + 1 - distance] ||
    data[index + 2] !== data[index + 2 - distance]
  ) {
    return 0;
  }

  const start = index;
  const end = Math.min(data.length, index + 258);
  index += 3;
  while (index < end && data[index] === data[index - distance]) {
    index += 1;
  }

  return index - start;
}

function hashTriplet(data: Uint8Array, index: number): number {
  return (((data[index] << 8) | data[index + 1]) + (data[index + 2] << 4)) & 0xffff;
}

function writeDeflateBlock(
  isFinal: number,
  literals: Uint32Array,
  literalIndex: number,
  extraBits: number,
  data: Uint8Array,
  start: number,
  length: number,
  out: Uint8Array,
  position: number,
): number {
  state.literalHist[256] += 1;
  const [
    maxLiteralBits,
    maxDistanceBits,
    maxCodeLengthBits,
    literalCodeCount,
    distanceCodeCount,
    codeLengthCodeCount,
    encodedLiteralTree,
    encodedDistanceTree,
  ] = buildDynamicTrees();

  const storedSize =
    (((position + 3) & 7) === 0 ? 0 : 8 - ((position + 3) & 7)) + 32 + (length << 3);
  const fixedSize =
    extraBits +
    measureTreeBitSize(state.fixedLiteralTree, state.literalHist) +
    measureTreeBitSize(state.fixedDistanceTree, state.distanceHist);
  let dynamicSize =
    extraBits +
    measureTreeBitSize(state.literalTree, state.literalHist) +
    measureTreeBitSize(state.distanceTree, state.distanceHist);
  dynamicSize +=
    14 +
    3 * codeLengthCodeCount +
    measureTreeBitSize(state.codeLengthTree, state.codeLengthHist) +
    (state.codeLengthHist[16] * 2 +
      state.codeLengthHist[17] * 3 +
      state.codeLengthHist[18] * 7);

  state.literalHist.fill(0);
  state.distanceHist.fill(0);
  state.codeLengthHist.fill(0);

  const blockType =
    storedSize < fixedSize && storedSize < dynamicSize
      ? 0
      : fixedSize < dynamicSize
        ? 1
        : 2;
  putBitsFast(out, position, isFinal);
  putBitsFast(out, position + 1, blockType);
  position += 3;

  if (blockType === 0) {
    while ((position & 7) !== 0) {
      position += 1;
    }
    return writeStoredBlock(data, start, length, out, position);
  }

  let literalTree = state.fixedLiteralTree;
  let distanceTree = state.fixedDistanceTree;

  if (blockType === 2) {
    makeCodes(state.literalTree, maxLiteralBits);
    reverseCodes(state.literalTree, maxLiteralBits);
    makeCodes(state.distanceTree, maxDistanceBits);
    reverseCodes(state.distanceTree, maxDistanceBits);
    makeCodes(state.codeLengthTree, maxCodeLengthBits);
    reverseCodes(state.codeLengthTree, maxCodeLengthBits);

    literalTree = state.literalTree;
    distanceTree = state.distanceTree;

    putBitsExact(out, position, literalCodeCount - 257);
    position += 5;
    putBitsExact(out, position, distanceCodeCount - 1);
    position += 5;
    putBitsExact(out, position, codeLengthCodeCount - 4);
    position += 4;

    for (let index = 0; index < codeLengthCodeCount; index += 1) {
      putBitsExact(
        out,
        position + index * 3,
        state.codeLengthTree[(state.order[index] << 1) + 1],
      );
    }
    position += 3 * codeLengthCodeCount;
    position = writeEncodedTreeRuns(
      encodedLiteralTree,
      state.codeLengthTree,
      out,
      position,
    );
    position = writeEncodedTreeRuns(
      encodedDistanceTree,
      state.codeLengthTree,
      out,
      position,
    );
  }

  let offset = start;
  for (let index = 0; index < literalIndex; index += 2) {
    const literalInfo = literals[index];
    const matchLengthValue = literalInfo >>> 23;
    const end = offset + (literalInfo & ((1 << 23) - 1));

    while (offset < end) {
      position = writeHuffmanSymbol(data[offset], literalTree, out, position);
      offset += 1;
    }

    if (matchLengthValue !== 0) {
      const matchInfo = literals[index + 1];
      const distance = matchInfo >> 16;
      const lengthIndex = (matchInfo >> 8) & 255;
      const distanceIndex = matchInfo & 255;

      position = writeHuffmanSymbol(257 + lengthIndex, literalTree, out, position);
      putBitsExact(out, position, matchLengthValue - state.lengthBase[lengthIndex]);
      position += state.lengthExtra[lengthIndex];

      position = writeHuffmanSymbol(distanceIndex, distanceTree, out, position);
      putBitsFast(out, position, distance - state.distanceBase[distanceIndex]);
      position += state.distanceExtra[distanceIndex];
      offset += matchLengthValue;
    }
  }

  return writeHuffmanSymbol(256, literalTree, out, position);
}

function writeStoredBlock(
  data: Uint8Array,
  offset: number,
  length: number,
  out: Uint8Array,
  position: number,
): number {
  const byteOffset = position >>> 3;
  out[byteOffset] = length;
  out[byteOffset + 1] = length >>> 8;
  out[byteOffset + 2] = 255 - out[byteOffset];
  out[byteOffset + 3] = 255 - out[byteOffset + 1];
  out.set(new Uint8Array(data.buffer, data.byteOffset + offset, length), byteOffset + 4);
  return position + ((length + 4) << 3);
}

function buildDynamicTrees(): [
  number,
  number,
  number,
  number,
  number,
  number,
  number[],
  number[],
] {
  const maxLiteralBits = buildHuffmanTree(state.literalHist, state.literalTree, 15);
  const maxDistanceBits = buildHuffmanTree(state.distanceHist, state.distanceTree, 15);
  const encodedLiteralTree: number[] = [];
  const literalCodeCount = encodeTreeCodeLengths(state.literalTree, encodedLiteralTree);
  const encodedDistanceTree: number[] = [];
  const distanceCodeCount = encodeTreeCodeLengths(
    state.distanceTree,
    encodedDistanceTree,
  );

  state.codeLengthHist.fill(0);
  for (let index = 0; index < encodedLiteralTree.length; index += 2) {
    state.codeLengthHist[encodedLiteralTree[index]] += 1;
  }
  for (let index = 0; index < encodedDistanceTree.length; index += 2) {
    state.codeLengthHist[encodedDistanceTree[index]] += 1;
  }

  const maxCodeLengthBits = buildHuffmanTree(
    state.codeLengthHist,
    state.codeLengthTree,
    7,
  );
  let codeLengthCodeCount = 19;
  while (
    codeLengthCodeCount > 4 &&
    state.codeLengthTree[(state.order[codeLengthCodeCount - 1] << 1) + 1] === 0
  ) {
    codeLengthCodeCount -= 1;
  }

  return [
    maxLiteralBits,
    maxDistanceBits,
    maxCodeLengthBits,
    literalCodeCount,
    distanceCodeCount,
    codeLengthCodeCount,
    encodedLiteralTree,
    encodedDistanceTree,
  ];
}

function measureTreeBitSize(tree: number[], histogram: Uint32Array): number {
  let size = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    size += histogram[index] * tree[(index << 1) + 1];
  }
  return size;
}

function writeEncodedTreeRuns(
  runList: number[],
  codeLengthTree: number[],
  out: Uint8Array,
  position: number,
): number {
  for (let index = 0; index < runList.length; index += 2) {
    const symbol = runList[index];
    const extraValue = runList[index + 1];
    position = writeHuffmanSymbol(symbol, codeLengthTree, out, position);

    if (symbol > 15) {
      const bitLength = symbol === 16 ? 2 : symbol === 17 ? 3 : 7;
      putBitsExact(out, position, extraValue);
      position += bitLength;
    }
  }

  return position;
}

function encodeTreeCodeLengths(tree: number[], runList: number[]): number {
  let treeLength = tree.length;
  while (treeLength !== 2 && tree[treeLength - 1] === 0) {
    treeLength -= 2;
  }

  for (let index = 0; index < treeLength; index += 2) {
    const current = tree[index + 1];
    const next = index + 3 < treeLength ? tree[index + 3] : -1;
    const nextNext = index + 5 < treeLength ? tree[index + 5] : -1;
    const previous = index === 0 ? -1 : tree[index - 1];

    if (current === 0 && next === current && nextNext === current) {
      let scan = index + 5;
      while (scan + 2 < treeLength && tree[scan + 2] === current) {
        scan += 2;
      }

      const zeroCount = Math.min((scan + 1 - index) >>> 1, 138);
      if (zeroCount < 11) {
        runList.push(17, zeroCount - 3);
      } else {
        runList.push(18, zeroCount - 11);
      }
      index += zeroCount * 2 - 2;
    } else if (current === previous && next === current && nextNext === current) {
      let scan = index + 5;
      while (scan + 2 < treeLength && tree[scan + 2] === current) {
        scan += 2;
      }

      const repeatedCount = Math.min((scan + 1 - index) >>> 1, 6);
      runList.push(16, repeatedCount - 3);
      index += repeatedCount * 2 - 2;
    } else {
      runList.push(current, 0);
    }
  }

  return treeLength >>> 1;
}

function buildHuffmanTree(
  histogram: Uint32Array,
  tree: number[],
  maxDepth: number,
): number {
  const nodes: HuffmanNode[] = [];

  for (let index = 0; index < tree.length; index += 2) {
    tree[index] = 0;
    tree[index + 1] = 0;
  }

  for (let index = 0; index < histogram.length; index += 1) {
    if (histogram[index] !== 0) {
      nodes.push({ lit: index, f: histogram[index], d: 0 });
    }
  }

  const leafNodes = nodes.slice();
  if (nodes.length === 0) {
    return 0;
  }
  if (nodes.length === 1) {
    const literal = nodes[0].lit;
    const fallback = literal === 0 ? 1 : 0;
    tree[(literal << 1) + 1] = 1;
    tree[(fallback << 1) + 1] = 1;
    return 1;
  }

  nodes.sort((left, right) => left.f - right.f);

  let firstIndex = 0;
  let mergeIndex = 1;
  let nextIndex = 2;
  const firstNode = nodes[0];
  const secondNode = nodes[1];
  nodes[0] = {
    lit: -1,
    f: firstNode.f + secondNode.f,
    l: firstNode,
    r: secondNode,
    d: 0,
  };

  while (mergeIndex !== nodes.length - 1) {
    const leftNode =
      firstIndex !== mergeIndex &&
      (nextIndex === nodes.length || nodes[firstIndex].f < nodes[nextIndex].f)
        ? nodes[firstIndex++]
        : nodes[nextIndex++];
    const rightNode =
      firstIndex !== mergeIndex &&
      (nextIndex === nodes.length || nodes[firstIndex].f < nodes[nextIndex].f)
        ? nodes[firstIndex++]
        : nodes[nextIndex++];

    nodes[mergeIndex++] = {
      lit: -1,
      f: leftNode.f + rightNode.f,
      l: leftNode,
      r: rightNode,
      d: 0,
    };
  }

  let currentMaxDepth = assignNodeDepths(nodes[mergeIndex - 1], 0);
  if (currentMaxDepth > maxDepth) {
    rebalanceTreeDepths(leafNodes, maxDepth, currentMaxDepth);
    currentMaxDepth = maxDepth;
  }

  for (let index = 0; index < leafNodes.length; index += 1) {
    tree[(leafNodes[index].lit << 1) + 1] = leafNodes[index].d;
  }

  return currentMaxDepth;
}

function assignNodeDepths(node: HuffmanNode, depth: number): number {
  if (node.lit !== -1) {
    node.d = depth;
    return depth;
  }

  return Math.max(
    assignNodeDepths(node.l!, depth + 1),
    assignNodeDepths(node.r!, depth + 1),
  );
}

function rebalanceTreeDepths(
  nodes: HuffmanNode[],
  maxDepth: number,
  currentMaxDepth: number,
): void {
  let index = 0;
  const overflowCost = 1 << (currentMaxDepth - maxDepth);
  let debt = 0;

  nodes.sort((left, right) => (right.d === left.d ? left.f - right.f : right.d - left.d));

  for (index = 0; index < nodes.length; index += 1) {
    if (nodes[index].d <= maxDepth) {
      break;
    }

    const oldDepth = nodes[index].d;
    nodes[index].d = maxDepth;
    debt += overflowCost - (1 << (currentMaxDepth - oldDepth));
  }

  debt >>>= currentMaxDepth - maxDepth;
  while (debt > 0) {
    const oldDepth = nodes[index].d;
    if (oldDepth < maxDepth) {
      nodes[index].d += 1;
      debt -= 1 << (maxDepth - oldDepth - 1);
    } else {
      index += 1;
    }
  }

  for (; index >= 0; index -= 1) {
    if (nodes[index].d === maxDepth && debt < 0) {
      nodes[index].d -= 1;
      debt += 1;
    }
  }
}

function findCodeIndex(value: number, array: number[]): number {
  let index = 0;
  if (array[index | 16] <= value) index |= 16;
  if (array[index | 8] <= value) index |= 8;
  if (array[index | 4] <= value) index |= 4;
  if (array[index | 2] <= value) index |= 2;
  if (array[index | 1] <= value) index |= 1;
  return index;
}

function writeHuffmanSymbol(
  literal: number,
  tree: number[],
  out: Uint8Array,
  position: number,
): number {
  putBitsFast(out, position, tree[literal << 1]);
  return position + tree[(literal << 1) + 1];
}

/**
 * Inflates raw DEFLATE bytes into the provided destination buffer.
 */
export function inflateRaw(data: Uint8Array, buffer?: Uint8Array): Uint8Array {
  if (data[0] === 3 && data[1] === 0) {
    return buffer ?? new Uint8Array(0);
  }

  let output = buffer;
  let shouldGrowBuffer = output == null;
  if (shouldGrowBuffer) {
    output = new Uint8Array((data.length >>> 2) << 3);
  }

  let finalBlock = 0;
  let position = 0;
  let offset = 0;
  let literalMap = state.fixedLiteralMap;
  let distanceMap = state.fixedDistanceMap;
  let literalMask = (1 << 9) - 1;
  let distanceMask = (1 << 5) - 1;

  while (finalBlock === 0) {
    finalBlock = readBitsFast(data, position, 1);
    const blockType = readBitsFast(data, position + 1, 2);
    position += 3;

    if (blockType === 0) {
      if ((position & 7) !== 0) {
        position += 8 - (position & 7);
      }

      const byteOffset = (position >>> 3) + 4;
      const length = data[byteOffset - 4] | (data[byteOffset - 3] << 8);
      if (shouldGrowBuffer) {
        output = ensureInflateBuffer(output!, offset + length);
      }
      output!.set(
        new Uint8Array(data.buffer, data.byteOffset + byteOffset, length),
        offset,
      );
      position = (byteOffset + length) << 3;
      offset += length;
      continue;
    }

    if (shouldGrowBuffer) {
      output = ensureInflateBuffer(output!, offset + (1 << 17));
    }

    if (blockType === 1) {
      literalMap = state.fixedLiteralMap;
      distanceMap = state.fixedDistanceMap;
      literalMask = (1 << 9) - 1;
      distanceMask = (1 << 5) - 1;
    } else if (blockType === 2) {
      const literalCount = readBitsExact(data, position, 5) + 257;
      const distanceCount = readBitsExact(data, position + 5, 5) + 1;
      const codeCount = readBitsExact(data, position + 10, 4) + 4;
      position += 14;

      for (let index = 0; index < 38; index += 2) {
        state.codeLengthTree[index] = 0;
        state.codeLengthTree[index + 1] = 0;
      }

      let maxCodeLength = 1;
      for (let index = 0; index < codeCount; index += 1) {
        const length = readBitsExact(data, position + index * 3, 3);
        state.codeLengthTree[(state.order[index] << 1) + 1] = length;
        if (length > maxCodeLength) {
          maxCodeLength = length;
        }
      }
      position += 3 * codeCount;

      makeCodes(state.codeLengthTree, maxCodeLength);
      codesToMap(state.codeLengthTree, maxCodeLength, state.codeLengthMap);

      literalMap = state.literalMap;
      distanceMap = state.distanceMap;

      position = decodeCodeLengthStream(
        state.codeLengthMap,
        (1 << maxCodeLength) - 1,
        literalCount + distanceCount,
        data,
        position,
        state.tempTree,
      );
      const maxLiteralLength = copyCodeLengthsToTree(
        state.tempTree,
        0,
        literalCount,
        state.literalTree,
      );
      const maxDistanceLength = copyCodeLengthsToTree(
        state.tempTree,
        literalCount,
        distanceCount,
        state.distanceTree,
      );
      literalMask = (1 << maxLiteralLength) - 1;
      distanceMask = (1 << maxDistanceLength) - 1;

      makeCodes(state.literalTree, maxLiteralLength);
      codesToMap(state.literalTree, maxLiteralLength, literalMap);
      makeCodes(state.distanceTree, maxDistanceLength);
      codesToMap(state.distanceTree, maxDistanceLength, distanceMap);
    } else {
      throw new Error(`Unsupported DEFLATE block type: ${blockType}`);
    }

    while (true) {
      const code = literalMap[read17Bits(data, position) & literalMask];
      position += code & 15;
      const literal = code >>> 4;

      if (literal >>> 8 === 0) {
        output![offset] = literal;
        offset += 1;
        continue;
      }

      if (literal === 256) {
        break;
      }

      let end = offset + literal - 254;
      if (literal > 264) {
        const extra = state.lengthDefs[literal - 257];
        end = offset + (extra >>> 3) + readBitsExact(data, position, extra & 7);
        position += extra & 7;
      }

      const distanceCode = distanceMap[read17Bits(data, position) & distanceMask];
      position += distanceCode & 15;
      const distanceLiteral = distanceCode >>> 4;
      const distanceExtra = state.distanceDefs[distanceLiteral];
      const distance =
        (distanceExtra >>> 4) + readBitsFast(data, position, distanceExtra & 15);
      position += distanceExtra & 15;

      if (shouldGrowBuffer) {
        output = ensureInflateBuffer(output!, offset + (1 << 17));
      }

      // Copy full 4-byte batches first, then finish any 1-3 byte remainder
      // without writing past the logical match end.
      while (offset + 3 < end) {
        output![offset] = output![offset - distance];
        offset += 1;
        output![offset] = output![offset - distance];
        offset += 1;
        output![offset] = output![offset - distance];
        offset += 1;
        output![offset] = output![offset - distance];
        offset += 1;
      }
      while (offset < end) {
        output![offset] = output![offset - distance];
        offset += 1;
      }
    }
  }

  return output!.length === offset ? output! : output!.slice(0, offset);
}

function ensureInflateBuffer(buffer: Uint8Array, length: number): Uint8Array {
  if (length <= buffer.length) {
    return buffer;
  }

  const next = new Uint8Array(Math.max(buffer.length << 1, length));
  next.set(buffer, 0);
  return next;
}

function decodeCodeLengthStream(
  literalMap: Uint16Array,
  mask: number,
  length: number,
  data: Uint8Array,
  position: number,
  tree: number[],
): number {
  let index = 0;
  while (index < length) {
    const code = literalMap[read17Bits(data, position) & mask];
    position += code & 15;
    const literal = code >>> 4;

    if (literal <= 15) {
      tree[index] = literal;
      index += 1;
      continue;
    }

    let value = 0;
    let count = 0;
    if (literal === 16) {
      count = 3 + readBitsExact(data, position, 2);
      position += 2;
      value = tree[index - 1];
    } else if (literal === 17) {
      count = 3 + readBitsExact(data, position, 3);
      position += 3;
    } else {
      count = 11 + readBitsExact(data, position, 7);
      position += 7;
    }

    const end = index + count;
    while (index < end) {
      tree[index] = value;
      index += 1;
    }
  }

  return position;
}

function copyCodeLengthsToTree(
  source: number[],
  offset: number,
  length: number,
  tree: number[],
): number {
  let max = 0;
  const total = tree.length >>> 1;

  for (let index = 0; index < length; index += 1) {
    const value = source[index + offset];
    tree[index << 1] = 0;
    tree[(index << 1) + 1] = value;
    if (value > max) {
      max = value;
    }
  }

  for (let index = length; index < total; index += 1) {
    tree[index << 1] = 0;
    tree[(index << 1) + 1] = 0;
  }

  return max;
}

initializeState();
