#!/usr/bin/env bash
# Exercises link-skills.ps1's checkout warning: every link and the imported CLAUDE.md follow whatever
# the linked checkout has checked out, so the script must say so when that checkout is off the
# default branch or behind it. Runs against a throwaway clone with -Dest and -WorkflowsPath redirected,
# so the real ~/.claude and ~/.agents folders are never touched.
#
# Requires pwsh and git on PATH; skips (not fails) without pwsh, like link-skills-claude-md.test.sh.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v pwsh >/dev/null 2>&1; then
  echo "SKIP: 'pwsh' is not on PATH -- link-skills.ps1 tests not run"
  exit 0
fi

fail=0
total=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
export USERPROFILE="$WORK/home"
export MSYS=winsymlinks:nativestrict   # Git Bash on Windows otherwise copies instead of linking
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid

check() {
  local desc="$1"
  total=$((total + 1))
  if "${@:2}"; then
    echo "PASS: $desc"
  else
    echo "FAIL: $desc"
    fail=$((fail + 1))
  fi
}

has() { printf '%s' "$1" | grep -qE "$2"; }
lacks() { ! has "$1" "$2"; }

# Each run starts from empty destinations, so a link left by an earlier case cannot pass a later one.
run() {
  rm -rf "$WORK/dest" "$WORK/workflows-link"
  CI=true pwsh -NoProfile -File "$1/link-skills.ps1" -Dest "$WORK/dest" -WorkflowsPath "$WORK/workflows-link" < /dev/null 2>&1
}

# An "origin" repo with one skill, cloned so the clone has origin/main and origin/HEAD.
git init -q -b main "$WORK/origin"
mkdir -p "$WORK/origin/demo" "$WORK/origin/workflows"
printf -- '---\nname: demo\ndescription: test\n---\n' > "$WORK/origin/demo/SKILL.md"
touch "$WORK/origin/workflows/.keep"
cp "$ROOT/link-skills.ps1" "$WORK/origin/"
git -C "$WORK/origin" add -A && git -C "$WORK/origin" commit -qm init
git clone -q "$WORK/origin" "$WORK/clone"

out="$(run "$WORK/clone")"
check "on main and current: no checkout warning" lacks "$out" '^!  checkout'
check "on main and current: the skill is still linked" has "$out" 'demo'

git -C "$WORK/clone" switch -qc feature
out="$(run "$WORK/clone")"
check "on a feature branch: warns and names the branch" has "$out" "^!  checkout.*'feature'"
check "on a feature branch: still links (a warning, not a refusal)" test -e "$WORK/dest/demo/SKILL.md"

git -C "$WORK/clone" switch -q --detach main
out="$(run "$WORK/clone")"
check "on a detached HEAD: warns" has "$out" '^!  checkout.*detached'

git -C "$WORK/clone" switch -q main
git -C "$WORK/origin" commit -q --allow-empty -m later
git -C "$WORK/clone" fetch -q
out="$(run "$WORK/clone")"
check "behind origin/main after a fetch: warns with the count" has "$out" '^!  checkout.* 1 commit behind origin/main'

git -C "$WORK/clone" switch -q feature
if ln -s "$WORK/clone" "$WORK/clone-link" 2>/dev/null && [ -L "$WORK/clone-link" ]; then
  out="$(run "$WORK/clone-link")"
  check "reached through a symlink, on a feature branch: still warns" has "$out" "^!  checkout.*'feature'"
else
  echo "SKIP: this system cannot create a symlink -- the symlinked-checkout case not run"
fi
git -C "$WORK/clone" switch -q main
git -C "$WORK/clone" merge -q --ff-only origin/main

mkdir -p "$WORK/clone/nested"
cp -r "$WORK/origin/demo" "$WORK/origin/workflows" "$WORK/origin/link-skills.ps1" "$WORK/clone/nested/"
git -C "$WORK/clone" switch -q feature
out="$(run "$WORK/clone/nested")"
check "a copy nested inside another repo: does not report that repo's branch" lacks "$out" '^!  checkout'
git -C "$WORK/clone" switch -q main

mkdir -p "$WORK/plain"
cp -r "$WORK/origin/demo" "$WORK/origin/workflows" "$WORK/origin/link-skills.ps1" "$WORK/plain/"
out="$(run "$WORK/plain")"
check "not a git checkout (a zip download): no warning and no error" lacks "$out" '^!  checkout|fatal|Exception'

mkdir -p "$WORK/broken"
cp -r "$WORK/origin/demo" "$WORK/origin/workflows" "$WORK/origin/link-skills.ps1" "$WORK/broken/"
printf 'gitdir: %s\n' "$WORK/gone" > "$WORK/broken/.git"
out="$(run "$WORK/broken")"
check "a .git that git cannot read (a moved worktree): no false warning" lacks "$out" '^!  checkout'

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
