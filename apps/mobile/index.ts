// Background tasks must be defined when the bundle loads. Android can start a
// closed app only to run one, in a headless JS runtime that renders no routes,
// so a definition imported from a layout would never run there.
import './src/lib/cloudSync/runtime/backgroundTask';
import 'expo-router/entry';
