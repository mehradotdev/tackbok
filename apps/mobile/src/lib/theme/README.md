# Theme Architecture

This folder contains the source of truth and generated artifacts for theme and font metadata in the mobile app.

Single source of truth rule: edit `theme-tokens.ts`, then regenerate artifacts with `bun run generate:themes`. Do not hand-edit `registry.js`, `registry.cjs`, `registry.d.ts`, or generated sections in `src/global.css`.

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

- Theme ids, names, descriptions, light/dark variant, timeline-border defaults, backdrop selection, and default title-font mapping.
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
2. Update metadata such as `name`, `description`, `variant`, `enableTimelineBorders`, `backdropId`, or `defaultTitleFontId` as needed.
3. Update the theme token values in that same definition.
4. If you changed font references, make sure the referenced title font and body font pack still exist.
5. Run `bun run generate:themes` to rewrite the generated artifacts.
6. Run `bun run test:theme` to confirm the generated CSS and registry stay in sync.
7. If you changed theme ids, run Metro once so Uniwind regenerates `src/uniwind-types.d.ts`.
8. If you want one command for both steps, run `bun run generate:themes:verify`.

## How To Add A Theme Backdrop

A theme can opt into full-screen background art via the optional `backdropId` field. The art itself lives outside this folder, in `src/components/backdrops/`: screens mount the `ThemeBackdrop` resolver there, which maps the active theme's `backdropId` to its art component and renders nothing for themes without one.

1. Build the art component in `src/components/backdrops/` (read colors from live theme tokens via `useCSSVariable`, render one absolute-fill Skia canvas, honor `useReducedMotion`).
2. Set `backdropId: '<your-id>'` on the theme in `theme-tokens.ts`.
3. Run `bun run generate:themes` — the generated `BackdropId` union in `registry.d.ts` is derived from the ids used in theme definitions.
4. Register the component in the `BACKDROPS` map in `src/components/backdrops/ThemeBackdrop.tsx`. TypeScript errors until every backdrop id has a component.

Backdrop ids are not part of the CSS variable contract, so this never touches `global.css` or the every-theme-defines-every-variable rule.

### Helena and Poonam skies

These themes share `SkyBackdrop.tsx` and the original SkSL artwork in
`sky-shader.ts`. Helena is daylight; Poonam is moonlight. Both use the installed
Lora heading font and Inter body pack. Sky, cloud and celestial colors resolve
from scoped theme tokens, so picker previews use the same scene as full screens.

The canvas measures its container rather than the device window. Sun/moon placement
is bounded to the upper-right; blurred foliage follows the bottom edge. Picker
previews are still. Screen animation respects reduced motion, navigation focus
and app backgrounding. A gradient and celestial disc remain if shader compilation
is unavailable. Journal content uses the existing transparent screen layout.

When changing this artwork, check portrait, landscape and picker sizes, including
scrolling/editing on a physical device. Shader compilation and still renders alone
do not establish animation performance or battery impact.

### Shiro and Shadow pet scenes

`PetBackdrop.tsx` draws Shiro's white dog and Shadow's black cat with native Skia
paths, shapes and gradients. Both use Baskervville headings and Inter body text.
The pets keep their identity colors; atmosphere and surfaces use theme tokens.
Clouds, blinking, tails and particles pause off-focus/backgrounded and remain
still in previews or reduced-motion mode. Animated transforms are derived as
whole arrays: do not nest shared values inside a regular transform array.

The four sky/pet themes do not add opaque journal surface overrides. The
shared `BACKDROPS` map serves both screens and picker cards through `preview`;
botanical cards also use container-sized still artwork. Adding an entry to this
map automatically supplies its picker preview.

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
2. Add the font to `scripts/patch-font-metrics.py` and run it (see the script's
   docstring). Title fonts are vendored into `assets/fonts/` with their declared
   vertical metrics patched down to real ink extents — Google Fonts pad these
   metrics, and Android's half-leading line-box math turns that padding into
   clipped descenders at heading sizes.
3. Load the vendored asset in `fonts.ts`.
4. If the script reports the font's ink span exceeds Tailwind's heading line
   heights (only Gloria Hallelujah so far), add heading metrics in
   `typography.ts`.
5. If a theme should use it by default, update that theme's `defaultTitleFontId` in `theme-tokens.ts`.
6. Run `bun run generate:themes`.

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
