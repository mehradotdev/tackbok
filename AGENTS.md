# Repository agent instructions

## UI framework boundaries

- `apps/mobile` is an Expo React Native application. Do **not** use daisyUI in
  this app, including daisyUI components, class names, dependencies, skills, or
  web-only HTML patterns.
- For `apps/mobile`, use Uniwind and the existing primitive ui components under
  `apps/mobile/src/components/ui/`, and app-specific components under
  `apps/mobile/src/components/`. Follow React Native and Expo conventions.
- `apps/website` is the Astro website and is the only app in this repository
  that uses daisyUI. Apply daisyUI guidance only when working within
  `apps/website`.
- JSX or TSX alone does not imply daisyUI usage. Determine the target app from
  its path before selecting UI tools or conventions.
