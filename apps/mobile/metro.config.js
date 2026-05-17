import path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultConfig } from 'expo/metro-config.js';
import { withUniwindConfig } from 'uniwind/metro';
import themeRegistry from './src/lib/theme/registry.cjs';

// Metro config runs under Node. The generated runtime registry stays ESM for app
// imports, so Metro reads the CommonJS companion and plucks values from the
// default import instead of relying on named imports from a CJS module.
const { CUSTOM_THEME_IDS } = themeRegistry;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Add SQL source extension for Drizzle
config.resolver.sourceExts.push('sql');

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './src/global.css',
  // optional: path to typings
  dtsFile: './src/uniwind-types.d.ts',
  // Custom themes
  extraThemes: [...CUSTOM_THEME_IDS],
});

export default uniwindConfig;
