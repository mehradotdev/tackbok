// Pulls in Expo's ambient module declarations (CSS side-effect imports, asset
// modules, etc.). Expo also generates `expo-env.d.ts` at the app root with this
// same reference, but that file is gitignored, so it is absent in a fresh clone
// and `tsc --noEmit` fails in CI without it. The reference is idempotent, so
// having it in both places is harmless.
/// <reference types="expo/types" />
