#!/usr/bin/env bash
# Feeds pre-push its stdin contract (<local ref> <local oid> <remote ref> <remote oid>) against a
# stubbed `gh` on PATH that answers per --head branch. git is the real one, run inside whatever repo this file lives in,
# so ancestry is real: HEAD's own sha is an ancestor, a fabricated sha is not.
set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-push"
STUB=$(mktemp -d)
trap 'rm -rf "$STUB"' EXIT
cat > "$STUB/gh" <<'EOF'
#!/usr/bin/env bash
[ "${GH_STUB_FAIL:-}" = "1" ] && { echo "gh: network is unreachable" >&2; exit 1; }
[ "$1 $2" = "pr list" ] || exit 1
head=""; while [ $# -gt 0 ]; do [ "$1" = "--head" ] && head=$2; shift; done
case "$head" in
  dead)  printf '%s' "$GH_STUB_DEAD" ;;
  *)     printf '[]' ;;
esac
EOF
chmod +x "$STUB/gh"
export PATH="$STUB:$PATH"
export GH_STUB_DEAD="" GH_STUB_FAIL=""

head_sha=$(git rev-parse HEAD)
bogus_sha=0000000000000000000000000000000000000001
zero_sha=0000000000000000000000000000000000000000

fail=0
total=0
check() {
  local expected="$1" stdin="$2" actual
  total=$((total + 1))
  if printf '%s\n' "$stdin" | bash "$HOOK" origin https://example.invalid/repo.git >/dev/null 2>&1; then
    actual=allow
  else
    actual=deny
  fi
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: expected $expected, got $actual -- stdin: $stdin (dead=$GH_STUB_DEAD fail=$GH_STUB_FAIL)"
    fail=$((fail + 1))
  fi
}

pr() { printf '{"number":%s,"state":"%s","mergedAt":"2026-09-04T07:04:42Z","mergeCommit":%s,"baseRefName":"main"}' "$1" "$2" "$3"; }
merged() { pr "$1" MERGED "{\"oid\":\"$2\"}"; }
merged_list() { printf '[%s]' "$(merged 612 "$1")"; }
push_of() { printf 'refs/heads/%s %s refs/heads/%s %s' "$1" "$2" "$1" "$3"; }

# THE INCIDENT: newest PR merged, its squash commit not in the pushed commit -> denied.
GH_STUB_DEAD=$(merged_list "$bogus_sha")
check deny "$(push_of dead "$head_sha" "$bogus_sha")"
check deny "$(push_of dead "$head_sha" "$zero_sha")"

# The PR is keyed on the REMOTE branch: `git push origin HEAD:dead` and `git push origin tmp:dead`
# still target the dead branch; `git push origin dead:dead-v2` (the rehome recipe) does not.
check deny "HEAD $head_sha refs/heads/dead $bogus_sha"
check deny "refs/heads/tmp $head_sha refs/heads/dead $bogus_sha"
check allow "refs/heads/dead $head_sha refs/heads/dead-v2 $zero_sha"

# Legitimate continuation: the branch took the merge back (PR #584 -> #612 shape) -> allowed.
GH_STUB_DEAD=$(merged_list "$head_sha")
check allow "$(push_of dead "$head_sha" "$bogus_sha")"

# No PR yet, or the newest PR is still open -> allowed.
check allow "$(push_of chore/new "$head_sha" "$zero_sha")"
GH_STUB_DEAD="[$(pr 613 OPEN null),$(merged 612 "$bogus_sha")]"
check allow "$(push_of dead "$head_sha" "$bogus_sha")"

# Newest PR closed unmerged does not hide the merged one behind it.
GH_STUB_DEAD="[$(pr 613 CLOSED null),$(merged 612 "$bogus_sha")]"
check deny "$(push_of dead "$head_sha" "$bogus_sha")"
GH_STUB_DEAD="[$(pr 613 CLOSED null),$(merged 612 "$head_sha")]"
check allow "$(push_of dead "$head_sha" "$bogus_sha")"

# Not a branch push: tags and deletions are never checked.
GH_STUB_DEAD=$(merged_list "$bogus_sha")
check allow "refs/tags/v1 $head_sha refs/tags/v1 $zero_sha"
check allow "refs/heads/dead $zero_sha refs/heads/dead $head_sha"
check allow ""

# Several refs in one push: the healthy branch is read first, the dead one still refuses the push.
check deny "$(push_of chore/new "$head_sha" "$zero_sha")
$(push_of dead "$head_sha" "$bogus_sha")"

# gh unavailable or failing -> fail open.
GH_STUB_FAIL=1
check allow "$(push_of dead "$head_sha" "$bogus_sha")"
GH_STUB_FAIL="" GH_STUB_DEAD='not json'
check allow "$(push_of dead "$head_sha" "$bogus_sha")"

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
