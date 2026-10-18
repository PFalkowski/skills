#!/usr/bin/env bash
# skills-sync — fast-forward the skills clone and give every skill in it one link.
#
#   SKILLS_DIR  the clone, tracking main          (default ~/.local/share/skills)
#   SKILLS_LINKS  where Claude Code looks for skills (default ~/.claude/skills)
#
# Runs inside a dev container, from the SessionStart hook that 80-skills.sh installs, so a
# skill merged to main reaches the next session without anyone remembering to update.
# Links point at a clone of its own, never at a working checkout: a checkout sits on
# whatever branch someone last switched to, and every container would follow it there.
set -uo pipefail

SKILLS_DIR="${SKILLS_DIR:-$HOME/.local/share/skills}"
SKILLS_LINKS="${SKILLS_LINKS:-$HOME/.claude/skills}"
[ -d "$SKILLS_DIR/.git" ] || { echo "no clone at $SKILLS_DIR — run 80-skills.sh" >&2; exit 1; }

# Every session start fires this; two concurrent pulls fight over .git/index.lock. mkdir is
# the atomic test-and-set that is always there (the image has no flock).
lock="$SKILLS_DIR/.git/skills-sync.lock"
if ! mkdir "$lock" 2>/dev/null; then
  # A lock older than ten minutes is from a run that was killed, not one still pulling.
  [ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ] || exit 0
  rmdir "$lock" 2>/dev/null; mkdir "$lock" 2>/dev/null || exit 0
fi
trap 'rmdir "$lock" 2>/dev/null' EXIT

# --ff-only: a clone nobody edits never needs a merge, and if one is somehow needed the
# links keep pointing at the last good tree instead of a conflicted one.
GIT_TERMINAL_PROMPT=0 git -C "$SKILLS_DIR" pull --ff-only -q || echo "pull failed; linking what is there" >&2

mkdir -p "$SKILLS_LINKS"
for skill in "$SKILLS_DIR"/*/SKILL.md; do
  [ -f "$skill" ] || continue
  dir="$(dirname "$skill")"; link="$SKILLS_LINKS/$(basename "$dir")"
  if [ -L "$link" ]; then
    [ "$(readlink "$link")" = "$dir" ] || ln -sfn "$dir" "$link"
  elif [ -e "$link" ]; then
    echo "kept $link: a real directory, not a link — yours, not replaced" >&2
  else
    ln -s "$dir" "$link"
  fi
done

# A skill removed from main leaves a dangling link behind; only ours are swept.
for link in "$SKILLS_LINKS"/*; do
  [ -L "$link" ] || continue
  case "$(readlink "$link")" in "$SKILLS_DIR"/*) [ -e "$link" ] || rm -f "$link" ;; esac
done
