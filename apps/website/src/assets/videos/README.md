# Feature videos

Short, silent, looping screen recordings of the real app for the home page.
`src/components/PhoneFrame.astro` plays them inside the phone frame, over a
poster image, and only while they are on screen. Each has a pause button (WCAG
2.2.2). Visitors who prefer reduced motion see the poster only, and the clip is
never downloaded for them.

Recorded on 2026-11-18 (#195) on an iPhone 18 Pro simulator (iOS 27.0) with the
same Release build, production app identity and made-up demo journal as the
screenshots (see [`../screenshots/README.md`](../screenshots/README.md)). Never
record a real journal.

| Clip         | Shows                                              | Poster                                                                                   |
| ------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `voice-note` | Playing the 7-second voice note on the timeline    | `../screenshots/ios/timeline-light.webp` (the hero image, so it costs no extra download) |
| `themes`     | Light → Shiro → Helena → Light in the theme picker | `themes-poster.webp` (first frame)                                                       |
| `app-icon`   | Classic → Ocean → Rose → Classic, at 1.6× speed    | `app-icon-poster.webp` (first frame)                                                     |

The voice-note clip loops from the end of playback back to the paused poster,
a small visible jump: recording it again on another day would no longer match
the hero screenshot it uses as its poster.

The theme clip uses light-background themes only: the status bar text follows
the system appearance, not the app theme, so dark themes would show black clock
text on a dark header.

## Recording and encoding

1. Record the whole simulator screen (the T3 device tools'
   `agent-device record start --scope device --hide-touches`, or
   `xcrun simctl io <udid> recordVideo`), with the status bar overridden to 9:41
   as for the screenshots.
2. Trim to 5–8 seconds, start and end on the same state so the loop is seamless,
   drop audio, scale to 540px wide at 30 fps, and encode both formats:

   ```sh
   vf="trim=start=<s>:end=<e>,setpts=(PTS-STARTPTS)/<speed>,fps=30,scale=540:-2:flags=lanczos"
   ffmpeg -i raw.mp4 -an -vf "$vf" -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 \
     -deadline good -cpu-used 1 -pix_fmt yuv420p <clip>.webm
   ffmpeg -i raw.mp4 -an -vf "$vf" -c:v libx264 -preset slow -crf 27 \
     -profile:v high -pix_fmt yuv420p -movflags +faststart <clip>.mp4
   ```

   The simulator recorder writes no frames while the screen is still, so the
   first frame can last two seconds; start the trim at 0 rather than skipping it.
   The app icon clip plays at 1.6× (`<speed>` = 1.6) to shorten the iOS
   confirmation alerts.

3. Export the first frame as the poster (`ffmpeg -i <clip>.mp4 -frames:v 1`)
   and convert it to WebP with sharp, quality 80.

Each file should stay well under 1 MB; the current ones are 60–285 KB.
