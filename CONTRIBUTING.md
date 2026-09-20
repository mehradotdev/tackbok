# Contributing to Tackbok

Thanks for helping improve Tackbok. Small fixes, documentation, translations,
reproducible bug reports, and accessibility improvements are all welcome.
Keep each PR focused on one change so it is easy to review.

## Find a place to start

- Browse [good first issues](https://github.com/mehradotdev/tackbok/labels/good%20first%20issue)
  and [help wanted](https://github.com/mehradotdev/tackbok/labels/help%20wanted).
- Use [issue forms](https://github.com/mehradotdev/tackbok/issues/new/choose) for bugs
  and concrete feature requests. Check existing issues first.
- Use [Discussions](https://github.com/mehradotdev/tackbok/discussions) for questions,
  early ideas, and things you have made with Tackbok. Discuss larger changes before
  investing in an implementation; small fixes do not need a separate proposal.

Be respectful, assume good intent, and give specific, constructive feedback.
Use sample journal entries in reports and screenshots; do not share personal
journal content, credentials, or private backups.

## Set up only what you need

Documentation and source changes do not require an Expo account, paid services,
Android Studio, or Xcode. You can run the automated checks and website locally
without mobile build tools.

1. Install Node.js 24 (see `.node-version`), Git, and the Bun version recorded in
   the root `package.json` (`packageManager`). Windows contributors should use
   Git for Windows. Node is still needed by Expo, Jest, and other tooling.
2. Fork the repository and clone your fork:

   ```sh
   git clone https://github.com/YOUR_USERNAME/tackbok.git
   cd tackbok
   bun install --frozen-lockfile
   git switch -c fix/short-description
   ```

   Install from the root; `bunfig.toml` configures the hoisted workspace layout.
   The install also enables the local Git hooks.

| Path                         | Contents / next step                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| `apps/mobile`                | Expo React Native app; [native setup and testing](apps/mobile/README.md) |
| `apps/website`               | Astro website; [website commands](apps/website/README.md)                |
| `docs/localization.md`       | Required policy for changes to mobile user-facing text                   |
| `docs/development-checks.md` | Hooks, CI, formatting, commit conventions, troubleshooting               |

For website work, run `bun run dev` from the root and open
`http://localhost:4321`.

To run the mobile app, follow its README to install Android tooling or Xcode
(macOS). Tackbok uses native modules and needs a development build; Expo Go is
not sufficient. Run `bun run android` or `bun run ios` from `apps/mobile`, then
`bun run start` for subsequent Metro sessions. These scripts select the beta app
identity, which can coexist with the store app. Native changes require rebuilding.

### Optional services

Core local journaling and automated checks do not require production credentials.
Google Drive sign-in/sync and support purchases need their own service setup for
end-to-end testing:

- Google OAuth client configuration is in `apps/mobile/app.config.ts`. A fork's
  package identity, signing certificate, and OAuth clients must match; do not
  assume the bundled clients work with a differently signed build.
- Local beta purchases use `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` in
  `apps/mobile/.env.local`. Without it, purchase setup reports a configuration
  error; this is not required for unrelated contributions. See the mobile README
  for store-specific configuration when working on purchases.

Do not commit `.env.local` or private credentials. Do not publish builds or OTA
updates as part of ordinary contribution testing.

## Make and check your change

Use existing patterns and keep unrelated refactors, dependency updates, and
formatting out of the PR. Mobile uses Uniwind and the existing React Native UI
components; daisyUI belongs only to the website.

Install dependencies in the workspace that needs them. For Expo-compatible mobile
packages, use `bun expo install <package>` from `apps/mobile`; use `bun add` for
other packages and `bun add -d` for development tools.

From the repository root:

```sh
bun run lint
bun run typecheck
bun run test
bun run build
```

Tests currently include the mobile Jest suite and Bun cloud-sync integration
suite. The website is covered by lint, typecheck, and build checks. No emulator or
service account is needed for these commands. For a focused mobile test:

```sh
cd apps/mobile
bun run test:jest src/lib/backupExport/utils.test.ts --runInBand --no-watchman
```

Add or update tests when behavior changes. For mobile text changes, read
[the localization guide](docs/localization.md), update all existing catalogs, and
run its checks. Report device/simulator coverage, including accessibility and RTL
where relevant, and clearly state anything you could not verify.

Pre-commit hooks format and lint staged files only; lint errors block commits,
but existing warnings do not. Run focused tests yourself before committing.
Full checks run in CI. See [development checks](docs/development-checks.md) for
formatting commands and hook troubleshooting.

## Open a pull request

1. Use a Conventional Commit, such as `fix(mobile): preserve journal scroll position`
   or `docs: clarify local setup`.
2. Push your branch and open a PR against `main` using the PR template.
3. Give the PR a conventional title, link the issue, describe the resulting
   behavior, and list the checks you ran. Include screenshots for visual changes
   when practical; documentation-only changes do not need them.
4. Respond to review and keep the PR focused. Maintainers should squash merge
   using the PR title; CI does not require rewriting every intermediate commit.

For maintainers: apply `good first issue` only to small, well-described tasks with
clear acceptance criteria. Use `help wanted` for work that is ready for outside
contributions, and `bug`, `enhancement`, or `documentation` to describe the work.

Contributions are covered by the repository's [Apache-2.0 license](LICENSE).
