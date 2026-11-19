# App screenshots

Raw, unframed captures of the Tackbok app. This folder is the single source for
app screenshots:

- The website frames them with `src/components/PhoneFrame.astro` (or the
  `.article-body img` styles for Markdown pages).
- `scripts/frame-screenshots.mjs` bakes a generic phone frame into copies for the
  repository README (`assets/screenshots/` at the repo root).
- [`marketing/screenshots/`](../../../../../marketing/screenshots/README.md) turns
  them into App Store and Google Play panels.

Keep these files unframed so they can be re-framed later.

Captured on 2026-11-18 (#194) from a Release build of `main` with the production
app identity, so the header has no "BETA" badge. Journal content is the made-up
demo journal from `marketing/screenshots/demo-journal/`, with two of the
maintainer's own photos; screens without journal
content use the onboarding example entries. Every file is WebP, quality 85, at
the device's full resolution.

| Folder     | Device                                    | Size      |
| ---------- | ----------------------------------------- | --------- |
| `ios/`     | iPhone 18 Pro simulator, iOS 27.0         | 1206×2622 |
| `ipad/`    | iPad Air 11-inch (M4) simulator, portrait | 1640×2360 |
| `android/` | Android Emulator, Medium Phone, API 36.1  | 1080×2400 |

## Capturing

- Use throwaway devices and a beta build (`APP_VARIANT=beta`: `bun run ios`,
  `bun run android`, or the `preview-beta` EAS profile). Beta builds accept a
  one-step dev setup (below); production builds contain none of it.
- Without it, restore the demo backup through the welcome screen's
  **Already have a journal? Import it** (on iOS, copy the ZIP into the
  simulator's Files app storage; on Android, `adb push` it to `Download`).

### One-step dev setup

Pass a comma-separated list of settings when launching the app. The app applies
it on the loading screen, before anything renders, and shows no system alert.
Build the demo ZIP first (see the demo journal section of the
[store screenshots README](../../../../../marketing/screenshots/README.md)).

iPhone or iPad simulator (a launch argument):

```sh
UDID=<simulator udid>
cp "$TMPDIR/tackbok-demo-backup.zip" \
  "$(xcrun simctl get_app_container "$UDID" dev.mehra.tackbok.beta data)/Documents/"
xcrun simctl terminate "$UDID" dev.mehra.tackbok.beta
xcrun simctl launch "$UDID" dev.mehra.tackbok.beta -tackbokDevSetup \
  'restore=tackbok-demo-backup.zip,onboarding=done,coachMarks=off,greeting=off,betaBadge=off,theme=dark,fontSize=default,titleFont=default,locale=en'
```

Android emulator (the launch URL, which Android opens without a prompt):

```sh
adb push "$TMPDIR/tackbok-demo-backup.zip" \
  /sdcard/Android/data/dev.mehra.tackbok.beta/files/tackbok-demo-backup.zip
adb shell "am start -S -W -a android.intent.action.VIEW -p dev.mehra.tackbok.beta \
  -d 'tackbok-beta://?tackbokDevSetup=restore=tackbok-demo-backup.zip,onboarding=done,coachMarks=off,greeting=off,betaBadge=off,theme=dark,locale=en'"
```

With `agent-device`, pass the same values with `open dev.mehra.tackbok.beta
--relaunch --launch-args -tackbokDevSetup --launch-args '<settings>'` on iOS, or
`--launch-args -d --launch-args 'tackbok-beta://?tackbokDevSetup=<settings>'`
on Android.

| Setting      | Values                                                                   |
| ------------ | ------------------------------------------------------------------------ |
| `onboarding` | `done` skips onboarding, including the analytics question; `show`        |
| `coachMarks` | `off` marks the Home coach marks as seen; `on` shows them again          |
| `greeting`   | `off` shows the plain title instead of the launch greeting               |
| `betaBadge`  | `off` hides the header's BETA badge                                      |
| `theme`      | Any theme id from `src/lib/theme/theme-tokens.ts`, for example `dark`    |
| `fontSize`   | `small`, `default`, `large`                                              |
| `titleFont`  | `default` or a title font id, for example `lora`                         |
| `locale`     | `device` or a supported locale such as `ar`, `zh-TW`                     |
| `restore`    | A backup ZIP's file name, restored with overwrite (folder per platform)  |
| `reset`      | `1` deletes all data and settings first, like **Delete all data**        |
| `screen`     | A route to open on top of Home, for example `/insights` or `/appearance` |

`greeting` and `betaBadge` last for that launch; the other settings are saved.
Switching between left-to-right and right-to-left languages reloads the app once,
which reapplies the settings without repeating `reset` or `restore`. A full
JavaScript reload in development applies the whole setup again. Invalid values
appear in an alert and the rest still apply.

- iOS status bar: `xcrun simctl status_bar <udid> override --time 9:41 --batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi`.
  Set the simulator region to a 12-hour locale first (`AppleLocale en_US`,
  `AppleICUForce24HourTime false`), or the clock reads 09:41.
- Android status bar: System UI demo mode (`clock -e hhmm 0941`, battery 100 and
  unplugged, Wi-Fi level 4, mobile hidden, notifications hidden).
- Dark shots: choose the Dark theme in Appearance, set the system to dark mode,
  then relaunch the app. Without the relaunch and the dark system setting, some
  screens keep black status-bar text.
- iPhone captures had a 3×3 black block in the top-left corner; it was painted
  over with the neighbouring colour during the WebP conversion.

## Files

The website uses only light captures. The dark ones feed the README's light/dark
`<picture>` and the store panels.

| File                                   | Screen                                                     | Used on                                                                  |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ios/timeline-light.webp`              | Timeline: yesterday's entry, photos, 175-day milestone     | Home hero and voice-note video poster (so also `og.png`), README, stores |
| `ios/timeline-dark.webp`               | Same, Dark theme                                           | README (dark mode), stores                                               |
| `ios/editor-light.webp`                | Editing that entry: mood, voice note, photos, tool bar     | Home hero (so also `og.png`), README                                     |
| `ios/editor-dark.webp`                 | Same, Dark theme                                           | README (dark mode)                                                       |
| `ios/entry-light.webp`                 | Reading that entry                                         | Stores                                                                   |
| `ios/entry-dark.webp`                  | Same, Dark theme                                           | —                                                                        |
| `ios/worksheet-light.webp`             | Journaling worksheet sheet                                 | Home features, stores                                                    |
| `ios/insights-light.webp`              | Insights: On this day, score, streaks, totals              | Home features, stores                                                    |
| `ios/insights-ar.webp`                 | Insights in Arabic (right-to-left), example entries        | —                                                                        |
| `ios/language-ar.webp`                 | Appearance in Arabic with the language list open           | Home "Yours, wherever you are"                                           |
| `ios/themes-light.webp`                | Theme picker                                               | Home structured data                                                     |
| `ios/themes-dark.webp`                 | Same, Dark theme                                           | Stores                                                                   |
| `ios/app-icon-light.webp`              | App icon picker                                            | —                                                                        |
| `ios/prompt-title-light.webp`          | New entry with a prompt as its title                       | `/gratitude-journal-prompts`                                             |
| `ios/prompt-library-light.webp`        | All prompts, Family tab                                    | `/gratitude-journal-prompts`                                             |
| `ios/settings-backup-light.webp`       | Settings: app lock on, Backup & restore                    | —                                                                        |
| `ios/settings-import-light.webp`       | Settings: Backup & restore with both import rows           | `/import/presently`, `/import/gratitude-app`                             |
| `ios/import-mode-light.webp`           | Choose import mode dialog                                  | `/import/gratitude-app`                                                  |
| `ios/cloud-backup-light.webp`          | Cloud backup & sync, signed out                            | Home "Yours, wherever you are"                                           |
| `ios/onboarding-theme-light.webp`      | Onboarding "Make it yours" step                            | —                                                                        |
| `ios/welcome-dark.webp`                | Older welcome screen (2026-09), Dark theme                 | Stores (logo crop only)                                                  |
| `ipad/*.webp`                          | Timeline (light, dark), entry, Insights, worksheet, themes | Stores (tablet)                                                          |
| `android/timeline-light.webp`, `-dark` | Timeline on Android                                        | —                                                                        |

Files marked "—" are not used yet. They are kept for store listings and later
pages. The home page's screen recordings live in
[`../videos/`](../videos/README.md).

## Regenerating

- README frames: `bun run frame-screenshots` in `apps/website`. It reads the
  `ios/` captures listed in the script and writes `assets/screenshots/` at the
  repo root.
- Store panels: `bun marketing/screenshots/render.mjs` from the repo root.
- Share image (`src/assets/og.png`, 1200×630): a shot of the home page hero
  without the sticky site header. With Playwright and the installed Chrome, open
  the built site at a 1200×900 viewport and a device scale factor of 2, take a
  1200×630 clip starting 70px below the top of the first `main section`, then
  resize to 1200×630 and save as a palette PNG (sharp:
  `png({ palette: true, quality: 90 })`).
