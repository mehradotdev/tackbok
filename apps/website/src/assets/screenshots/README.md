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

| File                                   | Screen                                                   | Used on                      |
| -------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| `ios/timeline-light.webp`, `-dark`     | Home timeline with the example entries                   | Home hero, README, `og.png`  |
| `ios/editor-light.webp`, `-dark`       | Editing an entry: mood, photos, Mood/Photo/Voice/Tag bar | Home hero, README, `og.png`  |
| `ios/entry-light.webp`, `-dark`        | Reading an entry with a mood and photos                  | —                            |
| `ios/worksheet-light.webp`             | Journaling worksheet sheet                               | Home features                |
| `ios/insights-light.webp`              | Insights (score, streaks, totals, calendar)              | Home features                |
| `ios/insights-ar.webp`                 | Insights in Arabic (right-to-left)                       | —                            |
| `ios/language-ar.webp`                 | Appearance in Arabic with the language list open         | —                            |
| `ios/themes-light.webp`, `-dark`       | Theme picker                                             | Home "Make it yours"         |
| `ios/app-icon-light.webp`              | App icon picker                                          | —                            |
| `ios/prompt-title-light.webp`          | New entry with a prompt as its title                     | `/gratitude-journal-prompts` |
| `ios/prompt-library-light.webp`        | All prompts, Family tab                                  | `/gratitude-journal-prompts` |
| `ios/settings-backup-light.webp`       | Settings: app lock on, Backup & restore                  | —                            |
| `ios/settings-import-light.webp`       | Settings: Backup & restore with the import rows          | `/import/*` guides           |
| `ios/cloud-backup-light.webp`          | Cloud backup & sync, signed out                          | —                            |
| `ios/onboarding-theme-light.webp`      | Onboarding "Make it yours" step                          | —                            |
| `android/timeline-light.webp`, `-dark` | Home timeline on Android                                 | —                            |

Files marked "—" are kept for the landing page refresh (#195) and store listings.

## Regenerating

- README frames: `bun run frame-screenshots` in `apps/website`.
- Share image (`src/assets/og.png`, 1200×630): a screenshot of the home page hero
  at a 1200×630 viewport, for example
  `bunx --bun playwright@1.56.1 screenshot --channel chrome --viewport-size "1200,630" http://localhost:4321/ og.png`,
  then compressed.
