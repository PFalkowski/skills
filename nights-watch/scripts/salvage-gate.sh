#!/usr/bin/env bash
# The guards of a nights-watch salvage (SALVAGE.md), in code so no model decides when a destructive
# step is safe. Run from the root of the repository that owns the worktrees.
#   preflight  <worktree>          exit 0 when salvage may touch it; else prints the refusal, exit 1
#   secrets    <worktree>          prints uncommitted, untracked or ignored files that must not be committed
#   push-check <dir> <ref>         exit 0 when nothing of <ref> that this repository's remote lacks looks secret
#   discard    <worktree> <pr-url> removes the worktree and its local branch, only once every commit
#                                  is on the pull request's branch and nothing else is left in it
set -uo pipefail

# The only ignored folders treated as disposable build output: each is recreated by a build,
# restore or test run. Anything else ignored is somebody's work.
BUILD_OUTPUT='bin|obj|\.vs|node_modules|coverage|__pycache__|TestResults|_preview|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.gradle|\.next|\.nuxt|\.parcel-cache|\.turbo'
# An ignored file was left out of the repository on purpose, so only these types of it may be committed.
SAFE_IGNORED='\.(md|txt)$'
SECRET_NAME='(^|/)(appsettings[^/]*\.json|[^/]*settings\.local\.json|local\.settings\.json|\.env(\.[^/]*)?|[^/]*\.env|\.envrc|[^/]*\.tfstate(\.[^/]*)?|\.git-credentials|kubeconfig|[^/]*\.(pem|key|pfx|p12|jks|keystore|kdbx|tfvars|publishsettings)|id_(rsa|dsa|ecdsa|ed25519)[^/]*|\.npmrc|\.netrc|\.pypirc|secrets?\.[^/]*|credentials(\.[^/]*)?)$'
SECRET_TEXT='-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk_live_[0-9A-Za-z]{10,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-(ant|proj)-[A-Za-z0-9_-]{20,}|(Password|Passwd|Pwd|AccountKey|SharedAccessKey)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?[^;"'"'"'[:space:]]{6,}|[a-z][a-z0-9+.-]*://[^/:@[:space:]]+:[^/@[:space:]]+@'

refuse() { echo "refused: $1"; exit 1; }

norm() {
  local p=$1
  command -v cygpath >/dev/null 2>&1 && p=$(cygpath -m "$p")
  printf '%s' "${p%/}" | tr '[:upper:]' '[:lower:]'
}

binary() { [ -s "$1" ] && ! grep -qI '' "$1"; }

# The remote whose URL names the GitHub repository <owner/name>; refuses unless exactly one does.
repo_remote() {
  local dir=$1 repo=$2 r url found=""
  for r in $(git -C "$dir" remote); do
    url=$(git -C "$dir" remote get-url "$r" | tr '[:upper:]' '[:lower:]'); url=${url%/}; url=${url%.git}
    [[ "$url" == */"${repo,,}" || "$url" == *:"${repo,,}" ]] || continue
    [ -z "$found" ] || refuse "more than one remote points at $repo"
    found=$r
  done
  [ -n "$found" ] || refuse "no remote points at $repo"
  echo "$found"
}

under() { [ "$1" = "$2" ] || [[ "$1" == "$2"/* ]]; }

preflight() {
  local wt=$1 w top gitdir common path cwd op
  [ -d "$wt" ] || refuse "not a directory"
  [ -L "$wt" ] && refuse "a symbolic link or junction, which removal would follow"
  w=$(norm "$wt")
  top=$(git -C "$wt" rev-parse --show-toplevel 2>/dev/null) || refuse "not a git worktree"
  [ "$(norm "$top")" = "$w" ] || refuse "not the top folder of a worktree"
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || refuse "not run from a repository"
  [ "$(norm "$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir)")" = "$(norm "$common")" ] \
    || refuse "a worktree of another repository"
  gitdir=$(git -C "$wt" rev-parse --path-format=absolute --git-dir)
  [ "$(norm "$gitdir")" != "$(norm "$common")" ] || refuse "main worktree"
  [ -e "$gitdir/locked" ] && refuse "locked"
  [ -d "$gitdir/modules" ] && refuse "initialized submodules, whose commits removal would delete"
  [ -n "$(git -C "$wt" ls-files -s | awk '$1 == "160000"')" ] && refuse "submodules, whose commits removal would delete"
  [ -n "$(git -C "$wt" ls-files -v | grep -E '^[Sa-z] ')" ] \
    && refuse "skip-worktree or assume-unchanged files, whose edits git status does not show"
  path=$(find "$wt" -path "$wt/.git" -prune -o -type l -print -quit)
  [ -z "$path" ] || refuse "a symbolic link or junction inside it, which removal would follow ($path)"
  for op in rebase-merge rebase-apply MERGE_HEAD BISECT_LOG CHERRY_PICK_HEAD REVERT_HEAD sequencer; do
    [ -e "$gitdir/$op" ] && refuse "operation in progress ($op)"
  done
  while IFS= read -r path; do
    [ "$(norm "$path")" != "$w" ] && under "$(norm "$path")" "$w" && refuse "another worktree inside it ($path)"
  done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
  cwd=$(claude agents --json 2>/dev/null | jq -r '.[].cwd // empty') || refuse "cannot list live Claude sessions"
  while IFS= read -r path; do
    [ -n "$path" ] && under "$(norm "$path")" "$w" && refuse "live Claude session started in it ($path)"
  done <<< "$cwd"
  return 0
}

not_build_output() { grep -viE "(^|/)($BUILD_OUTPUT)/"; }

tagged() { local kind=$1; shift; git -C "$wt" -c core.quotepath=off "$@" | not_build_output | awk -v k="$kind" '{ print k "\t" $0 }'; }

secrets() {
  local wt=$1 kind file
  while IFS=$'\t' read -r kind file; do
    [ -f "$wt/$file" ] || continue
    if { [ "$kind" = ignored ] && ! printf '%s\n' "$file" | grep -qiE "$SAFE_IGNORED"; } \
      || printf '%s\n' "$file" | grep -qiE "$SECRET_NAME" || binary "$wt/$file" || grep -qiIE -e "$SECRET_TEXT" "$wt/$file" 2>/dev/null; then
      echo "$file"
    fi
  done < <(tagged changed diff --name-only HEAD
             tagged untracked ls-files --others --exclude-standard
             tagged ignored ls-files --others --ignored --exclude-standard) | sort -u
}

# Scans the objects a push would send, never patch text, so no diff or log setting can hide a secret.
# What the remote holds comes from ls-remote, never from local remote-tracking refs, which can be stale.
push_check() {
  local dir=$1 ref=$2 repo remote g c mode oid path scan names hits held name tag tags commits
  dir=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || refuse "not a git worktree"
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || refuse "cannot name this repository"
  remote=$(repo_remote "$dir" "$repo") || { echo "$remote"; exit 1; }
  g=(git --no-replace-objects -C "$dir" -c core.quotepath=off)
  held=$("${g[@]}" ls-remote --heads --tags "$remote" 2>/dev/null) || refuse "cannot list what $remote holds"
  trap "git -C $(printf '%q' "$dir") for-each-ref --format='delete %(refname)' refs/salvage-gate/ | git -C $(printf '%q' "$dir") update-ref --stdin" EXIT
  while read -r oid name; do
    [[ "$name" == *'^{}' ]] || "${g[@]}" cat-file -e "$oid" 2>/dev/null \
      || "${g[@]}" fetch --quiet --no-tags "$remote" "+$name:refs/salvage-gate/$name" || refuse "fetch of $name failed"
  done <<< "$held"
  held=$(printf '%s\n' "$held" | awk 'NF { print $1 }' | sort -u)
  commits=$("${g[@]}" rev-list "$ref" --not $held) || refuse "cannot list the commits of $ref"
  tags=$({ "${g[@]}" for-each-ref --format='%(objecttype) %(objectname) %(*objectname)' refs/tags \
             | awk 'NR == FNR { c[$1]; next } $1 == "tag" && $3 in c { print $2 }' <(printf '%s\n' "$commits") -
           [ "$("${g[@]}" cat-file -t "$ref")" = tag ] && "${g[@]}" rev-parse "$ref"
         } | sort -u | grep -vxF -f <(printf '%s\n' "$held"))
  scan=$(for tag in $tags; do
           "${g[@]}" cat-file tag "$tag" | grep -qaiE -e "$SECRET_TEXT" && printf 'hit\tmessage of tag %s\n' "$tag"
         done
         for c in $commits; do
           "${g[@]}" cat-file commit "$c" | grep -qaiE -e "$SECRET_TEXT" && printf 'hit\tmessage of commit %s\n' "$c"
           while IFS=' ' read -r -d '' _ mode _ oid _ && IFS= read -r -d '' path; do
             [ "$mode" = 000000 ] && continue
             printf 'name\t%s\n' "$path"
             if [ "$mode" = 160000 ] || { [ "$("${g[@]}" cat-file -s "$oid")" != 0 ] && ! "${g[@]}" cat-file blob "$oid" | grep -qI ''; } \
               || "${g[@]}" cat-file blob "$oid" 2>/dev/null | head -c 32 | grep -qa '^version https://git-lfs' \
               || "${g[@]}" cat-file blob "$oid" | grep -qaiE -e "$SECRET_TEXT"; then
               printf 'hit\t%s\n' "$path"
             fi
           done < <("${g[@]}" diff-tree -r -m -z --no-renames --no-commit-id --root "$c")
         done)
  names=$(printf '%s\n' "$scan" | sed -n 's/^name\t//p' | sort -u)
  hits=$({ printf '%s\n' "$scan" | sed -n 's/^hit\t//p'
           [ -z "$names" ] || printf '%s\n' "$names" | grep -iE "$SECRET_NAME"
           [ -z "$names" ] || printf '%s\n' "$names" | "${g[@]}" check-ignore --no-index --stdin | grep -viE "$SAFE_IGNORED"
         } | sort -u)
  [ -z "$hits" ] || refuse "secret-looking, binary, Git LFS or ignored files or tags in commits $remote does not hold: $(printf '%s' "$hits" | tr '\n' ' ')"
}

discard() {
  local wt=$1 pr=$2 left state head oid fork repo remote branch held
  left=$(git -C "$wt" -c core.quotepath=off status --porcelain --untracked-files=all --ignored=matching \
           | grep -viE "^!! (.*/)?($BUILD_OUTPUT)/$" | cut -c4- | head -5)
  [ -z "$left" ] || refuse "work not preserved: $(printf '%s' "$left" | tr '\n' ' ')"
  read -r state head oid fork repo < <(gh pr view "$pr" \
    --json state,headRefName,headRefOid,isCrossRepository,headRepository,headRepositoryOwner \
    --jq '[.state, .headRefName, .headRefOid, (.isCrossRepository | tostring), .headRepositoryOwner.login + "/" + .headRepository.name] | join(" ")' 2>/dev/null)
  case "${state:-}" in OPEN|MERGED) ;; *) refuse "no open or merged pull request at $pr" ;; esac
  [ "${fork:-}" = false ] || refuse "the pull request's branch is not in this repository"
  remote=$(repo_remote "$wt" "$repo") || { echo "$remote"; exit 1; }
  git -C "$wt" fetch --prune --quiet "$remote" || refuse "fetch failed"
  held=$(git -C "$wt" cat-file -e "$oid^{commit}" 2>/dev/null && echo local)
  git -C "$wt" fetch --quiet "$remote" "$oid" 2>/dev/null \
    || refuse "cannot fetch the pull request's head $oid from $remote"
  [ -z "$held" ] || [ -n "$(git -C "$wt" for-each-ref --contains "$oid" "refs/remotes/$remote/")" ] \
    || refuse "$remote holds no branch with the pull request's head $oid"
  git -C "$wt" merge-base --is-ancestor HEAD "$oid" 2>/dev/null \
    || refuse "HEAD has commits the pull request's branch $head never held"
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
