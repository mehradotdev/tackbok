# Tackbok Website

The static Tackbok website is built with Astro, TypeScript, Tailwind CSS v4, and daisyUI.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup and the PR workflow, and
[development checks](../../docs/development-checks.md) for hooks and CI. Install
dependencies with `bun install --frozen-lockfile` from the repository root.

## Development

From `apps/website` (or use `bun run dev` from the repository root):

```sh
bun run dev
```

## Checks

```sh
bun run lint
bun run typecheck
bun run build
```
