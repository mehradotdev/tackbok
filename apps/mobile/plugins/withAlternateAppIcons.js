const fs = require('node:fs');
const path = require('node:path');
const {
  AndroidConfig,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
} = require('expo/config-plugins');

// Registers the alternate launcher icons used by src/inlineModules/AppIconModule.
// Each icon name reads its artwork from assets/icons/alternate/<lowercase name>/:
// ios.png (1024px, opaque), android-foreground.png and android-background.png
// (432px adaptive-icon layers, so one density covers every device on API 26+).

const ICON_DIR = 'assets/icons/alternate';
const DEFAULT_ALIAS = 'Default';

function withIosIcons(config, names) {
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const { projectRoot, platformProjectRoot } = mod.modRequest;
      const assets = path.join(
        platformProjectRoot,
        IOSConfig.XcodeUtils.getProjectName(projectRoot),
        'Images.xcassets',
      );
      for (const name of names) {
        const iconSet = path.join(assets, `${name}.appiconset`);
        fs.mkdirSync(iconSet, { recursive: true });
        fs.copyFileSync(
          path.join(projectRoot, ICON_DIR, name.toLowerCase(), 'ios.png'),
          path.join(iconSet, 'icon.png'),
        );
        const contents = {
          images: [
            {
              filename: 'icon.png',
              idiom: 'universal',
              platform: 'ios',
              size: '1024x1024',
            },
          ],
          info: { author: 'expo', version: 1 },
        };
        fs.writeFileSync(
          path.join(iconSet, 'Contents.json'),
          JSON.stringify(contents, null, 2),
        );
      }
      return mod;
    },
  ]);
  return withXcodeProject(config, (mod) => {
    mod.modResults.updateBuildProperty(
      'ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES',
      `"${names.join(' ')}"`,
    );
    return mod;
  });
}

function withAndroidIcons(config, names) {
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const { projectRoot, platformProjectRoot } = mod.modRequest;
      const res = path.join(platformProjectRoot, 'app/src/main/res');
      const drawables = path.join(res, 'drawable-nodpi');
      const mipmaps = path.join(res, 'mipmap-anydpi-v26');
      fs.mkdirSync(drawables, { recursive: true });
      fs.mkdirSync(mipmaps, { recursive: true });
      for (const name of names) {
        const id = name.toLowerCase();
        for (const layer of ['foreground', 'background']) {
          fs.copyFileSync(
            path.join(projectRoot, ICON_DIR, id, `android-${layer}.png`),
            path.join(drawables, `ic_launcher_${id}_${layer}.png`),
          );
        }
        // The default icon's monochrome layer keeps Android themed icons working.
        fs.writeFileSync(
          path.join(mipmaps, `ic_launcher_${id}.xml`),
          `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_${id}_background"/>
    <foreground android:drawable="@drawable/ic_launcher_${id}_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`,
        );
      }
      return mod;
    },
  ]);

  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const isLauncherFilter = (filter) =>
      filter.action?.some((a) => a.$['android:name'] === 'android.intent.action.MAIN') &&
      filter.category?.some(
        (c) => c.$['android:name'] === 'android.intent.category.LAUNCHER',
      );
    // MainActivity stays enabled for deep links; one alias at a time is the launcher entry.
    mainActivity['intent-filter'] = (mainActivity['intent-filter'] ?? []).filter(
      (filter) => !isLauncherFilter(filter),
    );

    // AppIconModule.kt resolves aliases as <package>.MainActivity<Name>.
    const aliases = [DEFAULT_ALIAS, ...names].map((name) => ({
      $: {
        'android:name': `.MainActivity${name}`,
        'android:enabled': String(name === DEFAULT_ALIAS),
        'android:exported': 'true',
        'android:targetActivity': '.MainActivity',
        ...(name === DEFAULT_ALIAS
          ? {}
          : {
              'android:icon': `@mipmap/ic_launcher_${name.toLowerCase()}`,
              'android:roundIcon': `@mipmap/ic_launcher_${name.toLowerCase()}`,
            }),
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        },
      ],
    }));
    const aliasNames = new Set(aliases.map((alias) => alias.$['android:name']));
    application['activity-alias'] = [
      ...(application['activity-alias'] ?? []).filter(
        (alias) => !aliasNames.has(alias.$['android:name']),
      ),
      ...aliases,
    ];
    return mod;
  });
}

module.exports = function withAlternateAppIcons(config, names = []) {
  if (!names.length) return config;
  return withAndroidIcons(withIosIcons(config, names), names);
};
