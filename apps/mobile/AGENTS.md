# Mobile agent instructions

## Implementation

- Follow Expo and React Native conventions. Use Uniwind (Tailwind v4) and existing
  primitives in `src/components/ui/` and app components in `src/components/`.
  Do not use daisyUI components, classes, dependencies, skills, or web-only HTML.
- Use `bun expo install <package>` for Expo/React Native packages so versions match
  the SDK. Run commands from `apps/mobile` and preserve the beta development
  identity; see [README.md](README.md) before native setup or rebuilds.
- Generated theme artifacts come from `src/lib/theme/theme-tokens.ts`; read
  [the theme guide](src/lib/theme/README.md) before changing them.

## User-facing text and localization

- Before adding or changing any user-facing text, read and follow
  [the localization policy](../../docs/localization.md). This applies to screens
  and components as well as translation files.
- Update all existing catalogs for new messages or meaning changes. Preserve typed
  message IDs, named placeholders, required plural forms, and user-written content.
- Use shared locale-aware display formatters; do not localize persisted dates,
  identifiers, or archive schemas.
- Run localization tests and typecheck as documented. Inspect longer translations,
  large text, accessibility labels, and Arabic/Hebrew RTL where affected. Report
  device verification that could not be completed.

## Verification

- `bun run lint`, `bun run typecheck`, and `bun run test` check this app.
- `test` runs Jest and the separate Bun cloud-sync integration suite. Follow the
  colocated tests and shared mock conventions in the README; use focused tests
  while iterating.
