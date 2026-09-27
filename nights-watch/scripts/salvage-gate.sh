#!/usr/bin/env bash
# The guards of a nights-watch salvage (SALVAGE.md), in code so no model decides when a destructive
# step is safe. Run from the root of the repository that owns the worktrees.
#   preflight  <worktree>          exit 0 when salvage may touch it; else prints the refusal, exit 1
#   secrets    <worktree>          prints uncommitted, untracked or ignored files that look secret
#   push-check <dir> <ref>         exit 0 when no commit of <ref> that no remote holds looks secret
#   discard    <worktree> <pr-url> removes the worktree and its local branch, only once every commit
#                                  is on the pull request's branch and nothing else is left in it
set -uo pipefail

# The folders the whats-next board treats as disposable build output: recreated by a build,
# restore or test run. Anything else ignored is somebody's work.
BUILD_OUTPUT='bin|obj|\.vs|node_modules|coverage|__pycache__|TestResults|_preview|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.gradle|\.next|\.nuxt|\.parcel-cache|\.turbo'
SECRET_NAME='(^|/)(appsettings[^/]*\.json|[^/]*settings\.local\.json|\.env(\.[^/]*)?|[^/]*\.(pem|key|pfx|p12|jks|keystore|kdbx|tfvars|publishsettings)|id_(rsa|dsa|ecdsa|ed25519)[^/]*|\.npmrc|\.netrc|\.pypirc|secrets?\.[^/]*|credentials(\.[^/]*)?)$'
SECRET_TEXT='-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-(ant|proj)-[A-Za-z0-9_-]{20,}|(Password|Pwd|AccountKey|SharedAccessKey)=[^;"[:space:]]{6,}'

refuse() { echo "refused: $1"; exit 1; }

norm() {
  local p=$1
  command -v cygpath >/dev/null 2>&1 && p=$(cygpath -m "$p")
  printf '%s' "${p%/}" | tr '[:upper:]' '[:lower:]'
}

under() { [ "$1" = "$2" ] || [[ "$1" == "$2"/* ]]; }

preflight() {
  local wt=$1 w top gitdir common path cwd op
  [ -d "$wt" ] || refuse "not a directory"
  w=$(norm "$wt")
  top=$(git -C "$wt" rev-parse --show-toplevel 2>/dev/null) || refuse "not a git worktree"
  [ "$(norm "$top")" = "$w" ] || refuse "not the top folder of a worktree"
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || refuse "not run from a repository"
  [ "$(norm "$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir)")" = "$(norm "$common")" ] \
    || refuse "a worktree of another repository"
  gitdir=$(git -C "$wt" rev-parse --path-format=absolute --git-dir)
  [ "$(norm "$gitdir")" != "$(norm "$common")" ] || refuse "main worktree"
  [ -e "$gitdir/locked" ] && refuse "locked"
  for op in rebase-merge rebase-apply MERGE_HEAD BISECT_LOG CHERRY_PICK_HEAD REVERT_HEAD sequencer; do
    [ -e "$gitdir/$op" ] && refuse "operation in progress ($op)"
  done
  while IFS= read -r path; do
    [ "$(norm "$path")" != "$w" ] && under "$(norm "$path")" "$w" && refuse "another worktree inside it ($path)"
  done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
  cwd=$(claude agents --json 2>/dev/null | jq -r '.[].cwd // empty') || refuse "cannot list live Claude sessions"
  while IFS= read -r path; do
    [ -n "$path" ] && under "$(norm "$path")" "$w" && refuse "live Claude session in it ($path)"
  done <<< "$cwd"
  return 0
}

not_build_output() { grep -viE "(^|/)($BUILD_OUTPUT)/"; }

secrets() {
  local wt=$1 file
  while IFS= read -r file; do
    [ -f "$wt/$file" ] || continue
    if printf '%s\n' "$file" | grep -qiE "$SECRET_NAME" || grep -qIE -e "$SECRET_TEXT" "$wt/$file" 2>/dev/null; then
      echo "$file"
    fi
  done < <({ git -C "$wt" -c core.quotepath=off diff --name-only HEAD
             git -C "$wt" -c core.quotepath=off ls-files --others --exclude-standard
             git -C "$wt" -c core.quotepath=off ls-files --others --ignored --exclude-standard; } | not_build_output | sort -u)
}

push_check() {
  local dir=$1 ref=$2 hits
  git -C "$dir" fetch --all --prune --quiet || refuse "fetch failed"
  hits=$({ git -C "$dir" -c core.quotepath=off log --format= --name-only "$ref" --not --remotes | grep -iE "$SECRET_NAME"
           git -C "$dir" -c core.quotepath=off log -p --format= "$ref" --not --remotes \
             | awk '/^\+\+\+ b\// { file = substr($0, 7); next } /^\+/ { print file "\t" $0 }' \
             | grep -E -e "$SECRET_TEXT" | cut -f1; } | sort -u)
  [ -z "$hits" ] || refuse "secret-looking content in commits no remote holds: $(printf '%s' "$hits" | tr '\n' ' ')"
}

discard() {
  local wt=$1 pr=$2 left state head branch ref on_pr=""
  git -C "$wt" fetch --all --prune --quiet || refuse "fetch failed"
  left=$(git -C "$wt" -c core.quotepath=off status --porcelain --untracked-files=all --ignored=matching \
           | grep -viE "^!! (.*/)?($BUILD_OUTPUT)/$" | cut -c4- | head -5)
  [ -z "$left" ] || refuse "work not preserved: $(printf '%s' "$left" | tr '\n' ' ')"
  read -r state head < <(gh pr view "$pr" --json state,headRefName --jq '.state + " " + .headRefName' 2>/dev/null)
  case "${state:-}" in OPEN|MERGED) ;; *) refuse "no open or merged pull request at $pr" ;; esac
  while IFS= read -r ref; do
    [ "${ref#refs/remotes/*/}" = "$head" ] && on_pr=yes
  done < <(git -C "$wt" for-each-ref --contains HEAD --format='%(refname)' refs/remotes)
  [ -n "$on_pr" ] || refuse "HEAD is not on the pull request's branch $head"
  branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD) || branch=""
  git worktree remove --force "$wt" || refuse "git worktree remove failed"
  [ -z "$branch" ] || git branch -q -D "$branch" || refuse "worktree removed, branch $branch kept: delete failed"
  echo "removed $wt${branch:+ and local branch $branch}"
}

case "${1:-}:$#" in
  preflight:2) preflight "$2" && echo eligible ;;
  secrets:2) secrets "$2" ;;
  push-check:3) push_check "$2" "$3" && echo clean ;;
  discard:3) preflight "$2" && discard "$2" "$3" ;;
  *) sed -n '3,8p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
esac
