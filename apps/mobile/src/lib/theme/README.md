# Theme Architecture

This folder contains the source of truth and generated artifacts for theme and font metadata in the mobile app.

## Current Shape

- `theme-tokens.ts`
  Canonical source of truth for theme metadata, title-font metadata, body-font packs, and theme token values.
  This is the first file to edit when adding or removing a theme or title font.
- `generate-theme-artifacts.ts`
  Generates the runtime artifacts consumed by Metro, TypeScript, and Uniwind.
  It updates or creates `src/global.css`, `registry.js`, `registry.cjs`, and `registry.d.ts` from `theme-tokens.ts`.
- `registry.js`
  Generated ESM metadata artifact used by runtime imports that need plain JavaScript.
- `registry.cjs`
  Generated CommonJS metadata artifact used by Node-side tooling such as Metro config.
- `registry.d.ts`
  Generated TypeScript contract for the generated registry artifact.
- `themes.ts`
  Exposes typed runtime helpers used by the app.
  Keep app-facing helpers here so the rest of the codebase does not depend directly on registry internals.
- `fonts.ts`
  Centralizes Expo font asset loading.
  The font family names here must match the font family strings referenced by theme tokens and typography helpers.
- `src/global.css`
  Contains the generated Uniwind theme-token layer via `@variant` blocks.
  Uniwind still consumes CSS variants at runtime, but the values now come from generated output instead of hand-edited theme blocks.
  Handwritten CSS above the generated marker block is preserved on regeneration.
- `typography.ts`
  Holds typography-specific runtime behavior like heading metrics and selective runtime overrides via `Uniwind.updateCSSVariables()`.

## What Is Centralized Today

- Theme ids, names, descriptions, light/dark variant, timeline-border defaults, and default title-font mapping.
- Title font ids, labels, and loaded font family names.
- Body font packs and the per-theme body-font selection.
- Full theme token values used to generate the CSS `@variant` blocks.
- Metro custom theme registration derives from the generated registry instead of hardcoding ids.
- App font loading derives from a single shared asset map.

## What Is Intentionally Not Centralized

- Runtime theme switching still uses `Uniwind.setTheme()`.
- `Uniwind.updateCSSVariables()` is reserved for selective user overrides, not full theme definition.

That split is intentional. The source of truth is now centralized in TypeScript, but the runtime model still stays aligned with how Uniwind is built to work.

## How To Add A Theme Today

1. Add the theme definition to `theme-tokens.ts`.
2. If the theme uses a new body-font pack or title font, add that metadata there too.
3. Run `bun run generate:themes`.
4. Run `bun run test:theme`.
5. If you added, removed, or renamed a theme id, run Metro once so Uniwind refreshes `src/uniwind-types.d.ts`.
6. If you want one command for both steps, run `bun run generate:themes:verify`.

## How To Update An Existing Theme

1. Edit the target theme in `THEME_DEFINITIONS` inside `theme-tokens.ts`.
2. Update metadata such as `name`, `description`, `variant`, `enableTimelineBorders`, or `defaultTitleFontId` as needed.
3. Update the theme token values in that same definition.
4. If you changed font references, make sure the referenced title font and body font pack still exist.
5. Run `bun run generate:themes` to rewrite the generated artifacts.
6. Run `bun run test:theme` to confirm the generated CSS and registry stay in sync.
7. If you changed theme ids, run Metro once so Uniwind regenerates `src/uniwind-types.d.ts`.
8. If you want one command for both steps, run `bun run generate:themes:verify`.

## How `src/global.css` Is Managed

`src/global.css` has two ownership zones:

1. Manual CSS above the generated marker block.
2. Generated theme CSS inside the marker block.

The generator removes and rebuilds only the generated block:

- `/* @generated theme-artifacts:start */`
- `/* @generated theme-artifacts:end */`

If `src/global.css` is missing, empty, or contains only the two import statements, the generator bootstraps a default manual shell before appending the generated theme block.

That means:

- You can safely add handwritten utilities or shared CSS above the generated markers.
- You should not manually edit anything inside the generated block.
- If you delete `src/global.css`, running `bun run generate:themes` will recreate it.

## How To Add A Title Font Today

1. Add the font metadata to `TITLE_FONTS` in `theme-tokens.ts`.
2. Load the font asset in `fonts.ts`.
3. If needed, add heading metrics in `typography.ts`.
4. If a theme should use it by default, update that theme's `defaultTitleFontId` in `theme-tokens.ts`.
5. Run `bun run generate:themes`.

## Generated Files

- `registry.js`
- `registry.cjs`
- `registry.d.ts`
- The generated theme sections inside `src/global.css`

Do not edit those by hand. Edit `theme-tokens.ts` and regenerate them instead.

`src/uniwind-types.d.ts` is a separate generated artifact owned by Uniwind's Metro integration. It should also not be edited by hand, but it is not written by `generate-theme-artifacts.ts`.

## Generator Workflow

The generator keeps the runtime theming model simple:

1. `theme-tokens.ts` defines theme metadata and token values.
2. `generate-theme-artifacts.ts` generates `registry.js`, `registry.cjs`, `registry.d.ts`, and the theme sections in `src/global.css`.
3. Metro + Uniwind regenerate `src/uniwind-types.d.ts` from the configured theme list.
4. Uniwind still reads the generated CSS and runtime switching still uses `Uniwind.setTheme()`.

## Recommended Commands

- `bun run generate:themes`
  Regenerate theme artifacts only. Use this for fast iteration.
- `bun run test:theme`
  Run the focused theme safety checks, including Uniwind type drift.
- `bun run generate:themes:verify`
  Regenerate theme artifacts and then run the focused theme tests in one step.

This avoids imperative full-theme mutation at runtime while still giving you a single structured source of truth.

## Why This Shape Is Preferred

- Preserves Uniwind's preferred CSS-based runtime model.
- Avoids imperative theme mutation for every token.
- Keeps theme previews with `ScopedTheme` straightforward.
- Makes theme additions much more repeatable.
- Gives Metro and TypeScript the plain generated artifacts they need.

## Upgrade Path From Here

If you later want even stronger design-token tooling, the next step is not runtime mutation. The next step is splitting token data into a more formal design-token schema and keeping this generator as the conversion layer.

Until then, `theme-tokens.ts` plus generated artifacts is the preferred steady state.
