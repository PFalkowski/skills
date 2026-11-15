#!/usr/bin/env bash
# Link every skill in this repo into Claude Code and Codex: the Linux and macOS twin of
# link-skills.ps1's linking half. Idempotent; prints only what it changed.
#   +  linked   ~  relinked (pointed elsewhere)   -  pruned (skill gone)   !  needs a human
# Anything that is not a link where a link belongs is reported, never deleted. Exits 1 when a
# link could not be made or pruned, so a SessionStart hook shows the error.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
failed=0

if command -v git >/dev/null && [ -e "$repo/.git" ]; then
  default=$(git -C "$repo" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null); default=${default#origin/}
  default=${default:-main}
  if branch=$(git -C "$repo" branch --show-current 2>/dev/null) && [ "$branch" != "$default" ]; then
    on="branch '$branch'"; [ -n "$branch" ] || on="a detached HEAD"
    echo "!  checkout ($repo is on $on, not '$default': every link follows it)"
  elif behind=$(git -C "$repo" rev-list --count "HEAD..origin/$default" 2>/dev/null) && [ "$behind" -gt 0 ]; then
    echo "!  checkout ($repo is $behind commit(s) behind origin/$default as of the last fetch: git -C $repo pull --ff-only)"
  fi
fi

link() {
  local target="$1" path="$2" name="$3"
  if [ -L "$path" ]; then
    [ "$(readlink "$path")" = "$target" ] && return
    ln -sfn "$target" "$path" && echo "~  $name ($path)"
  elif [ -e "$path" ]; then
    echo "!  $name ($path is not a link, left untouched)"
    return
  else
    ln -sn "$target" "$path" && echo "+  $name ($path)"
  fi
  [ "$(readlink "$path")" = "$target" ] || failed=1
}

for dest in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$dest" || { failed=1; continue; }
  for skill in "$repo"/*/SKILL.md; do
    [ -f "$skill" ] || continue
    dir=$(dirname "$skill")
    link "$dir" "$dest/$(basename "$dir")" "$(basename "$dir")"
  done
  for path in "$dest"/*; do
    [ -L "$path" ] && [ ! -e "$path" ] || continue
    case "$(readlink "$path")" in "$repo"/*) rm "$path" && echo "-  $(basename "$path") ($dest)"; [ ! -L "$path" ] || failed=1 ;; esac
  done
done

link "$repo/workflows" "$HOME/.claude/workflows" workflows
exit "$failed"
