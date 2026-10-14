# where.bash — sourced from ~/.bashrc on the host and in every dev container.
#
# Host and container shells otherwise look the same, and each side runs its own Claude
# install with its own session list, so "my sessions are gone" usually means "wrong side".
# Every prompt says which side, which container, which repo and branch, and sets the
# terminal title — tmux shows that title even when the shell is behind `docker exec`.

[ -n "${PS1:-}" ] || return 0

if [ -n "${DEV_CONTAINER:-}" ] || [ -f /.dockerenv ]; then
  __where_side="🐳 ${DEV_CONTAINER:-$(hostname)}"
  __where_side="${__where_side/dev_/}"
  __where_tag=$'\[\e[1;30;46m\]'" ${__where_side} "$'\[\e[0m\]'
else
  __where_side="HOST $(hostname)"
  __where_tag=$'\[\e[1;30;43m\]'" ${__where_side} "$'\[\e[0m\]'
fi

__where_git() {
  local top branch
  top="$(git rev-parse --show-toplevel 2>/dev/null)" || return 0
  branch="$(git symbolic-ref --short -q HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)"
  case "$top" in */.claude/worktrees/*) branch="$branch · wt ${top##*/}" ;; esac
  printf ' (%s)' "$branch"
}

# The branch goes in by reference, not by value: PS1 is expanded again at display time,
# so a branch named `$(...)` pasted into it would run.
__where_prompt() {
  __where_branch="$(__where_git)"
  printf '\e]2;%s · %s\a' "$__where_side" "${PWD/#$HOME/\~}"
}
PS1="${__where_tag} "$'\\[\e[1;34m\\]\\w\\[\e[0;35m\\]${__where_branch}\\[\e[0m\\]\n\\$ ' 
PROMPT_COMMAND="__where_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"

where() {
  local cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}" jobs=0
  [ -d "$cfg/jobs" ] && jobs=$(find "$cfg/jobs" -mindepth 1 -maxdepth 1 -type d | wc -l)
  echo "side:    $__where_side"
  if [ -n "${TMUX:-}" ]; then
    echo "tmux:    $(tmux display-message -p '#S:#I #W')"
  elif [ -n "${DEV_TMUX:-}" ]; then
    echo "tmux:    $DEV_TMUX (outside the container)"
  else
    echo "tmux:    none — this shell dies with the connection"
  fi
  echo "dir:     $PWD$(__where_git)"
  echo "claude:  $cfg ($jobs agent jobs)"
}

# Agents belong in containers; the host install is for diagnosing the box itself. Warn,
# never block — a broken container is exactly when the host session is needed.
if [ -z "${DEV_CONTAINER:-}" ] && [ ! -f /.dockerenv ]; then
  claude() {
    printf '\e[1;30;43m ⚠ HOST \e[0m \e[33mThis is the host Claude install — its sessions are not the\e[0m\n' >&2
    printf '\e[33m         containers'"'"' list. For agent work: cd into a repo, run dev, then claude.\e[0m\n' >&2
    command claude "$@"
  }
fi
