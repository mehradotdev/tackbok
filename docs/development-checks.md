# Development checks

Use Bun at the version in the root `packageManager` field and Node.js 24 (see
`.node-version`). Install dependencies from the repository root with `bun install`;
the `prepare` script installs Husky hooks automatically.

## Local checks

- **Pre-commit:** lint-staged formats staged files and runs ESLint with safe fixes
  for staged mobile/website code, using each app's configuration. Failures block
  the commit; intentional ESLint warnings do not. lint-staged preserves unstaged
  changes and restores its backup if a task fails.
- **Commit-msg:** commitlint checks Conventional Commits, for example
  `fix(mobile): preserve journal scroll position` or `docs: explain local setup`.
  Common types include `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`,
  `build`, `style`, `perf`, and `revert`. Scopes are optional.
- Run focused tests while developing. Full tests run in CI rather than on every
  commit to keep small contributions fast. There is no pre-push hook.

From the root:

```sh
bun run format path/to/changed-file.ts
bun run format:check path/to/changed-file.ts
bun run lint
bun run typecheck
bun run test
bun run build
```

`test` runs all workspace test scripts that exist: currently mobile Jest and Bun
cloud-sync suites. The website has no test suite yet; its lint, typecheck, and
production build are checked. `build` builds the website, not native apps.

Formatting is adopted gradually: format changed files rather than the whole
repository. Build outputs, generated theme/artwork/database files, lockfiles,
environment files, and vendored skills are excluded in `.prettierignore`.

## Pull requests

GitHub Actions runs lint, typechecking, all tests, and the website build on PRs and
pushes to `main`. PRs also check the title and formatting of files changed since
the merge base. To reproduce the formatting check, commit your changes and run:

```sh
git fetch origin
bun run format:changed origin/main
```

Use a Conventional Commit title for your PR. Maintainers should squash merge and
use that title for the squash commit. CI does not require rewriting intermediate
commits. Repository merge settings and branch protection are managed separately.

## Troubleshooting

If hooks do not run, run `bun run prepare` and check `git config core.hooksPath`
(normally `.husky/_`). Git GUI clients need Bun and Node on their `PATH`; see
[Husky's startup-file guidance](https://typicode.github.io/husky/how-to.html).
On Windows, install Git for Windows and run package scripts through `bun run`.

Fix reported errors, stage the relevant files, and retry. Do not disable lint
warnings or reformat unrelated files just to make a commit. CI sets `HUSKY=0`
because hooks belong to local Git operations; quality checks still run explicitly.
