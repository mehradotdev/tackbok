# Shadow vector artwork and animation

`resting.svg` is the approved upward-looking three-quarter pose, based on
`../elegant_black_cat.png`. `front.svg` is its authored front-facing counterpart.
`transition.svg` supplies an authored half-turn between them. All three preserve
the seated body and hanging tail anchors on a 1024 × 1536 canvas.
The app draws compiled vector geometry, not the original PNG.

## Behavior

- Idle: subtle breathing, angled blinks (0.5–0.6 seconds) and quick near-ear flicks, visible tail-tip
  sway. No idle meowing.
- The home “Play with Pet” action randomly chooses between two four-second
  performances, with equal probability and repeats allowed.
- Knowing glance: eyes shift toward the viewer, hold for 250ms, head follows,
  slight tilt, slow blink, tail-tip flick, then return to the resting gaze.
- Silent meow: the same eyes-first turn, small mouth opening, slow blink, return.
- Extra presses during playback are ignored. Blur/background cancels playback;
  resuming does not replay commands. Picker previews stay still. Reduce Motion
  shows a still friendly front view for 1.8 seconds instead of animating.

The near-black fur uses violet rim highlights and low-opacity gradient halos for
nighttime visibility. Tail curve deformation fades to zero at the root so its
attachment stays fixed beneath the haunch. The rig supports seated gestures;
it is not a walking or jumping rig.

## Source and generated data

From the repository root:

```sh
python3 apps/mobile/scripts/art/generate-shadow-art.py
node apps/mobile/scripts/art/render-shadow.cjs /tmp/shadow-frames
```

The standard-library Python compiler reads the three SVGs and generates
`src/components/backdrops/shadow-art.generated.ts`; do not edit that file manually.
The compiler supports the path, ellipse, group, clipping and linear-gradient
features used here, not arbitrary SVG features. Keep corresponding path command
counts and group ordering compatible across poses.

The frame renderer draws the real Skia component with sampled shared values. It
checks artwork/interpolation, not native frame rate or battery use. Keep output
PNGs/GIFs outside the repository. No Python or rendering tool is required by the
mobile runtime.

`PetInteractionProvider` is shared with Shiro and scoped to home. Only the active
pet registers a command handler; picker/share scenes do not receive home actions.
