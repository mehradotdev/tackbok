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
