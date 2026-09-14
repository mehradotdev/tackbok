# Shiro vector artwork and motion

The mobile app now draws Shiro from these editable SVG paths using Skia and
Reanimated. Shadow continues to use its existing PNG.

## Source artwork

- `resting.svg`: approved upward-facing pose. Includes a browser SMIL preview of
  continuous tail wagging and a sample mix of single/double silent barks. This
  script-free preview repeats a fixed schedule; the app randomizes the schedule.
  Some IDE previews display SVGs statically; open the file in a browser to see it.
- `three-quarter.svg`: authored intermediate view, including a foreshortened far
  eye and ear. The turn passes through this geometry instead of jumping between
  profile and front.
- `front.svg`: softer cheek contours, outward-flopping ears, small eyes and a wide
  nose, based on the supplied expression references.

Every source uses a 1225 × 1284 viewBox and the same body and paw baseline
(approximately y=1245). Keep path commands compatible across head views. The
source image's uppermost black dot is the nose, not a second eye.

## Runtime

Run from the repository root after changing the SVG geometry:

```sh
python3 apps/mobile/scripts/art/generate-shiro-art.py
```

The Python generator uses only the standard library and is a development tool;
Python is not required to run or bundle the app. Keep the generator and editable
SVGs together so art changes remain reproducible.

This generates `src/components/backdrops/shiro-art.generated.ts`. Do not edit the
generated data manually. The compiler extracts plain paths and gradient data;
SVG SMIL elements are only for browser preview and are not used in the app.

`ShiroDog.tsx` draws the layers, morphs the authored head/ear/nose paths and moves
the facial features. `shiro-motion.ts` supplies choreography; `useShiroMotion.ts`
owns lifecycle and playback. Mouth openings and eye closure are procedural Skia
shapes. This is a seated rig, not a rig for walking or jumping.

The idle loop gently wags the tail, blinks, twitches an ear and gives a small
silent upward burst of one or two barks (equal probability), followed by a newly
randomized 2–5-second quiet pause. Idle gestures yield during the paw action:
turn through the three-quarter pose, tilt, bark twice, then return to rest.
Repeated presses are ignored until that sequence finishes.

Focus loss or backgrounding cancels playback and pending callbacks. Picker
previews remain still. Reduce Motion stops idle motion and replaces the paw
performance with a still friendly expression shown for 1.8 seconds.

The home-local `ShiroInteractionProvider` connects the accessible “Play with Pet”
dock button to the decorative canvas, which remains noninteractive. Other
screens and picker previews do not receive those commands.

## Rig anchors

| Part | Pivot in viewBox coordinates |
| --- | --- |
| Head | 650, 617 |
| Near ear at rest | 378, 399 |
| Tail | 354, 1160 |
| Visible eye at rest | 587, 278 |

The ear pivot and eye positions move through the authored views. Body/head,
collar and tail overlaps hide joints within these small motion ranges; paw
contours are not independent walking limbs.

## Reproduce the motion preview

From the repository root, render the real Skia component at fixed animation times:

```sh
node apps/mobile/scripts/art/render-shiro.cjs /tmp/shiro-frames
```

This uses the installed CanvasKit/React/TypeScript packages and fixes shared values
at each sampled time. It checks the drawing and path interpolation, not native
frame rate or battery use. Generated PNG frames and optional GIFs are review artifacts; keep them outside
the repository. Random waiting intervals are exercised by the lifecycle tests.
