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

- Use throwaway devices and a beta build (`APP_VARIANT=beta`: `bun run ios` or
  `bun run android` in `apps/mobile`, or the `preview-beta` EAS profile). Beta builds accept a
  one-step dev setup (below); production builds contain none of it.
- Without it, restore the demo backup through the welcome screen's
  **Already have a journal? Import it** (on iOS, copy the ZIP into the
  simulator's Files app storage; on Android, `adb push` it to `Download`).

### One-step dev setup

Pass a comma-separated list of settings when launching the app. The app applies
them while its loading screen shows, before Home or onboarding appears, and
shows no system alert. Install the beta app first, and build the demo ZIP (see
the demo journal section of the
[store screenshots README](../../../../../marketing/screenshots/README.md)).

iPhone or iPad simulator (a launch argument):

```sh
UDID=<simulator udid>
cp "$TMPDIR/tackbok-demo-backup.zip" \
  "$(xcrun simctl get_app_container "$UDID" dev.mehra.tackbok.beta data)/Documents/"
xcrun simctl terminate "$UDID" dev.mehra.tackbok.beta
xcrun simctl launch "$UDID" dev.mehra.tackbok.beta -tackbokDevSetup \
  "restore=tackbok-demo-backup.zip,onboarding=done,coachMarks=off,greeting=off,betaBadge=off,theme=dark,locale=en,run=$(date +%s)"
```

Android emulator with a development client (`bun run android` in `apps/mobile`,
Metro running). The setup travels in the launch URL, which Android opens without
a prompt. The development client's own URL loads Metro and passes
`tackbokDevSetup` on to the app; it must be a `VIEW` intent. The ZIP goes into
the app's `files/` folder through `run-as`, which needs a debuggable build:

```sh
adb reverse tcp:8081 tcp:8081
adb push "$TMPDIR/tackbok-demo-backup.zip" /data/local/tmp/
adb shell run-as dev.mehra.tackbok.beta sh -c \
  "'mkdir -p files && cp /data/local/tmp/tackbok-demo-backup.zip files/'"
adb shell "am start -S -W -a android.intent.action.VIEW -p dev.mehra.tackbok.beta \
  -d 'tackbok-beta://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081&tackbokDevSetup=restore=tackbok-demo-backup.zip,onboarding=done,coachMarks=off,greeting=off,betaBadge=off,theme=dark,locale=en,run=$(date +%s)'"
```

A release beta build (`bun run build:beta:android`) has no development client,
so use `-d 'tackbok-beta://?tackbokDevSetup=<settings>'`. Every setting except
`restore` works there: `run-as` can't write into a release build.

With `agent-device`, pass the same values as launch arguments in the `=` form,
so `-d` and `-a` aren't read as its own flags:

- iOS: `open dev.mehra.tackbok.beta --relaunch --launch-args=-tackbokDevSetup
  --launch-args='<settings>'`
- Android: `open dev.mehra.tackbok.beta --launch-args=-S --launch-args=-a
  --launch-args=android.intent.action.VIEW --launch-args=-d
  --launch-args='<URL above>'`. Without `-a`, agent-device sends a `MAIN`
  intent, and the app ignores the URL.

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
| `restore`    | A ZIP file name in the app's documents folder (`files/` on Android)      |
| `reset`      | `1` deletes all data and settings first, like **Delete all data**        |
| `screen`     | A route to open on top of Home, for example `/insights` or `/appearance` |
| `run`        | Any token. The same settings apply only once; a new token applies again  |

The app remembers the last settings it applied, because reloads keep the launch
argument or URL: a language change in Settings must not rerun a restore. Change
`run` (the commands above use the time) to apply them again. `greeting` and
`betaBadge` last for one launch; the other settings are saved. Switching between
left-to-right and right-to-left languages reloads the app once. Invalid values
appear in an alert and the rest still apply.

- The app reads the settings only on a cold launch, so keep the terminate step
  (`-S` on Android, `--relaunch` with `agent-device`).
- `restore` adds to what is already there. On a reused device, add `reset=1`
  for exactly the demo journal.
- Don't use it on a device signed in to cloud backup: the restored journal would
  sync to that backup. The theme also sets the status bar,
  so the system appearance doesn't need to match.

- iOS status bar: `xcrun simctl status_bar <udid> override --time 9:41 --batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi`.
  Set the simulator region to a 12-hour locale first (`AppleLocale en_US`,
  `AppleICUForce24HourTime false`), or the clock reads 09:41.
- Android status bar: System UI demo mode (`clock -e hhmm 0941`, battery 100 and
  unplugged, Wi-Fi level 4, mobile hidden, notifications hidden).
- Dark shots: choose the Dark theme (`theme=dark` in the dev setup). Since #232
  the status bar follows the app theme without a relaunch; set the system to dark
  mode too if system UI such as the keyboard is in the shot.
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
