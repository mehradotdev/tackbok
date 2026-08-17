import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

export interface V1DependencyAudit {
  format: 'tackbok-v7-v1-dependency-audit';
  formatVersion: 1;
  productionRootCount: number;
  reachableSourceCount: number;
  reachableV1FileCount: number;
  reachableV1Files: string[];
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx'] as const;
const LEGACY_DIRECTORIES = [
  'src/lib/cloudSync/ancestry/',
  'src/lib/cloudSync/codec/',
  'src/lib/cloudSync/conflicts/',
  'src/lib/cloudSync/domain/',
  'src/lib/cloudSync/engine/',
  'src/lib/cloudSync/outbox/',
  'src/lib/cloudSync/providers/',
  'src/lib/cloudSync/protocol/',
] as const;
const LEGACY_FILES = new Set([
  'src/lib/cloudSync/storage/engineDomain.ts',
]);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return SOURCE_EXTENSIONS.includes(extname(entry.name) as typeof SOURCE_EXTENSIONS[number])
      ? [path]
      : [];
  });
}

function productionRoots(mobileRoot: string): string[] {
  const appRoot = join(mobileRoot, 'src/app');
  return walk(appRoot).filter((path) => {
    const name = relative(appRoot, path).replaceAll('\\', '/');
    return !name.split('/').some((segment) => segment.startsWith('dev-'));
  });
}

function resolveSourceImport(
  mobileRoot: string,
  importer: string,
  specifier: string,
): string | null {
  let base: string;
  if (specifier.startsWith('~/')) base = join(mobileRoot, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(importer, '..', specifier);
  else return null;

  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate) &&
    SOURCE_EXTENSIONS.includes(extname(candidate) as typeof SOURCE_EXTENSIONS[number])) ?? null;
}

function isV1ProductionFile(relativePath: string): boolean {
  if (relativePath.endsWith('.test.ts') || relativePath.endsWith('.test.tsx')) return false;
  if (LEGACY_FILES.has(relativePath)) return true;
  return LEGACY_DIRECTORIES.some((directory) => relativePath.startsWith(directory));
}

export function auditProductionDependencies(mobileRoot: string): V1DependencyAudit {
  const roots = productionRoots(mobileRoot);
  const pending = [...roots];
  const reachable = new Set<string>();

  while (pending.length > 0) {
    const file = pending.pop()!;
    if (reachable.has(file)) continue;
    reachable.add(file);
    const source = readFileSync(file, 'utf8');
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    for (const imported of imports) {
      const resolved = resolveSourceImport(mobileRoot, file, imported.fileName);
      if (resolved && !reachable.has(resolved)) pending.push(resolved);
    }
  }

  const relativeSources = [...reachable]
    .map((path) => relative(mobileRoot, path).replaceAll('\\', '/'))
    .sort();
  const reachableV1Files = relativeSources.filter(isV1ProductionFile);
  return {
    format: 'tackbok-v7-v1-dependency-audit',
    formatVersion: 1,
    productionRootCount: roots.length,
    reachableSourceCount: relativeSources.length,
    reachableV1FileCount: reachableV1Files.length,
    reachableV1Files,
  };
}

if (import.meta.main) {
  const mobileRoot = resolve(import.meta.dir, '../..');
  const audit = auditProductionDependencies(mobileRoot);
  const expectRetired = process.argv.includes('--expect-retired');
  if (expectRetired && audit.reachableV1FileCount !== 0) {
    console.error(JSON.stringify(audit, null, 2));
    throw new Error('Protocol-v1 production dependencies remain reachable');
  }
  console.log(JSON.stringify(audit, null, 2));
}
