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

## Mobile localization

- Read [docs/localization.md](docs/localization.md) before adding or changing mobile
  user-facing text. It records the agreed voice, per-language register, glossary,
  regional-variant policy, and verification workflow.
- Write plain, concise, friendly, respectful language for adults. Avoid jargon,
  slang, judgment, and unnecessary idioms. Use sentence case in English; preserve
  proper names and the meaning of faith-related prompts.
- Use natural gender-neutral phrasing, including messages speaking as the user.
  If neutral wording is unnatural, use masculine forms. Do not infer gender from
  names or add a gender setting.
- Follow established conventions for address in each language and keep its
  documented register consistent. Prefer widely understood regional wording;
  ask the developer to choose a variant when a meaningful dialect choice cannot
  be avoided. Do not guess or automatically create more regional catalogs.
- Use recognizable transliterations of Tackbok where appropriate; otherwise keep
  Tackbok, including in Latin-script languages. Preserve third-party brand names.
- Use stable, descriptive, typed message identifiers independent of English copy.
  Translate complete messages; never concatenate fragments or build keys from
  translated labels. Give distinct meanings separate identifiers even when the
  English wording is identical.
- Update all six existing catalogs when changing meaning or adding messages.
  Use numeric `count` values with i18next plural forms; supply every category
  required by the language. Preserve named interpolation parameters and provide
  context for ambiguous messages. Never pass user-written journal content to `t`.
- Use shared locale-aware display formatters. Respect device regional/time
  preferences and explicit user settings. Keep persisted dates, IDs, archive
  schemas, and other machine-readable values unchanged.
- Missing translations fall back to readable English. Automated checks are
  required; fluent-speaker review is welcome but does not block a release.
  Correct reported language issues in subsequent updates.
- Run the localization tests and typecheck after changes. Inspect affected UI for
  longer translations, large text, accessibility labels, and Arabic/Hebrew RTL.
  Report any device verification that could not be completed.
