# App screenshots

Raw, unframed captures of the Tackbok app. The website frames them with
`src/components/PhoneFrame.astro` (or the `.article-body img` styles for Markdown
pages), and `scripts/frame-screenshots.mjs` bakes a generic phone frame into
copies for the repository README (`assets/screenshots/` at the repo root). Keep
these files unframed so they can be re-framed later.

Captured on 2026-11-18 (#194) from a Release build of `main` with the production
app identity, so the header has no "BETA" badge. All content comes from the
onboarding **example entries**; no personal data. Every file is WebP, quality 85,
at the device's full resolution.

| Folder     | Device                                   | Size      |
| ---------- | ---------------------------------------- | --------- |
| `ios/`     | iPhone 18 Pro simulator, iOS 27.0        | 1206×2622 |
| `android/` | Android Emulator, Medium Phone, API 36.1 | 1080×2400 |

## Status bar

- iOS: `xcrun simctl status_bar <udid> override --time 9:41 --batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi`.
  Set the simulator region to a 12-hour locale first (`AppleLocale en_US`,
  `AppleICUForce24HourTime false`), or the clock reads 09:41.
- Android: System UI demo mode (`clock -e hhmm 0941`, battery 100 and unplugged,
  Wi-Fi level 4, mobile hidden, notifications hidden).

iOS simulator captures had a 3×3 black block in the top-left corner; it was
painted over with the neighbouring colour during the WebP conversion.

## Files

The website uses only the light captures. The dark ones feed the README's
light/dark `<picture>`.

| File                                   | Screen                                                   | Used on                                      |
| -------------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| `ios/timeline-light.webp`              | Home timeline with the example entries                   | Home hero (so also `og.png`), README         |
| `ios/timeline-dark.webp`               | Same, Dark theme                                         | README (dark mode)                           |
| `ios/editor-light.webp`                | Editing an entry: mood, photos, Mood/Photo/Voice/Tag bar | Home hero (so also `og.png`), README         |
| `ios/editor-dark.webp`                 | Same, Dark theme                                         | README (dark mode)                           |
| `ios/entry-light.webp`, `-dark`        | Reading an entry with a mood and photos                  | —                                            |
| `ios/worksheet-light.webp`             | Journaling worksheet sheet                               | Home features                                |
| `ios/insights-light.webp`              | Insights: On this day, score, streaks, totals            | Home features                                |
| `ios/insights-ar.webp`                 | Insights in Arabic (right-to-left)                       | —                                            |
| `ios/language-ar.webp`                 | Appearance in Arabic with the language list open         | —                                            |
| `ios/themes-light.webp`                | Theme picker                                             | Home "Make it yours"                         |
| `ios/themes-dark.webp`                 | Same, Dark theme                                         | —                                            |
| `ios/app-icon-light.webp`              | App icon picker                                          | —                                            |
| `ios/prompt-title-light.webp`          | New entry with a prompt as its title                     | `/gratitude-journal-prompts`                 |
| `ios/prompt-library-light.webp`        | All prompts, Family tab                                  | `/gratitude-journal-prompts`                 |
| `ios/settings-backup-light.webp`       | Settings: app lock on, Backup & restore                  | —                                            |
| `ios/settings-import-light.webp`       | Settings: Backup & restore with both import rows         | `/import/presently`, `/import/gratitude-app` |
| `ios/cloud-backup-light.webp`          | Cloud backup & sync, signed out                          | —                                            |
| `ios/onboarding-theme-light.webp`      | Onboarding "Make it yours" step                          | —                                            |
| `android/timeline-light.webp`, `-dark` | Home timeline on Android                                 | —                                            |

Files marked "—" are not used yet. They are kept for the landing page refresh
(#195) and store listings.

For the On this day card, the "Small moments" example entry was moved to the same
day one year earlier in the entry editor, after the timeline and editor shots
were taken. That is why those shots date it Nov 16, 2026 and Insights shows
Nov 18, 2025.

## Regenerating

- README frames: `bun run frame-screenshots` in `apps/website`. It reads the
  `ios/` captures listed in the script and writes `assets/screenshots/` at the
  repo root.
- Share image (`src/assets/og.png`, 1200×630): a shot of the home page hero
  without the sticky site header. With Playwright and the installed Chrome, open
  the built site at a 1200×900 viewport and a device scale factor of 2, take a
  1200×630 clip starting 70px below the top of the first `main section`, then
  resize to 1200×630 and save as a palette PNG (sharp:
  `png({ palette: true, quality: 90 })`).
