#!/usr/bin/env bash
# Link every skill in this repo into Claude Code and Codex: the Linux and macOS twin of
# link-skills.ps1's linking half. Idempotent; prints only what it changed.
#   +  linked   ~  relinked (pointed elsewhere)   -  pruned (skill gone)   !  needs a human
# A real directory where a link belongs is reported, never deleted.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v git >/dev/null && [ -e "$repo/.git" ]; then
  default=$(git -C "$repo" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null); default=${default#origin/}
  default=${default:-main}
  if branch=$(git -C "$repo" branch --show-current 2>/dev/null) && [ "$branch" != "$default" ]; then
    on="branch '$branch'"; [ -n "$branch" ] || on="a detached HEAD"
    echo "!  checkout ($repo is on $on, not '$default': every link follows it)"
  fi
fi

link() {
  local target="$1" path="$2" name="$3"
  if [ -L "$path" ]; then
    [ "$(readlink "$path")" = "$target" ] && return
    ln -sfn "$target" "$path" && echo "~  $name ($path)"
  elif [ -e "$path" ]; then
    echo "!  $name ($path is a real directory, left untouched)"
  else
    ln -s "$target" "$path" && echo "+  $name ($path)"
  fi
}

for dest in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$dest"
  for skill in "$repo"/*/SKILL.md; do
    [ -f "$skill" ] || continue
    dir=$(dirname "$skill")
    link "$dir" "$dest/$(basename "$dir")" "$(basename "$dir")"
  done
  for path in "$dest"/*; do
    [ -L "$path" ] && [ ! -e "$path" ] || continue
    case "$(readlink "$path")" in "$repo"/*) rm "$path" && echo "-  $(basename "$path") ($dest)" ;; esac
  done
done

link "$repo/workflows" "$HOME/.claude/workflows" workflows
