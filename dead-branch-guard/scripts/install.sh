#!/usr/bin/env bash
# Installs the guard into a repo: copies pre-push into <repo>/.githooks/, pins LF for that
# directory in .gitattributes, and points core.hooksPath at it with an ABSOLUTE path — a relative
# one resolves against each worktree's own top level, so a worktree branched before .githooks/
# existed would silently run no hook. Idempotent; the copy is versioned so every clone gets the
# same hook, and hooksPath is shared by all of a clone's worktrees.
set -euo pipefail

repo=${1:-.}
src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-push"
root=$(git -C "$repo" rev-parse --show-toplevel)

mkdir -p "$root/.githooks"
cp "$src" "$root/.githooks/pre-push"
chmod +x "$root/.githooks/pre-push"
grep -qs '^\.githooks/\*\* text eol=lf' "$root/.gitattributes" \
  || printf '\n# git runs hooks itself; a CRLF shebang fails on Windows with "bash\\r: No such file".\n.githooks/** text eol=lf\n' >> "$root/.gitattributes"
git -C "$root" config core.hooksPath "$root/.githooks"
git -C "$root" update-index --add --chmod=+x .githooks/pre-push

echo "installed $root/.githooks/pre-push; core.hooksPath=$root/.githooks"
echo "commit .githooks/ and .gitattributes; other clones run, from their main checkout:"
echo '  git config core.hooksPath "$(git rev-parse --show-toplevel)/.githooks"'
