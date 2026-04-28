/** Map of entry path → decompressed bytes returned by the in-memory reader. */
export type ZipEntries = Record<string, Uint8Array>;

export interface ParsedZipEntryMeta {
  path: string;
  compressionMethod: number;
  generalPurposeFlag: number;
  compressedSize: bigint;
  uncompressedSize: bigint;
  localHeaderOffset: bigint;
}

export interface ParsedZipDirectory {
  entries: ParsedZipEntryMeta[];
  centralDirectoryOffset: bigint;
  centralDirectorySize: bigint;
  entryCount: bigint;
}

export interface ParsedLocalFileHeader {
  path: string;
  generalPurposeFlag: number;
  compressionMethod: number;
  dataOffset: number;
}


