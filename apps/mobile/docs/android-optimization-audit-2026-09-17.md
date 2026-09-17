# Android optimization audit

Audit date: 2026-09-17. Requested baseline: `v0.6.0`, which resolves exactly to `573983002c83d692c66e227afc31be7d856fff08`. Current source comparison: `1930359` (package version 1.0.1).

This is an audit, not an implementation. No app configuration, dependency, asset, or runtime source changes were made. No cloud build or store submission was started.

## Evidence and limits

Inspected the baseline Git tree, current source and installed dependency implementations, the supplied Play screenshots, and the actual local `tackbok-v0.6.0.apk`. APK SHA-256: `49a759eda6cf559f4645456ed310918fee0dce3fe998623114bf99b3b83013ec`.

Android `aapt2` identifies the APK as `dev.mehra.tackbok`, version 0.6.0, versionCode 8, min SDK 24, target/compile SDK 36, with four ABIs. It does not report application-debuggable. Its provenance cannot establish that this exact APK matches the AAB Play analyzed; the original AAB/build logs and Play device-download figures were not available. The ignored local Android directory is stale (beta package, version 0.6.0), so it is evidence about generated settings, not an authoritative current production build.

A fresh current-source production Android export succeeded: 5,312 modules, 70 asset entries, Hermes bytecode 10,008,272 bytes (9.545 MiB). Export used local environment values, not a retrieved EAS production environment. Source maps were analyzed locally; source-content sizes below are not compiled byte contributions.

All size units below are MiB (1,048,576 bytes). ZIP stored bytes are not Play's compressed network download or installed disk usage.

## Conclusions and priority

| Priority | Action | Expected effect | Confidence / constraint |
| --- | --- | --- | --- |
| P0 | Enable release R8, resource shrinking, and the optimized ProGuard preset through persistent Expo configuration | Directly addresses the low DEX obfuscation/optimization issue | Configuration gap confirmed; final Play percentage and savings require a native release build |
| P1 | Import the eight used Inter/JetBrains Mono faces from per-weight subpaths | Removes 26 unnecessary font variants: 5.96 MiB raw / 2.91 MiB compressed in the old APK | Strong evidence; verify export asset list after change |
| P1 | Fix or upgrade audio-api notification artwork loader | Addresses the exact bitmap warning | Installed source still contains the flagged network/decode pattern |
| P1 | Track framework fixes for deprecated edge-to-edge APIs and test insets | Addresses compatibility recommendation | Named RN calls are still in installed RN 0.86.0; source upgrade alone has not removed them |
| P2 | Evaluate Metro tree shaking / icon import strategy | Reduce JS module graph, bundle and OTA payload | Current graph includes 1,713 Lucide icon modules; experimental optimization needs runtime validation |
| P3 | Remove or relocate four legacy image PNGs | Repository cleanup: 0.775 MiB | No expected baseline APK saving; these images were not bundled |
| Deferred | Replace audio engine or Skia | Potentially large native savings | Significant feature migration, not safe dependency deletion |

Apple's lack of these warnings is expected: DEX, R8, Android window APIs and this Kotlin artwork loader belong to the Android build. Shared font and JS improvements can still benefit both platforms.

## 1. DEX optimization is the first fix

The screenshot reports obfuscation at 2%, a 25% threshold, and a February 2027 deadline for this release. Treat that as the supplied console's finding, not a separately verified universal policy.

Neither baseline nor current app configuration installs/configures `expo-build-properties`. Generated Android settings default `android.enableMinifyInReleaseBuilds` and `android.enableShrinkResourcesInReleaseBuilds` to false. The APK has six DEX files, 57.38 MiB raw and 20.44 MiB ZIP-compressed. Those measurements support the configuration finding; DEX count and readable class names alone would not prove R8 was disabled.

Recommended persistent change in `apps/mobile/app.config.ts`, after installing the Expo-compatible `expo-build-properties` (installed Expo's compatibility map specifies `~57.0.7`):

```ts
[
  'expo-build-properties',
  {
    android: {
      enableMinifyInReleaseBuilds: true,
      enableShrinkResourcesInReleaseBuilds: true,
    },
  },
],
```

Additionally ensure generated release `proguardFiles` uses `getDefaultProguardFile("proguard-android-optimize.txt")`. The inspected template currently uses `proguard-android.txt`, which disables optimization. A small idempotent Expo config plugin can change this preset if the SDK-compatible build-properties plugin does not do so itself. Verify the generated file rather than assuming enabling minification also replaces this preset. Do not maintain this by hand in ignored `android/`: clean prebuild would discard it.

Review effective merged R8 rules for broad keeps and optimization exclusions. In particular, audio-api's consumer file has `-keep class com.swmansion.audioapi.** { *; }`; the local app rules also broadly retain Reanimated and TurboModule classes. These may be necessary for JNI/reflection. Do not delete vendor rules just to increase an obfuscation percentage, add blanket `-dontwarn`, or keep every class to bypass errors. Resource shrinking cannot remove Metro assets deliberately listed in generated `res/raw/keep.xml`.

Do not predict a fixed DEX file count or 12–15 MiB saving. Preserve and associate `mapping.txt` with the exact release and confirm Play receives the deobfuscation mapping. R8 does not shrink Hermes bytecode or the bulk of the native `.so` files. These changes require a new native binary; OTA JS updates cannot apply them.

References: [Android R8 setup](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization), [Expo build properties](https://docs.expo.dev/versions/latest/sdk/build-properties/).

## 2. The supplied R8 8.1.44 workaround does not fit this project

Neither baseline nor current package declares `react-native-purchases-ui`; the app uses `react-native-purchases`, with a Galaxy extension added since the baseline. Installed React Native Gradle Plugin specifies AGP 8.12.0. The quoted RevenueCat workaround concerns an older toolchain and a specific dependency-resolution failure. There is no reproduced R8 failure in this audit.

Do not pin R8 8.1.44 preemptively. First enable optimization with the SDK toolchain, inspect any actual release failure, and resolve it using compatible dependencies or narrow missing rules. A `mergeExtDexDevDebug` error is not evidence that release obfuscation is configured.

Reference: [RevenueCat installation and legacy workaround](https://www.revenuecat.com/docs/getting-started/installation/reactnative).

## 3. Measured baseline package composition

| Component | Raw bytes, MiB | ZIP-stored bytes, MiB |
| --- | ---: | ---: |
| Native libraries, all four ABIs | 164.32 | 164.32 |
| DEX, six files | 57.38 | 20.44 |
| Hermes bundle | 9.37 | 9.37 |
| res/raw, all 46 entries | 9.13 | 4.43 |
| resources.arsc | 2.00 | 2.00 |
| org/ Java resources | 1.48 | 1.27 |

Whole APK: 214,225,542 bytes = 204.30 MiB. Native arm64 libraries alone: 43.48 MiB. Other architectures: x86 45.27, x86_64 44.74, armeabi-v7a 30.83 MiB. Subtracting the other ABIs arithmetically gives approximately 83.46 MiB; this is NOT a measured device APK or download estimate.

Both baseline and current Google `production` profiles already default to AAB. `preview` uses internal distribution, which produces an APK. Current Galaxy production explicitly produces an APK. Thus changing Google production to AAB is not a newly discovered 120 MiB saving. Use Play App Bundle Explorer or bundletool device-specific APK sets for meaningful comparisons. Do not drop supported ABIs merely to make a universal artifact smaller. Native libraries are stored uncompressed in this APK; enabling legacy compression can change archive size and extraction behavior without reducing the underlying native code.

The Gemini comparison pits another app's split APK set against a universal APK. Its 25–35 MB target, fixed expected R8 reduction, and conversion from Hermes byte size to unminified JS size are not established by these measurements. Compose is not entirely supplied by the OS, and 32-bit support should not be dismissed simply as ancient phones.

Reference: [Expo Android build formats](https://docs.expo.dev/build-reference/apk/).

## 4. Font imports have a concrete, low-risk fix

`src/lib/theme/fonts.ts` selects four upright weights (400/500/600/700) from each of Inter and JetBrains Mono, plus six vendored title fonts. However the package-root entrypoints contain `require()` calls for every font variant. The old APK includes all 18 Inter and all 16 JetBrains Mono variants. The fresh current export reproduces this.

Change imports to individual weight modules, for example:

```ts
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
```

Apply the same pattern to all eight used faces. Merely using named imports from the package root, as suggested in the previous analysis, is insufficient: that is already the app's code.

There are 41 TTF files, not 46: 34 Inter/JetBrains, six local title fonts and one Material Symbols font. The remaining raw entries include sample audio and metadata. Removing the 26 unused variants accounts for exactly 6,248,876 raw bytes and 3,051,847 ZIP-compressed bytes in the baseline APK. Actual AAB download savings will differ.

Keep the six vendored title fonts: their vertical metrics are deliberately patched. Their font packages also serve as inputs to `scripts/patch-font-metrics.py`, so uninstalling those packages can break the font workflow even if runtime imports are absent.

Material Symbols (956,044 bytes) is pulled through `expo-symbols` (current source map identifies `expo-symbols/build/android/weights/regular/index.js`; Expo Router's native-tabs converter imports that package). It is not an app-authored unused icon file. Investigate its import path or tree shaking rather than deleting the TTF.

## 5. PNG and sample-asset audit

These baseline image files have no discovered app/config runtime references and no corresponding assets in the old APK or current Metro export:

| File under assets/images | Bytes |
| --- | ---: |
| icon.png | 217,425 |
| icon_old.png | 333,635 |
| logo_transparent_dark.png | 131,344 |
| logo_transparent_light.png | 130,227 |

They are candidates for deletion or relocation to design references, totaling 812,631 bytes. Expected baseline binary saving: zero. Git history retains old blobs after a normal deletion.

Keep configured files in `assets/icons`: adaptive/notification icons, iOS appearances and splash images. Android generates density-specific resources from them; the Metro asset list alone is not an inventory of native config assets.

Current source also has `shiro_dog.png` (696,970 bytes) and `elegant_black_cat.png` (1,343,086 bytes), added after v0.6.0. They are not bundled by the current export and are design references associated with vector artwork; the cat README explicitly references the PNG. SVG source poses feed generated artwork. Relocation is possible; deleting these does not reduce the measured APK.

Both sample JPEGs and the M4A are explicitly required by `src/lib/sampleEntries.ts` and present in the APK/export. They total 354,034 source bytes and support sample entries; deleting them would remove functionality. The bitmap warning names a Kotlin network loader, not any of these images. PNG recompression is therefore not the warning's fix.

## 6. Exact bitmap-warning cause

`react-native-audio-api/android/src/main/java/com/swmansion/audioapi/system/notification/PlaybackNotification.kt:465` defines `loadArtwork`. Its remote branch calls `URL(url).openConnection()` followed by `BitmapFactory.decodeStream(inputStream)` with no requested target dimensions or bitmap sampling/caching. This matches the screenshot exactly. The installed source still has it.

No application calls to audio-api playback-notification/artwork APIs were found; the app records and plays local voice memos. This makes a dependency static-analysis finding plausible, but does not prove runtime reachability or absence of memory problems. R8 may not remove it because audio-api broadly keeps its package and exposes notification APIs through native modules.

Preferred remedy: find a compatible upstream version that specifically fixes this loader, then inspect the source and release artifact. If no compatible fix exists, persist a dependency patch that uses a bounded native image loader with downsampling, caching, cancellation and appropriate IO scheduling/lifecycle management. Adding `expo-image` to React UI does not change this Kotlin implementation. Disabling foreground-service configuration alone is not proof the method disappears.

The current audio plugin disables iOS background mode but still defaults Android foreground service support on. Review that capability separately against intended background recording/playback; do not assume removing the service also strips its classes.

Reference: [Android bitmap optimization principles](https://developer.android.com/develop/ui/compose/graphics/images/optimization). The examples use Compose, but this finding is in Kotlin native notification code, not the app's React UI.

## 7. Edge-to-edge warning is largely framework-owned

Play names React Native `StatusBarModule`, `WindowUtilKt.enableEdgeToEdge`, and Material `BottomSheetDialog.onCreate`. Installed RN 0.86.0 still contains the reported status/navigation bar color and cutout calls. Some are compatibility paths for older Android versions. The screenshot is not by itself proof that the app visibly mislays out on Android 15+.

Baseline app code sets status-bar icon style/visibility, not custom status-bar colors or translucency. Current code adds `AppStatusBar` and `SystemBarAppearanceModule` for icon contrast after theme changes; this uses window-insets APIs but does not remove RN's existing deprecated code. Expo/RN versions are unchanged from v0.6.0. The app already targets SDK 36 and the generated project enables edge-to-edge.

Use compatible framework/library updates with specific fixes, and trace Material's resolved release dependency through Gradle before assigning blame to a particular sheet component. Avoid forcing an arbitrary Material version or disabling edge-to-edge. Validate sheets, modals, keyboard, image viewer, light/dark theme transitions, landscape, cutouts, gesture navigation and three-button navigation on Android 15/16 and an older supported version.

Reference: [Android edge-to-edge behavior changes](https://developer.android.com/about/versions/15/behavior-changes-15#edge-to-edge).

## 8. Native dependencies are active features

The largest arm64 library is Skia, 10.78 MiB. Baseline already uses it for live/static waveforms and backdrops; current source adds more shader/vector artwork. Removing it is a deliberate rendering migration, not removal of an unused package.

FFmpeg's four shared libraries total approximately 6.33 MiB per arm64 slice; audio-api itself adds 2.58 MiB and Oboe 0.28 MiB. The plugin supports `disableFFmpeg`, but the app's `ensureRecorder()` selects `FileFormat.M4A`. Installed `AndroidAudioRecorder.cpp` explicitly rejects non-WAV recording when FFmpeg is disabled. Its decoder also has FFmpeg-dependent paths. Do not flip this flag without replacing encoding and verifying all existing/imported memo formats.

An eventual smaller audio design might use an OS-backed recorder/player while retaining waveform analysis, seeking, interruptions and the current gain/limiter behavior. Evaluate `expo-audio` for that migration rather than treating the earlier `expo-av` recommendation as a drop-in current solution. This audit does not establish feature parity or a savings estimate for that migration.

R8 will not remove these native engines wholesale. SQLite/FTS, Reanimated, Worklets, SVG and Expo modules also implement active capabilities.

## 9. JS graph findings

The old APK contains valid Hermes bytecode, not plain unminified JS. Current export remains around 9.55 MiB. This is separate from DEX obfuscation.

The current source map includes 1,713 Lucide icon modules. Source-content totals identify investigation targets: Lucide ~1.31 MiB, RevenueCat JS hybrid mappings ~0.83 MiB, date-fns ~0.51 MiB. These are pre-transformation source bytes, not additive Hermes savings. App translations are ~0.31 MiB of source; there is no evidence here of a giant accidental JSON dataset. No app test/spec files were found in the export graph.

Use Expo Atlas and a controlled tree-shaking experiment to quantify final output. Avoid unsupported deep imports into Lucide's internals: the installed package has an exports map, and its `./icons` export is another barrel. Keep both native builds and OTA export environments consistent if experimental Metro flags are adopted. Validate side effects and third-party module assumptions on-device.

A controlled current-source export with `EXPO_UNSTABLE_TREE_SHAKING=1 EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1` also succeeded. Hermes output fell from 10,008,272 to 8,115,220 bytes (18.9% smaller; 1.81 MiB reduction). Lucide icon modules represented in the source map fell from 1,713 to 72. The export still lists all 70 assets, including the unused font variants: tree shaking alone did not fix the font packaging. This is a measured build-time result, not an on-device compatibility pass or an APK/Play download measurement. No flags were persisted in app configuration.

References: [Expo bundle analysis](https://docs.expo.dev/guides/analyzing-bundles/), [Expo tree shaking](https://docs.expo.dev/guides/tree-shaking/).

## 10. Implementation and release acceptance sequence

1. Make R8/resource shrinking/preset changes in persistent Expo config; change only font import paths in a separate reviewable change. Keep dependency migrations separate.
2. Generate Android in an isolated checkout with Google production environment settings. Verify minify/shrink flags, optimized preset and correct billing autolinking. Do not use the stale beta native directory as production evidence.
3. Build a real release AAB. Inspect R8 configuration, mapping and removed-code reports; resolve actual failures narrowly. Test release mode because dev builds do not exercise R8.
4. Confirm only eight Inter/JetBrains faces plus six title faces remain, and inspect the transitive symbol font separately. Verify every selectable title font and body weight visually.
5. Compare like-for-like device download and installed size, DEX size, Hermes size, packaged assets and ABI libraries. Retain a baseline with matching environment and device spec.
6. Exercise cold launch, all themes, sheets/keyboard, app lock, existing database and FTS, M4A recording/playback/seek/waveforms, purchases/restore, OAuth, cloud sync/import/export, reminders and OTA loading. Native/JNI/reflection regressions often appear only in optimized release builds.
7. Address the artwork loader and framework warning with source-backed upgrades or narrowly scoped patches. Reinspect the final DEX and verify Play's results on the new version. A successful build alone does not prove the warning or 25% metric is resolved.
8. Validate Galaxy separately: its profile distributes APKs and autolinks a different billing extension. AAB split-delivery conclusions apply to Google, not automatically to Samsung.

No native optimized build or device regression pass was performed during this audit, so there is no measured R8 savings or claim that Play warnings have cleared.


## Follow-up: EAS local production validation

The subsequent implementation enables release R8/resource shrinking, selects the
optimized preset through a config plugin, and switches Inter/JetBrains Mono to
per-weight imports. A direct local arm64 Gradle release build succeeded. The
export confirms 15 font assets instead of 41, removing 6,248,876 raw bytes.

A subsequent `eas build --platform android --profile production --local` check
reported three Expo Doctor failures: duplicate `expo-constants` versions, SDK 57
patch-version mismatches, and the known Hermes V1 memory regression in the
installed Expo 57.0.8 / React Native 0.86.0 combination. This is separate from the
R8/font changes. The production profile incremented remote Android versionCode
from 8 to 9 during that invocation.

Before public rollout, align the supported SDK 57 patch dependencies in a separate
change, resolve the duplicate native dependency, rerun Doctor and the release
build, and test through Play's internal track. Expo documents the memory fix in
Expo 57.0.9 / RN 0.86.2 and later; its current SDK 57 patch set includes RN 0.86.3.
Do not treat a successful Gradle build as evidence that the runtime regression is
absent. See [Expo SDK 57 known regressions](https://expo.dev/changelog/sdk-57#known-regressions).


EAS local result: the first attempt failed before R8 because GitHub DNS lookup
failed during audio-api binary downloads, leaving `libavcodec.so` unavailable.
A connectivity check and retry succeeded without an app-code workaround.
The retry incremented remote versionCode from 9 to 10. The full production-profile
build completed in 13m 37s and produced `apps/mobile/build-1789651931448.aab`
(161,210,599 bytes; this is the upload archive, not device download size).
Verified merged manifest: `dev.mehra.tackbok`, version 1.0.1 (10). The bundle
contains all four ABIs, two DEX files totaling 15,965,028 raw bytes, 15 font files,
and the embedded R8 mapping. Effective R8 configuration contains no global
`-dontoptimize`, `-dontshrink`, or `-dontobfuscate` directives. Amazon SDK stack-map
warnings were non-fatal. No Play submission or on-device testing was performed.
The Doctor issues above remain unresolved and should be handled before public
rollout. Temporary EAS build files were removed after verification; the final AAB
remains locally in the ignored build-artifact path.


## SDK 57 patch alignment and local version policy

Follow-up changes (app version 1.0.2): Expo 57.0.23, React Native 0.86.3,
Reanimated 4.5.1, Worklets 0.10.1, and the matching Expo SDK patch dependencies.
React Native now selects Hermes V1 250829098.0.17, beyond the affected versions.
Duplicate on-disk copies of Expo modules were removed; frozen-lockfile install
and Expo Doctor pass. Doctor also passes all 21 checks in the clean EAS build
workspace. No Doctor exclusions or dependency overrides were added to hide issues.

The app version is explicitly read from package.json in app.config.ts. Advancing
to 1.0.2 separates OTA compatibility from the previous native runtime under the
existing appVersion policy. Galaxy retains its store-specific runtime suffix.

`production-local` inherits `production`, explicitly uses the production EAS
environment, and disables autoIncrement. Use:

```sh
bunx eas build --platform android --profile production-local --local
```

The `production` cloud profile still auto-increments. The profile—not the local
flag—selects the increment policy. Local builds reuse the current remote version
code and should not be treated as unique store submissions.

Validation completed before native build: TypeScript passed; 53 Jest suites / 469
tests passed; 71 Bun cloud-sync tests passed; lint had zero errors and 18 warnings;
iOS production JS export passed. This does not constitute an iOS native build or
public-release approval. Release smoke-test/build results are recorded below. Physical-device audio, authenticated sync, purchases/restore and Play
internal-track validation still require evidence before public rollout approval.


### Completed native build and smoke test

The SDK-aligned local production build succeeded (version 1.0.2, versionCode 10)
without incrementing the remote version. Artifact: `build-sdk57-1.0.2.aab`,
161,349,911 bytes; two DEX files totaling 16,067,584 raw bytes; 15 fonts; embedded
R8 mapping. Release minification, resource shrinking and the optimized preset
were verified in the generated project. Archive size is not Play download size.

An initial attempt exhausted Gradle's 512 MiB Metaspace during release lint/KSP.
The persistent plugin now raises that limit to 1024 MiB, preserving other JVM
options. The retry completed successfully without disabling lint. A transient
Expo Doctor network failure was followed by a successful 21/21 rerun in the same
clean build workspace.

Device-specific APKs generated from the AAB were explicitly signed with the local
debug key for installation on the API 36 arm64 emulator. Startup, onboarding,
example journal entries and the profile sheet rendered successfully, including
fonts and icons; no fatal runtime exception was observed in the inspected logs.
This is a limited smoke test, not verification of physical-device audio, Google
OAuth, authenticated sync or billing. The first unsigned bundletool extraction
could not install; signing the test APKs resolved that tooling issue.

**Ready for internal testing; public rollout is not yet approved.** The original
bitmap-loader and framework edge-to-edge recommendations remain separate follow-ups.
No store submission was performed.

### Build-warning triage

- iOS duplicate `-lc++`: redundant linker input; non-blocking when linking succeeds.
- Expo Dev Launcher script has no declared outputs: Xcode runs it on each build.
  This affects incremental build work, not app correctness. Avoid editing generated
  Xcode files just to silence this upstream warning.
- Explicit `ios.infoPlist.CFBundleURLTypes` overrides Expo's generic `scheme` on
  iOS. The generated beta plist was checked: it contains `tackbok-beta` and the
  Google OAuth callback scheme. Production config similarly selects `tackbok`.
  This warning does not mean those schemes are missing; OAuth still needs a
  real sign-in smoke test.
- Android debug-manifest `tools:replace` with no matching declaration is redundant
  merge metadata, not a release optimization failure. Keep debug cleartext support
  needed by Metro. No maxSdkVersion conflicts is a successful informational check.
