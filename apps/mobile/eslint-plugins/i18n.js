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

  const keys = new Set();

  // Match unquoted identifier keys:  KeyName: '...'  or  KeyName: "..."
  const identifierKeyRegex = /^\s+([a-zA-Z_]\w*)\s*:/gm;
  let match;
  while ((match = identifierKeyRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  // Match single-quoted string keys:  'Some Key': '...'
  const singleQuoteKeyRegex = /^\s+'([^']+)'\s*:/gm;
  while ((match = singleQuoteKeyRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  // Match double-quoted string keys:  "Some Key": "..."
  const doubleQuoteKeyRegex = /^\s+"([^"]+)"\s*:/gm;
  while ((match = doubleQuoteKeyRegex.exec(content)) !== null) {
    keys.add(match[1]);
  }

  return keys;
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
