import type { ZipReader } from './reader';

export type ZipEntryLookupSource =
  | { readonly entries: Readonly<Record<string, Uint8Array>> }
  | ZipReader;

/**
 * Reusable ZIP lookup facade for callers that need multiple related path
 * checks without re-scanning archive entries on every basename fallback.
 */
export interface ZipEntryLookup {
  hasPath(path: string): boolean;
  findByBasename(basename: string): string | null;
  findByDirectoryAndBasename(dirName: string, basename: string): string | null;
}

function hasArchivePath(archive: ZipEntryLookupSource, path: string): boolean {
  if ('hasEntry' in archive) {
    return archive.hasEntry(path);
  }

  return Object.prototype.hasOwnProperty.call(archive.entries, path);
}

function listArchivePaths(archive: ZipEntryLookupSource): readonly string[] {
  return 'listEntries' in archive
    ? archive.listEntries().map((entry) => entry.path)
    : Object.keys(archive.entries);
}

function normalizeLookupSegment(value: string): string {
  return value.trim();
}

/**
 * Builds a lazy entry-lookup facade so callers can reuse basename searches
 * without paying repeated full-entry scans.
 */
export function createZipEntryLookup(archive: ZipEntryLookupSource): ZipEntryLookup {
  let archivePaths: readonly string[] | null = null;
  let pathsByBasename: Map<string, string[]> | null = null;

  const getArchivePaths = (): readonly string[] => {
    if (archivePaths) {
      return archivePaths;
    }

    archivePaths = listArchivePaths(archive);
    return archivePaths;
  };

  const getPathsByBasename = (): Map<string, string[]> => {
    if (pathsByBasename) {
      return pathsByBasename;
    }

    const nextPathsByBasename = new Map<string, string[]>();

    for (const path of getArchivePaths()) {
      const basename = path.split('/').pop();
      if (!basename) {
        continue;
      }

      const existingPaths = nextPathsByBasename.get(basename);
      if (existingPaths) {
        existingPaths.push(path);
        continue;
      }

      nextPathsByBasename.set(basename, [path]);
    }

    pathsByBasename = nextPathsByBasename;
    return pathsByBasename;
  };

  return {
    hasPath(path: string): boolean {
      return hasArchivePath(archive, path);
    },
    findByBasename(basename: string): string | null {
      const safeBasename = normalizeLookupSegment(basename);
      if (!safeBasename) {
        return null;
      }

      return getPathsByBasename().get(safeBasename)?.[0] ?? null;
    },
    findByDirectoryAndBasename(dirName: string, basename: string): string | null {
      const safeDirName = normalizeLookupSegment(dirName);
      const safeBasename = normalizeLookupSegment(basename);
      if (!safeDirName || !safeBasename) {
        return null;
      }

      const match = (getPathsByBasename().get(safeBasename) ?? []).find((path) => {
        const segments = path.split('/');
        return segments.includes(safeDirName);
      });

      return match ?? null;
    },
  };
}
