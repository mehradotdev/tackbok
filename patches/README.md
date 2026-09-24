# React Native Skia Android density patch

`@shopify/react-native-skia@2.6.2` reads density from Android resources at startup
and caches it in its native platform context. React Native 0.86 converts layout
dimensions with `PixelUtil`, which uses `DisplayMetricsHolder` screen metrics.
If those densities differ, Skia scales all artwork incorrectly even though the
React Native canvas view fills its parent. A smaller Skia density leaves empty
strips along the right and bottom, consistent with the folded Galaxy Z TriFold
wallpaper and theme-preview report.

The patch makes Android Skia read `PixelUtil.toPixelFromDIP(1.0f)` when it needs
the scale. It addresses both different metrics at cold launch and density changes
without runtime recreation. The Java accessor is kept for JNI with `@DoNotStrip`.
iOS retains its existing density implementation.

Bun applies the patch during root dependency installation. This changes native
code: rebuild Android to test or ship it; an OTA JavaScript update is insufficient.
Reassess the patch when upgrading Skia or React Native.

Validation on the affected device is still required:

1. Cold-launch while folded and inspect Shiro, Helena, and the theme picker.
   The artwork should reach both edges of its container.
2. Fold and unfold while the app is running, then repeat with the app backgrounded.
3. Check normal phone/tablet layouts and Android display-size settings. Artwork
   should remain aligned with its container without stretching or empty strips.

Compile the changed Java and C++ from `apps/mobile/android` after beta prebuild:

```sh
./gradlew :shopify_react-native-skia:compileDebugJavaWithJavac ':shopify_react-native-skia:buildCMakeDebug[arm64-v8a]'
```
