const { withProjectBuildGradle } = require('expo/config-plugins');

// React Native and Expo modules request OkHttp 4.9.2. OkHttp 4.12.1 blocks the
// compromised eMudhra intermediate CAs (October 2026) on devices whose trust
// store is not yet patched, so pin every Gradle project to it.
// shortcut: forced version, remove once React Native ships OkHttp >= 4.12.1.
const OKHTTP_VERSION = '4.12.1';
const MARKER = '// withOkHttpVersion';

module.exports = function withOkHttpVersion(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withOkHttpVersion requires a Groovy root build.gradle.');
    }
    if (mod.modResults.contents.includes(MARKER)) {
      return mod;
    }

    mod.modResults.contents += `
${MARKER}
allprojects {
  configurations.configureEach {
    resolutionStrategy.force(
      'com.squareup.okhttp3:okhttp:${OKHTTP_VERSION}',
      'com.squareup.okhttp3:okhttp-urlconnection:${OKHTTP_VERSION}'
    )
  }
}
`;
    return mod;
  });
};
