# Tackbok Mobile App

This is the mobile app for Tackbok ([tackbok.org](https://tackbok.org)), built with React Native, Expo, and styled with [Uniwind](https://docs.uniwind.dev/) (Tailwind CSS v4).

## 🚀 Getting Started

### Prerequisites

- Node.js
- [Bun](https://bun.sh/) (This project uses Bun as its package manager)

### Installation

Install dependencies using Bun:

```sh
bun install
```

### Running Locally

Start the development server:

```sh
bun run start
```

_(Or use `bun run ios` / `bun run android` to launch directly in a simulator/emulator)_

### App variants (Beta vs. Production)

Local development builds use a separate **beta** app identity so they install side by side with the store app:

| | Production | Beta (local dev, EAS `development`) |
| --- | --- | --- |
| Display name | Tackbok | Tackbok (Beta) |
| Android package / iOS bundle ID | `dev.mehra.tackbok` | `dev.mehra.tackbok.beta` |
| Deep-link scheme | `tackbok` | `tackbok-beta` |

The variant is selected by the `APP_VARIANT=beta` environment variable in [app.config.ts](app.config.ts). The `start`/`android`/`ios` scripts and the EAS `development` profile set it for you. Preview and production builds set nothing and keep the store identity — never change that.

**Important:** the display name and package/bundle ID are stamped into the native `android/`/`ios/` projects when *prebuild* runs, not at `expo start` time. If you regenerate the native projects manually, always go through the script — a bare `npx expo prebuild` would bake the production identity into your local build:

```sh
bun run prebuild   # = APP_VARIANT=beta expo prebuild --clean
```

Run it after changing `app.config.ts`, config plugins, or native dependencies, then rebuild with `bun run android` / `bun run ios`.

The `APP_VARIANT=beta` prefix in these scripts works on Windows too: `bun run` executes scripts with Bun's cross-platform shell, which supports Unix-style env-var assignments natively — no `cross-env` needed. Just always run scripts through `bun run`, not `npm run`/`yarn`.

### Windows Android Setup

Windows needs a couple of extra setup steps for this Expo/React Native app.

1. Enable Windows Developer Mode.
   - Open **Settings > System > Advanced > For developers**.
   - Turn **Developer Mode** on.
   - This lets Expo create the symlinks it needs for inline native modules.

2. Install dependencies from the repository root with Bun's hoisted linker.

```powershell
cd D:\proj\tackbok
bun install
```

The root `bunfig.toml` must keep this setting:

```toml
[install]
linker = "hoisted"
```

React Native's Android native build tools can fail on Windows when packages resolve through long `.bun` paths. The hoisted linker keeps native package paths short and predictable.

3. Check the generated Expo inline-modules property after prebuild.

Regenerate native projects only via `bun run prebuild` (never bare `npx expo prebuild` — see the App variants section above; it would bake the production identity into your local build). Expo may regenerate `apps/mobile/android/gradle.properties` with this value:

```properties
expo.inlineModules.watchedDirectories=["src/inlineModules"]
```

On Windows, that can be passed to Node as invalid JSON because the quotes are stripped. After running `bun run prebuild`, make sure the line is escaped like this before running Android:

```properties
expo.inlineModules.watchedDirectories=[\\"src/inlineModules\\"]
```

4. Run Android from the mobile app:

```powershell
cd D:\proj\tackbok\apps\mobile
bun run android
```

If the build still fails while creating symlinks or writing native build files, try running the same command from an Administrator PowerShell window.

## Testing

Run the mobile Jest suite with Bun:

```sh
bun run test:jest
```

For a focused slice while iterating on one helper or feature, prefer running a single file:

```sh
bun run test:jest src/lib/backupExport/utils.test.ts --runInBand
```

Testing conventions in this app:

- Keep test files colocated with the code they verify, using the existing `.test.ts` pattern.
- Use shared manual mocks in `apps/mobile/__mocks__` for reusable native-module mocks such as `react-native` and `expo-file-system`.
- Use inline `jest.mock(..., factory)` inside a test file only when that suite needs a narrower or custom module shape that should not affect other suites.
- When a test uses the shared manual mocks, call `jest.mock('react-native')` or `jest.mock('expo-file-system')` without an inline factory and configure the exposed mock state in the test.

## 📦 Building & Generating APKs

To build the app for production, you can use EAS Build:

```sh
bunx eas build -p android --profile production
```

### Publishing OTA updates

EAS Update is configured with isolated `preview` and `production` channels. The
runtime version uses the `appVersion` policy, so all builds and updates with the
same app `version` belong to the same OTA compatibility group.

Changing the runtime policy only affects new binaries. Ship a new production
build before publishing an `appVersion`-based update; existing fingerprint-based
builds remain on their original runtime and will not receive that update.

Before publishing, confirm that the change only affects JavaScript or assets.
Adding or updating native dependencies, changing config plugins, permissions, or
native app configuration, and upgrading Expo or React Native require a new EAS
build.

Publish OTA changes to preview first:

```sh
bunx eas update --channel preview --auto
```

After verifying that update with a preview build, promote the same update group to production:

```sh
bunx eas update:republish --destination-channel production --group <update-group-id>
```

Use `bunx eas update --channel production --auto` only when intentionally publishing directly to production. Native dependency or app-config changes require a new EAS build; only JavaScript and asset changes can be delivered OTA.

#### Version and store-build cadence

- Do not increment the app `version` for routine JavaScript or asset-only OTA
  updates.
- Increment the app `version` whenever a native change requires a new production
  store binary or when intentionally starting a new OTA compatibility group. EAS
  can continue incrementing the iOS build number and Android version code
  independently.
- There is no required calendar cadence for a new store version. In addition to
  native changes, consider a maintenance store build every 3–6 months, or after a
  substantial set of stable OTA updates, so fresh and offline installs start from
  a reasonably current embedded bundle.
- Bump the app `version` for a maintenance store build when it should start a new
  OTA compatibility group. Without that bump, the build remains in the existing
  runtime group. Keep the previous release commit available and backport critical
  fixes while that version still has a meaningful install base.
- Keep backend changes compatible with the embedded bundle in supported store
  versions. A fresh or offline install can run that bundle before downloading its
  latest OTA update.
- For support diagnostics, Settings shows both the native app/build version and
  the currently running update date and short update ID. The **Check for updates**
  action is the authoritative way to confirm that the device has the latest
  compatible update.

### Creating a Universal APK from an AAB File

If you have an Android App Bundle (`.aab` file) generated by EAS or your local build and want to install it on a device directly, you can convert it to a Universal APK using `bundletool`.

**Prerequisites:**

- [bundletool](https://developer.android.com/studio/command-line/bundletool) installed (e.g., `brew install bundletool` on macOS)
- Your keystore `.jks` file and passwords.

**1. Generate the `.apks` archive:**

Run the `bundletool build-apks` command, passing in your keystore and passwords. The `--mode=universal` flag ensures it builds a single universal APK rather than a set of device-specific splits.

```bash
bundletool build-apks \
  --bundle=<your-app-bundle>.aab \
  --output=tackbok-universal.apks \
  --mode=universal \
  --ks=<path-to-keystore>.jks \
  --ks-pass=pass:<keystore-password> \
  --ks-key-alias=<key-alias> \
  --key-pass=pass:<key-password>
```

_(Note: Replace the placeholder `<...>` values with your actual filename and credentials)_

**2. Extract the Universal APK:**

The `tackbok-universal.apks` file generated in the previous step is a `.zip` file containing the `universal.apk`. You can extract it using either of these methods:

- **Terminal:** Run `unzip -p tackbok-universal.apks universal.apk > tackbok-universal.apk`
- **File Explorer (OS):** Rename the file extension from `.apks` to `.zip`, double-click to unzip it, and inside the extracted folder you will find `universal.apk` and `toc.pb`. The `universal.apk` is your final installable APK.
