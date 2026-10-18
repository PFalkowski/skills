#!/usr/bin/env bash
# Runs skills-sync against a throwaway origin, clone and links directory.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC="$HERE/skills-sync.sh"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
export SKILLS_DIR="$T/clone" SKILLS_LINKS="$T/links"
g() { git -c user.name=t -c user.email=t@t -c init.defaultBranch=main "$@"; }

g init -q "$T/origin"
add_skill() { mkdir -p "$T/origin/$1"; echo "name: $1" > "$T/origin/$1/SKILL.md"; }
add_skill alpha; add_skill beta; mkdir -p "$T/origin/scripts"; touch "$T/origin/scripts/x"
g -C "$T/origin" add -A; g -C "$T/origin" commit -qm one
g clone -q "$T/origin" "$SKILLS_DIR"

mkdir -p "$SKILLS_LINKS/mine" "$T/elsewhere/old"
ln -s "$T/elsewhere/old" "$SKILLS_LINKS/beta"         # points at a working checkout
ln -s "$T/elsewhere/gone" "$SKILLS_LINKS/foreign"     # dangling, but not ours

fail=0
check() { if eval "$2"; then :; else echo "FAIL: $1"; fail=$((fail + 1)); fi; }

bash "$SYNC" 2>/dev/null
check "a new skill is linked"                '[ "$(readlink "$SKILLS_LINKS/alpha")" = "$SKILLS_DIR/alpha" ]'
check "a link into a checkout is re-pointed" '[ "$(readlink "$SKILLS_LINKS/beta")" = "$SKILLS_DIR/beta" ]'
check "a directory without SKILL.md is not"  '[ ! -e "$SKILLS_LINKS/scripts" ]'
check "a real directory is left alone"       '[ -d "$SKILLS_LINKS/mine" ] && [ ! -L "$SKILLS_LINKS/mine" ]'

add_skill gamma; g -C "$T/origin" rm -rq alpha; g -C "$T/origin" add -A; g -C "$T/origin" commit -qm two
bash "$SYNC" 2>/dev/null
check "a skill merged since is pulled and linked" '[ -f "$SKILLS_LINKS/gamma/SKILL.md" ]'
check "a skill removed from main is unlinked"     '[ ! -L "$SKILLS_LINKS/alpha" ]'
check "a dangling link that is not ours stays"    '[ -L "$SKILLS_LINKS/foreign" ]'

mkdir "$SKILLS_DIR/.git/skills-sync.lock"
add_skill delta; g -C "$T/origin" add -A; g -C "$T/origin" commit -qm three
bash "$SYNC" 2>/dev/null
check "a fresh lock means another run is busy" '[ ! -e "$SKILLS_LINKS/delta" ]'
touch -d '20 minutes ago' "$SKILLS_DIR/.git/skills-sync.lock"
bash "$SYNC" 2>/dev/null
check "a stale lock is taken over"             '[ -L "$SKILLS_LINKS/delta" ]'
check "the lock is released"                   '[ ! -e "$SKILLS_DIR/.git/skills-sync.lock" ]'

echo "skills-sync: $((10 - fail))/10 passed"
[ "$fail" -eq 0 ]
