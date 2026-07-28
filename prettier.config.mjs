// Base Prettier config for the monorepo. Prettier resolves the nearest config
// walking up from each file and does NOT merge parents, so this applies
// directly to apps/mobile and any root-level files. apps/website imports it and
// layers its Astro/Tailwind plugins on top.
export default {
  endOfLine: 'lf',
  printWidth: 90,
  tabWidth: 2,
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  bracketSameLine: true,
};
