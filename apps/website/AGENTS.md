# Website agent instructions

- Follow the existing Astro and TypeScript patterns.
- Use Tailwind CSS v4 and daisyUI for website UI; apply the repository's daisyUI
  guidance when changing components. Prefer existing utilities and semantic colors.
- Keep the website override in the root `.oxfmtrc.json`: it adds Astro formatting
  and Tailwind class sorting to the shared options.
- Run `bun run lint`, `bun run typecheck`, and `bun run build` from this directory.
  Use `bun run dev` to inspect affected pages at narrow and wide viewport sizes.
- Report any visual verification that could not be completed. Deployment is
  separate from local build verification.
