import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as prettier from 'prettier';

const base = process.argv[2];
if (!base || base.startsWith('-')) {
  console.error('Usage: bun run format:changed <base-ref> [head-ref]');
  process.exit(1);
}
const head = process.argv[3] ?? 'HEAD';
if (head.startsWith('-')) throw new Error('Invalid head ref');

// NUL separators preserve spaces, quotes, and newlines in Git filenames.
const files = execFileSync(
  'git',
  ['diff', '--name-only', '-z', '--diff-filter=ACMR', `${base}...${head}`, '--'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);

let checked = 0;
for (const file of files) {
  const config = (await prettier.resolveConfig(file)) ?? {};
  const info = await prettier.getFileInfo(file, {
    ignorePath: '.prettierignore',
    plugins: config.plugins,
  });
  if (info.ignored || !info.inferredParser) continue;
  checked++;
  if (
    !(await prettier.check(await readFile(file, 'utf8'), { ...config, filepath: file }))
  ) {
    console.error(`Formatting differs: ${file}`);
    process.exitCode = 1;
  }
}
console.log(`Checked formatting of ${checked} changed files.`);
