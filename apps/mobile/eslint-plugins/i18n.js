/**
 * Custom ESLint plugin for i18n translation key validation.
 *
 * Rule: i18n/no-missing-translation-key
 * Warns when t('...') is called with a string literal that is not defined in en.ts.
 * Dynamic keys (variables, member expressions, template literals) are silently skipped.
 */
'use strict';

/* global __dirname */

const fs = require('fs');
const path = require('path');

/**
 * Parse en.ts and extract all translation keys.
 * Works by matching object property keys in the `export const en = { ... }` block.
 * Handles both identifier keys (e.g. `Cancel: '...'`) and string keys (e.g. `'Export as .ZIP': '...'`).
 */
function parseTranslationKeys(enFilePath) {
  const content = fs.readFileSync(enFilePath, 'utf-8');
  const enObjectBody = extractEnObjectBody(content);

  const keys = new Set();

  // Match unquoted identifier keys:  KeyName: '...'  or  KeyName: "..."
  const identifierKeyRegex = /^\s*([a-zA-Z_]\w*)\s*:/gm;
  let match;
  while ((match = identifierKeyRegex.exec(enObjectBody)) !== null) {
    keys.add(match[1]);
  }

  // Match single-quoted string keys:  'Some Key': '...'
  const singleQuoteKeyRegex = /^\s*'((?:\\.|[^'])*)'\s*:/gm;
  while ((match = singleQuoteKeyRegex.exec(enObjectBody)) !== null) {
    keys.add(match[1]);
  }

  // Match double-quoted string keys:  "Some Key": "..."
  const doubleQuoteKeyRegex = /^\s*"((?:\\.|[^"])*)"\s*:/gm;
  while ((match = doubleQuoteKeyRegex.exec(enObjectBody)) !== null) {
    keys.add(match[1]);
  }

  return keys;
}

function extractEnObjectBody(content) {
  const exportIndex = content.indexOf('export const en');
  if (exportIndex === -1) {
    throw new Error('Could not find `export const en` in en.ts');
  }

  const openBraceIndex = content.indexOf('{', exportIndex);
  if (openBraceIndex === -1) {
    throw new Error('Could not find opening brace for `export const en` in en.ts');
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let isEscaped = false;

  for (let i = openBraceIndex; i < content.length; i += 1) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '\'') {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inTemplateString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '`') {
        inTemplateString = false;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === '\'') {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === '`') {
      inTemplateString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, i);
      }
    }
  }

  throw new Error('Could not find closing brace for `export const en` in en.ts');
}

// Cache: resolved path -> Set<string>
let cachedKeys = null;
let cachedPath = null;

function getTranslationKeys(enFilePath) {
  // Cache keys by resolved path for the lifetime of the current ESLint process.
  try {
    const resolvedPath = path.resolve(enFilePath);
    if (cachedPath === resolvedPath && cachedKeys !== null) {
      return cachedKeys;
    }
    cachedKeys = parseTranslationKeys(resolvedPath);
    cachedPath = resolvedPath;
    return cachedKeys;
  } catch {
    return null;
  }
}

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: {
    name: 'eslint-plugin-i18n',
    version: '1.0.0',
  },
  rules: {
    'no-missing-translation-key': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Warn when t() is called with a string literal not defined in en.ts',
        },
        schema: [],
        messages: {
          missingKey:
            'Translation key "{{key}}" is not defined in en.ts. Add it to the translations file or fix the typo.',
        },
      },
      create(context) {
        // Resolve the path to en.ts relative to the eslint config (project root)
        const enFilePath = path.resolve(
          __dirname,
          '..',
          'src',
          'lib',
          'i18n',
          'translations',
          'en.ts',
        );

        const keys = getTranslationKeys(enFilePath);
        if (!keys) {
          // If we can't read en.ts, silently do nothing
          return {};
        }

        return {
          CallExpression(node) {
            // Match: t('...') or t("...")
            // Callee must be a simple identifier named 't'
            if (node.callee.type !== 'Identifier' || node.callee.name !== 't') {
              return;
            }

            // Must have at least one argument
            if (node.arguments.length === 0) {
              return;
            }

            const firstArg = node.arguments[0];

            // Only check string literals — skip variables, member expressions, templates
            if (firstArg.type !== 'Literal' || typeof firstArg.value !== 'string') {
              return;
            }

            const key = firstArg.value;

            if (!keys.has(key)) {
              context.report({
                node: firstArg,
                messageId: 'missingKey',
                data: { key },
              });
            }
          },
        };
      },
    },
  },
};

module.exports = plugin;
