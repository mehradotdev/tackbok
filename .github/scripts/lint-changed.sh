#!/usr/bin/env bash
# Lints the current workspace: every file when SCOPE=all, otherwise only the
# files this PR adds or modifies. Typechecking still covers the whole workspace,
# which catches most cross-file breakage a changed-files lint can miss.
set -euo pipefail

if [[ "$SCOPE" == 'all' ]]; then
  exec bun run lint
fi

files=()
# NUL-separated so Git doesn't quote or escape unusual paths.
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(git diff --name-only -z --relative --no-renames --diff-filter=d \
  "$BASE_SHA...HEAD" -- '*.js' '*.jsx' '*.ts' '*.tsx' '*.cjs' '*.mjs' '*.astro')

if [[ ${#files[@]} -eq 0 ]]; then
  echo 'No changed files to lint.'
  exit 0
fi

printf 'Linting %d changed file(s).\n' "${#files[@]}"
bunx oxlint --report-unused-disable-directives --no-error-on-unmatched-pattern "${files[@]}"
bunx eslint --no-warn-ignored "${files[@]}"
