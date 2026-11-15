const fs = require('node:fs');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withProjectBuildGradle,
} = require('expo/config-plugins');

const MARKER = '// withAndroidBackgroundWork';

/**
 * Inline modules compile in the `expo` Gradle project. BackgroundExecutionModule
 * uses WorkManager, which expo-background-task already ships but keeps off that
 * project's compile classpath. Reference the same artifact and version, so the
 * APK gains no new library.
 */
function workRuntimeVersion(projectRoot) {
  const gradle = fs.readFileSync(
    path.join(
      path.dirname(
        require.resolve('expo-background-task/package.json', { paths: [projectRoot] }),
      ),
      'android/build.gradle',
    ),
    'utf8',
  );
  const match = gradle.match(/androidx\.work:work-runtime-ktx:([\w.-]+)/);
  if (!match) {
    throw new Error(
      'withAndroidBackgroundWork: expo-background-task no longer declares work-runtime-ktx.',
    );
  }
  return match[1];
}

/**
 * WorkManager declares a foreground service and FOREGROUND_SERVICE for work
 * that calls setForeground, or expedited work below API 31. Tackbok uses
 * neither (BackgroundExecutionModule enqueues expedited work only on API 31+,
 * where it is a JobScheduler job), so remove both: no foreground service at all.
 */
function withoutWorkManagerForegroundService(config) {
  return withAndroidManifest(config, (mod) => {
    const { manifest } = mod.modResults;
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    const permissions = (manifest['uses-permission'] ??= []);
    if (
      !permissions.some(
        (p) => p.$['android:name'] === 'android.permission.FOREGROUND_SERVICE',
      )
    ) {
      permissions.push({
        $: {
          'android:name': 'android.permission.FOREGROUND_SERVICE',
          'tools:node': 'remove',
        },
      });
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const services = (application.service ??= []);
    const name = 'androidx.work.impl.foreground.SystemForegroundService';
    if (!services.some((service) => service.$['android:name'] === name)) {
      services.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
    return mod;
  });
}

module.exports = function withAndroidBackgroundWork(config) {
  config = withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withAndroidBackgroundWork requires a Groovy root build.gradle.');
    }
    if (mod.modResults.contents.includes(MARKER)) return mod;
    const version = workRuntimeVersion(mod.modRequest.projectRoot);
    mod.modResults.contents += `
${MARKER}
subprojects { project ->
  if (project.name == 'expo') {
    project.plugins.withId('com.android.library') {
      project.dependencies.add('implementation', 'androidx.work:work-runtime-ktx:${version}')
    }
  }
}
`;
    return mod;
  });
  return withoutWorkManagerForegroundService(config);
};
