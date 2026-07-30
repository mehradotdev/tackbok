/**
 * Runs once in the Jest parent process before any test workers spawn, so the
 * env var below is inherited by every worker (and by --runInBand runs).
 *
 * EXPO_PUBLIC_USE_RN_FETCH=1 stops Expo's winter runtime from installing its
 * lazy `fetch` getter on globalThis (see expo/src/winter/runtime.native.ts).
 * In Jest that getter fires during teardown, tries to require the
 * ExpoFetchModule native module, and fails — producing "Cannot log after
 * tests are done" warnings and intermittently poisoning Jest's exit code
 * even when every test passes.
 */
module.exports = function globalSetup() {
  process.env.EXPO_PUBLIC_USE_RN_FETCH = '1';
};
