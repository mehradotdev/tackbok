const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

// The default Expo preset disables optimization. Keep the optimized preset
// through clean prebuilds; expo-build-properties controls minify/resource flags.
module.exports = function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, (mod) => {
    // SDK 57's release lint/KSP can exhaust the template's 512 MiB Metaspace.
    // Preserve heap and other JVM options while raising only this limit.
    const args = mod.modResults.find(
      (entry) => entry.type === 'property' && entry.key === 'org.gradle.jvmargs',
    );
    if (args) {
      args.value = /-XX:MaxMetaspaceSize=\S+/.test(args.value)
        ? args.value.replace(/-XX:MaxMetaspaceSize=\S+/g, '-XX:MaxMetaspaceSize=1024m')
        : `${args.value} -XX:MaxMetaspaceSize=1024m`;
    } else {
      mod.modResults.push({
        type: 'property',
        key: 'org.gradle.jvmargs',
        value: '-Xmx2048m -XX:MaxMetaspaceSize=1024m',
      });
    }
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error(
        'withAndroidReleaseOptimization requires a Groovy app build.gradle.',
      );
    }

    const preset =
      /getDefaultProguardFile\(\s*(['"])proguard-android(?:-optimize)?\.txt\1\s*\)/g;
    const contents = mod.modResults.contents;
    if (!preset.test(contents)) {
      throw new Error(
        'withAndroidReleaseOptimization could not find the default ProGuard preset. Review the Android release configuration after the Expo template change.',
      );
    }

    mod.modResults.contents = contents.replace(
      preset,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    return mod;
  });
};
