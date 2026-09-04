#!/usr/bin/env bash
# Feeds pre-push its stdin contract (<local ref> <local oid> <remote ref> <remote oid>) against a
# stubbed `gh` on PATH. git is the real one, run inside whatever repo this file lives in, with the
# fetch skipped so the test needs no network. Ancestry is real: HEAD's own sha is an ancestor, a
# fabricated sha is not.
set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-push"
STUB=$(mktemp -d)
trap 'rm -rf "$STUB"' EXIT
cat > "$STUB/gh" <<'EOF'
#!/usr/bin/env bash
[ "${GH_STUB_FAIL:-}" = "1" ] && { echo "gh: network is unreachable" >&2; exit 1; }
case "$1 $2" in
  "pr list") printf '%s' "$GH_STUB_LIST" ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$STUB/gh"
export PATH="$STUB:$PATH"
export DEAD_BRANCH_GUARD_NO_FETCH=1
export GH_STUB_LIST="" GH_STUB_FAIL=""

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
    echo "FAIL: expected $expected, got $actual -- stdin: $stdin (list=$GH_STUB_LIST fail=$GH_STUB_FAIL)"
    fail=$((fail + 1))
  fi
}

merged_list() { printf '[{"number":612,"state":"MERGED","mergedAt":"2026-09-04T07:04:42Z","mergeCommit":{"oid":"%s"},"baseRefName":"main"}]' "$1"; }
push_of() { printf 'refs/heads/%s %s refs/heads/%s %s' "$1" "$2" "$1" "$3"; }

# The incident: newest PR merged, its squash commit not in the pushed commit -> denied.
GH_STUB_LIST=$(merged_list "$bogus_sha")
check deny "$(push_of feat/x "$head_sha" "$bogus_sha")"
check deny "$(push_of feat/x "$head_sha" "$zero_sha")"

# Legitimate continuation: the branch took the merge back -> allowed.
GH_STUB_LIST=$(merged_list "$head_sha")
check allow "$(push_of feat/x "$head_sha" "$bogus_sha")"

# No PR yet, or the PR is still open -> allowed.
GH_STUB_LIST='[]'
check allow "$(push_of chore/new "$head_sha" "$zero_sha")"
GH_STUB_LIST='[{"number":613,"state":"OPEN","mergedAt":null,"mergeCommit":null,"baseRefName":"main"}]'
check allow "$(push_of chore/new "$head_sha" "$bogus_sha")"

# Not a branch push: tags and deletions are never checked.
GH_STUB_LIST=$(merged_list "$bogus_sha")
check allow "refs/tags/v1 $head_sha refs/tags/v1 $zero_sha"
check allow "refs/heads/feat/x $zero_sha refs/heads/feat/x $head_sha"
check allow ""

# Several refs in one push: one dead branch is enough to refuse the whole push.
check deny "$(push_of chore/new "$head_sha" "$zero_sha")
$(push_of feat/x "$head_sha" "$bogus_sha")"

# gh unavailable or failing -> fail open.
GH_STUB_FAIL=1
check allow "$(push_of feat/x "$head_sha" "$bogus_sha")"
GH_STUB_FAIL="" GH_STUB_LIST='not json'
check allow "$(push_of feat/x "$head_sha" "$bogus_sha")"

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
