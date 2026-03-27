import path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultConfig } from 'expo/metro-config.js';
import { withUniwindConfig } from 'uniwind/metro';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Bun isolated linker: all deps are symlinks in apps/mobile/node_modules/ pointing
// into root/node_modules/.bun/ — no hoisted deps at monorepo root to watch/resolve.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Allow Metro to follow symlinks into the .bun central store
config.resolver.unstable_enableSymlinks = true;

// Add SQL source extension for Drizzle
config.resolver.sourceExts.push('sql');

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './src/global.css',
  // optional: path to typings
  dtsFile: './src/uniwind-types.d.ts',
  // Custom themes
  extraThemes: [
    'navy',
    'sakura',
    'forest',
    'lavender',
    'ember',
    'ocean',
    'slate',
    'peach',
    'kela',
    'hecker',
    'bubblegum',
  ],
});

export default uniwindConfig;
