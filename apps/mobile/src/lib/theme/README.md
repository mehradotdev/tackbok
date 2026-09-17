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

### Helena and Poonam meadows

`SkyBackdrop.tsx` shares one meadow composition between daylight Helena and
moonlit Poonam. Both retain Lora headings and Inter body text. Helena's UI primary
is soft blue; artwork colors live independently in `MEADOW_PALETTES` in
`theme-tokens.ts`, so the sun stays golden and clouds stay ivory. The scoped
background token still supplies the sky. `meadow-sky-shader.ts` is isolated from
the older shader used by pet scenes and Camino.

`meadow-art.ts` builds three batched layers of rooted grass blades and seed heads.
Individual tips bend with continuous sway and phased traveling gusts. Actual
container dimensions determine plant count and depth: tablet/landscape layouts
reveal additional meadow instead of stretching phone art. Soft distance blur and
a palette wash keep transparent journal content readable.

The sky uses elapsed active seconds for continuous left-to-right clouds (about
75 seconds per phone-width), without a reversing loop. Thin clouds veil the
upper-right sun/full moon. Night retains faint stars and lunar texture.
A gradient/disc fallback remains if shader compilation fails.

One dragonfly (day) or moth (night) visits for 8–12 seconds, then stays absent for
10–20 seconds. Each visit randomizes direction and two or three foreground grass
tips to hover above, with rapid wing motion and slight positional drift. This
replaces Helena's previous bird flock. Opening the keyboard cancels the visitor;
closing it starts a fresh quiet interval. Grass and clouds continue while typing.
Focus loss, backgrounding and unmount stop the clock and clear visitor timers.
Reduce Motion and picker previews show still scenery without wildlife.

Run `node scripts/art/render-meadow.cjs` from the mobile directory to compile the
actual shader and render grass geometry at phone, tablet, landscape and picker
sizes at three animation times in `/tmp/meadow-previews`. The renderer checks
body-text contrast across every pixel, including sample visitor silhouettes.
Physical-device motion, scrolling and keyboard checks complement these stills;
headless renders do not establish GPU performance or battery use.

### Shiro and Shadow pet scenes

`PetBackdrop.tsx` uses the diffuse sky and textured stone shaders, native Skia
vector art for both Shiro and Shadow. Both use Baskervville headings
and Inter body text. Atmosphere and surfaces use theme tokens.

Shiro's editable assets live in `assets/images/shiro-dog-vector/`. Compile them
with `python3 scripts/art/generate-shiro-art.py` from the mobile directory after
editing. The three authored head views support a smooth turn. Idle motion includes
breathing, blinking, gentle continuous wagging and randomly selected single/double
silent barks, with a fresh 2–5-second quiet pause between bursts.
The home dock's “Play with Pet” action triggers a four-second turn, head tilt and
two silent barks, ignoring repeated presses during playback. Shadow also exposes the same action: an equal random choice between an eyes-first
knowing glance (tilt, slow blink, tail flick) and a silent meow followed by a blink.
Its idle behavior stays quiet, with blinking, ear turns and small tail-tip sways.
Shadow's source poses are in `assets/images/shadow-cat-vector/`; compile them with
`python3 scripts/art/generate-shadow-art.py`. The approved three-quarter resting
view turns through an authored transition pose to the front view. Blinks follow
the eye angles; quick near-ear flicks and a larger anchored tail sweep keep idle
movement visible at phone size.

Focus loss/backgrounding cancels pet playback and pending callbacks. Previews
stay still; Reduce Motion uses a timed still greeting instead of a performance.
The home-local interaction provider keeps commands out of share/picker scenes.
Animated transforms are derived as whole arrays: do not nest shared values
inside a regular transform array.

The four sky/pet themes do not add opaque journal surface overrides. The
shared `BACKDROPS` map serves both screens and picker cards through `preview`;
botanical cards also use container-sized still artwork. Adding an entry to this
map automatically supplies its picker preview.

### Camino and Camino Night

Two manually selected themes share `CaminoBackdrop.tsx`, with Space Mono headings
and Inter body text. They use the normal theme/font override and picker systems.
`CaminoLandscape.tsx` renders original native vector paths from `camino-art.ts`:
a winding trail, lone pilgrim, distant cathedral, wildflowers and a right-side
stone waymarker. Landmark scales are uniform and bounded by container dimensions;
wider containers reveal more countryside. The shell sits above the dock's default
position; a manually moved dock can overlap the artwork.

A final full-canvas color wash mutes every layer so transparent journal entries
remain readable throughout the screen. Daytime birds use Helena's wing motion in
a small flock: an 8-second initial wait, then a six-second crossing every 10
seconds. Cloud drift follows Helena's timing; `camino-sky-shader.ts` adds visible
cloud banks and phased nighttime star shimmer to the shared sky shader. Focus loss/backgrounding stops animation, reduced motion and
picker previews are still, and a gradient/disc fallback handles shader failure.

Run `node scripts/art/render-camino.cjs` from the mobile directory to render the
actual Skia art and compile its shader at phone, tablet, landscape and picker sizes
in `/tmp/camino-previews`. The night renders sample two animation phases. The
renderer also checks body-text contrast against every background pixel (at least
4.5:1). These stills complement native scrolling and animation checks; they do not
measure GPU
performance or battery use.


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
