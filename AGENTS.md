# Repository agent instructions

## Scope and guidance

- This is a Bun workspace monorepo: `apps/mobile` is the Expo React Native app;
  `apps/website` is the Astro website. Choose scope from the task and file paths.
- Before changing an app, read its scoped instructions:
  [mobile](apps/mobile/AGENTS.md) or [website](apps/website/AGENTS.md), including
  when starting from the repository root.
- **Never use daisyUI or web-only HTML patterns in mobile.** daisyUI is website-only;
  JSX/TSX alone does not determine the UI framework.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and PR workflow and
  [development checks](docs/development-checks.md) for hooks and CI.

## Shared conventions

- Use Bun to install dependencies and run scripts. Install from the root and keep
  the hoisted layout in `bunfig.toml`; add dependencies in the owning workspace.
- Keep changes localized. Avoid unrelated refactors, mass formatting, and changes
  to vendored skills under `.agents/skills/`.
- Prefer inferred or explicit useful types; avoid unnecessary `any` and `as any`.
- Run relevant checks and report failures or verification you could not complete.
  Preserve intentional ESLint warnings; do not weaken rules to hide failures.
- Use the PR template and Conventional Commit titles. Do not deploy or publish
  releases unless the task explicitly includes that work.

## Ponytail guidance

The rules below are adapted from [Ponytail](https://github.com/dietrichgebert/ponytail)'s
[compact agent guidance](https://github.com/dietrichgebert/ponytail/blob/main/AGENTS.md).
The repository and scoped app conventions still apply. Ponytail's plugin commands
and hooks require a separate installation.

- Understand the affected flow before editing. Find callers and related tests,
  fixtures, configuration, and exports; account for compatibility and data risks.
- Choose the smallest complete solution. First consider whether new code is
  needed, then reuse project code, standard library or platform capabilities, and
  installed dependencies, in that order. Prefer established project components
  and patterns, and avoid adding a dependency for a small amount of simple code.
  For vague requests, implement the smallest version that fulfills the core need.
  Between equally small solutions, prefer the one that handles edge cases correctly.
- Complete all required changes across affected callers and supporting files.
  Avoid speculative features, abstractions, wrappers, and configuration. Favor
  readable code over clever compression, and preserve the existing architecture.
- For bug fixes, use `rg` to find callers and address the shared root cause.
- Never sacrifice trust-boundary validation, error handling that prevents data
  loss, security, accessibility, required platform behavior, or requested
  functionality to reduce code. Preserve validation and error handling in moved code.
- Cover new non-trivial logic with a focused test or self-check; trivial changes
  need no new tests. Record a deliberate limitation with
  `shortcut: <the limit>, <when to upgrade>` when a code comment is useful.
- In the final response, briefly identify omitted work, checks not run, and any
  material remaining risk.
