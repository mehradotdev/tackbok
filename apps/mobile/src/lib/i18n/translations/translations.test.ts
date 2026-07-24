import * as fs from 'fs';
import * as path from 'path';
import { languages, translations } from './index';

const SOURCE_LOCALE = 'en';
const SRC_DIR = path.resolve(__dirname, '../../..');
const SKIP_PATTERNS = [/\/i18n\/translations\//, /\/node_modules\//];

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    for (const entry of fs.readdirSync(currentDir)) {
      const fullPath = path.join(currentDir, entry);
      if (SKIP_PATTERNS.some((p) => p.test(fullPath))) continue;

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = path.extname(fullPath);
        if (ext === '.ts' || ext === '.tsx') {
          files.push(fullPath);
        }
      }
    }
  }
  walk(dir);
  return files;
}

/**
 * Extracts dynamic key prefixes from source code that are used in template
 * literal string translations.
 * 
 * Example prefixes detected by the regex /\`([a-zA-Z_][\\w. ]*[_ ])\\$\\{/g:
 * - "Feeling " (from \`Feeling ${status}\`)
 * - "TackbokBackup_" (from \`TackbokBackup_${type}\`)
 * - "prompt_" (from \`prompt_${id}\`)
 */
function extractDynamicPrefixes(sourceContents: string[]): string[] {
  const prefixes: string[] = [];
  const templatePrefixRegex = /`([a-zA-Z_][\w. ]*[_ ])\$\{/g;

  for (const content of sourceContents) {
    let match: RegExpExecArray | null;
    while ((match = templatePrefixRegex.exec(content)) !== null) {
      prefixes.push(match[1]);
    }
  }
  return [...new Set(prefixes)];
}

describe('Translations', () => {
  const sourceKeys = Object.keys(translations[SOURCE_LOCALE]);

  Object.entries(translations).forEach(([locale, messages]) => {
    if (locale === SOURCE_LOCALE) return;

    describe(`Locale '${locale}'`, () => {
      const keys = Object.keys(messages);

      test('should not have any missing keys', () => {
        const missingKeys = sourceKeys.filter((key) => !keys.includes(key));
        // Using toEqual([]) gives a very clear mismatch error showing exactly which keys are missing
        expect(missingKeys).toEqual([]);
      });

      test('should not have any extra keys', () => {
        const extraKeys = keys.filter((key) => !sourceKeys.includes(key));
        expect(extraKeys).toEqual([]);
      });

      test('keys should be in the exact same order as source', () => {
        expect(keys).toEqual(sourceKeys);
      });

      test('should preserve interpolation placeholders', () => {
        for (const key of sourceKeys) {
          const sourcePlaceholders = translations[SOURCE_LOCALE][
            key as keyof (typeof translations)[typeof SOURCE_LOCALE]
          ]
            .match(/\{[a-zA-Z_]\w*\}/g)
            ?.sort();
          const localePlaceholders = messages[key as keyof typeof messages]
            .match(/\{[a-zA-Z_]\w*\}/g)
            ?.sort();

          expect(localePlaceholders).toEqual(sourcePlaceholders);
        }
      });
    });
  });

  test('languages are listed alphabetically by display name', () => {
    const displayNames = languages.map(({ displayName }) => displayName);
    const sortedDisplayNames = [...displayNames].sort((a, b) =>
      a.localeCompare(b, 'en'),
    );

    expect(displayNames).toEqual(sortedDisplayNames);
  });

  describe('Usage', () => {
    test('all English translation keys should be used in the codebase', () => {
      const sourceFiles = collectSourceFiles(SRC_DIR);
      const sourceContents = sourceFiles.map((f) => fs.readFileSync(f, 'utf-8'));
      const dynamicPrefixes = extractDynamicPrefixes(sourceContents);

      const unusedKeys = sourceKeys.filter((key) => {
        if (dynamicPrefixes.some((prefix) => key.startsWith(prefix))) {
          return false;
        }
        const isUsed = sourceContents.some((content) => content.includes(key));
        return !isUsed;
      });

      // toEqual([]) provides clear error output showing which keys went unused
      expect(unusedKeys).toEqual([]);
    });
  });
});
