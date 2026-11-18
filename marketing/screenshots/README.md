# Store screenshots

One English seven-panel design, exported at four sizes for the App Store and
Google Play. The panels use the raw app captures in
[`apps/website/src/assets/screenshots/`](../../apps/website/src/assets/screenshots/README.md),
the same folder the website uses. The Android exports reuse the iOS captures at
Android listing sizes; check that the visible UI matches the shipping Android app.

## Render

From the repository root, with dependencies installed using Bun:

```sh
# Create all four sets
bun marketing/screenshots/render.mjs

# Create just one set
bun marketing/screenshots/render.mjs --target=android-phone

# Validate all inputs and layouts without writing exports
bun marketing/screenshots/render.mjs --check

# Run the renderer's checks in a temporary folder
bun marketing/screenshots/verify.mjs
```

| Target           | Size                 | Output folder            |
| ---------------- | -------------------- | ------------------------ |
| `iphone`         | 1242×2688 (6.5-inch) | `output/iphone/`         |
| `android-phone`  | 1080×1920            | `output/android-phone/`  |
| `ipad`           | 2064×2752 (13-inch)  | `output/ipad/`           |
| `android-tablet` | 1600×2560 (10-inch)  | `output/android-tablet/` |

Each folder contains seven numbered PNGs and `contact-sheet.png`. Upload only
the numbered PNGs. Exports have no alpha channel. These commands create files
locally; they do not upload or publish anything. `output/` is ignored by Git.

The tablet sets are portrait: Xcode 27 simulators can't be rotated from a script.
The renderer keeps a landscape layout for presets wider than they are tall, but
`capture()` only accepts portrait sources today; relax its size check before
adding landscape tablet captures.

## What belongs where

| Path            | Purpose                                                              |
| --------------- | -------------------------------------------------------------------- |
| `inputs.json`   | The capture file and crop rectangle for each screenshot slot         |
| `panels.json`   | English headlines, panel order and layout choices                    |
| `presets.mjs`   | The four output sizes and which inputs (phone or tablet) each uses   |
| `render.mjs`    | Composes the panels and contact sheets                               |
| `verify.mjs`    | Checks exports and rejection of invalid inputs                       |
| `fonts.conf`    | Uses the repository's bundled fonts                                  |
| `demo-journal/` | Builds the made-up journal the captures show, with its two photos    |
| `.cache/fonts/` | Disposable font cache, recreated automatically and ignored by Git    |
| `input/`        | Ignored by Git. Older checkouts kept captures of a real journal here |

`inputs.json` paths are relative to `apps/website/src/assets/screenshots/`.
Phone light-theme and timeline slots intentionally share one image. The closing
card uses the logo cropped from `ios/welcome-dark.webp` for all four targets.

## Demo journal

The captures show a made-up journal, not anyone's real entries.
`demo-journal/build.mjs` writes a Tackbok backup ZIP with 176 entry days (so the
timeline shows "175 days of gratitude" below yesterday's entry), an "On this day"
memory four years back, a text-to-speech voice note and two photos. Text lives in
`demo-journal/entries.mjs`.

The two photos are the maintainer's own, committed with their permission in
`demo-journal/photos/` with all metadata stripped. The script re-encodes every
photo, so EXIF and location data never reach the ZIP. It runs on macOS only
(`say`, `afconvert` and `afinfo` make the voice note):

```sh
bun marketing/screenshots/demo-journal/build.mjs
# Writes tackbok-demo-backup.zip to the system temp folder. Options:
#   --out=<file.zip> --today=YYYY-MM-DD --selfie=<photo> --restaurant=<photo>
```

Dates count back from the day you run it in this Mac's timezone, so build the ZIP
on the day you capture. iOS simulators use the Mac's timezone; set an Android
emulator to the same one, or "yesterday" and the milestone shift. The script
fails if the dates don't give 176 separate days with exactly one four-year
"On this day" memory.

Restore it on a throwaway simulator or emulator through the welcome screen's
**Already have a journal? Import it**, never on a personal device. The capture
steps are in the screenshots README linked above.

## Update screenshots or text

1. Replace the capture in `apps/website/src/assets/screenshots/`. Keep its native
   size. Phone sources must be at least 1179×2556 portrait; tablet sources at
   least 1640×2360 portrait.
2. Update its `file` and `crop` in `inputs.json` if the layout moved. Crop
   coordinates are pixels in the original image.
3. Edit headlines in `panels.json` if needed. `\n` sets an intentional line break.
   For another language, copy the panel set and captures per locale; the
   renderer currently reads one English `panels.json`.
4. Render and inspect every panel plus the contact sheets. Check text clipping,
   image sharpness, system bars, private information and accurate feature claims.

The renderer fits images proportionally and validates inputs before writing any
panels. A validation failure leaves existing exports untouched, so check the
command's exit status before using them. The font cache can be deleted at any time.
