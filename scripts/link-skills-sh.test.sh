#!/usr/bin/env bash
# Exercises link-skills.sh, the Linux and macOS twin of link-skills.ps1, against a throwaway copy
# of a skills repo with HOME redirected, so the real ~/.claude and ~/.agents are never touched.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0
total=0

check() {
  local desc="$1"
  total=$((total + 1))
  if "${@:2}"; then echo "PASS: $desc"; else echo "FAIL: $desc"; fail=$((fail + 1)); fi
}
links_to() { [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; }
has() { printf '%s' "$1" | grep -qE "$2"; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
REPO="$WORK/repo"
export HOME="$WORK/home"
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid

mkdir -p "$REPO/alpha" "$REPO/beta" "$REPO/workflows" "$REPO/docs" "$HOME/.claude/skills/kept" "$HOME/.agents/skills"
cp "$ROOT/link-skills.sh" "$REPO/"
touch "$REPO/alpha/SKILL.md" "$REPO/beta/SKILL.md"
ln -s "$REPO/gone" "$HOME/.claude/skills/gone"
ln -s "$WORK/elsewhere" "$HOME/.claude/skills/foreign"
ln -s "$WORK/old-alpha" "$HOME/.agents/skills/alpha"
mkdir "$HOME/.claude/skills/beta"

out=$(bash "$REPO/link-skills.sh" 2>&1)
code=$?

check "exits 0" [ "$code" -eq 0 ]
check "links a skill into ~/.claude/skills" links_to "$HOME/.claude/skills/alpha" "$REPO/alpha"
check "links a skill into ~/.agents/skills" links_to "$HOME/.agents/skills/beta" "$REPO/beta"
check "replaces a link with the wrong target" links_to "$HOME/.agents/skills/alpha" "$REPO/alpha"
check "leaves a real directory in place" eval '[ -d "$HOME/.claude/skills/beta" ] && [ ! -L "$HOME/.claude/skills/beta" ]'
check "warns about the real directory" has "$out" '^!  beta '
check "skips a folder without SKILL.md" eval '[ ! -e "$HOME/.claude/skills/docs" ]'
check "prunes a dangling link into the repo" eval '[ ! -L "$HOME/.claude/skills/gone" ]'
check "keeps a dangling link pointing elsewhere" eval '[ -L "$HOME/.claude/skills/foreign" ]'
check "keeps an unrelated directory" eval '[ -d "$HOME/.claude/skills/kept" ]'
check "links workflows" links_to "$HOME/.claude/workflows" "$REPO/workflows"

again=$(bash "$REPO/link-skills.sh" 2>&1 | grep -v '^!')
check "a second run changes nothing and prints nothing" [ -z "$again" ]

git -C "$REPO" init -q -b main && git -C "$REPO" commit -q --allow-empty -m init && git -C "$REPO" switch -q -c topic
check "warns when the checkout is off main" has "$(bash "$REPO/link-skills.sh" 2>&1)" "on branch 'topic'"

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
