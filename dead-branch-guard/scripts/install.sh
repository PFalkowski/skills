#!/usr/bin/env bash
# Installs the guard into a repo: copies pre-push into <repo>/.githooks/, pins LF for that
# directory in .gitattributes, and points core.hooksPath at it. Idempotent; the copy is versioned
# so every clone gets the same hook, and hooksPath is shared by all of a clone's worktrees.
set -euo pipefail

repo=${1:-.}
src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-push"
root=$(git -C "$repo" rev-parse --show-toplevel)

mkdir -p "$root/.githooks"
cp "$src" "$root/.githooks/pre-push"
chmod +x "$root/.githooks/pre-push"
grep -qs '^\.githooks/\*\* text eol=lf' "$root/.gitattributes" \
  || printf '\n# git runs hooks itself; a CRLF shebang fails on Windows with "bash\\r: No such file".\n.githooks/** text eol=lf\n' >> "$root/.gitattributes"
git -C "$root" config core.hooksPath .githooks
git -C "$root" update-index --add --chmod=+x .githooks/pre-push

echo "installed $root/.githooks/pre-push; core.hooksPath=.githooks"
echo "commit .githooks/ and .gitattributes; other clones run: git config core.hooksPath .githooks"
