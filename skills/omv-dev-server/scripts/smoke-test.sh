#!/usr/bin/env bash
# Cold-container verification that an agent can actually push and open a PR.
# Run as the last build step or on first boot, so it fails loudly here rather than at the
# moment someone needs to push.
#
#   ./smoke-test.sh [image] [private-repo-url]
set -uo pipefail
IMAGE="${1:-${DEV_IMAGE:-dev-ai}}"
PRIVATE_REPO="${2:-}"

echo "== image: $IMAGE =="
docker run --rm ${GH_TOKEN:+-e GH_TOKEN="$GH_TOKEN"} "$IMAGE" bash -lc '
  fail=0
  chk() { printf "  %-34s %s\n" "$1" "$2"; }
  v=$(gh --version 2>/dev/null | head -1);        [ -n "$v" ] && chk "gh"                "$v"        || { chk "gh" "MISSING"; fail=1; }
  h=$(git config --system --get credential.helper); [ -n "$h" ] && chk "credential.helper" "$h"      || { chk "credential.helper" "UNSET"; fail=1; }
  s=$(command -v ssh);   [ -n "$s" ] && chk "ssh" "$s"  || { chk "ssh" "MISSING"; fail=1; }
  j=$(command -v jq);    [ -n "$j" ] && chk "jq"  "$j"  || { chk "jq"  "MISSING"; fail=1; }
  chk "GIT_TERMINAL_PROMPT" "${GIT_TERMINAL_PROMPT:-<unset>}"
  [ "${GIT_TERMINAL_PROMPT:-}" = "0" ] || { echo "    ^ should be 0 — see AGENT-AUTH.md"; fail=1; }
  printf "  %-34s " "gh auth status"; gh auth status 2>&1 | head -1
  exit $fail
'
rc=$?

echo
echo "== credential error legibility =="
# Proves GIT_TERMINAL_PROMPT is doing its job: unset, git names the absent terminal
# ("No such device or address") and sends you hunting a broken mount.
docker run --rm "$IMAGE" bash -lc '
  R=https://github.com/does-not-exist-'"$RANDOM"'/private.git
  printf "  set   : "; git ls-remote $R 2>&1 | tail -1
  printf "  unset : "; env -u GIT_TERMINAL_PROMPT git ls-remote $R 2>&1 | tail -1
'

if [ -n "$PRIVATE_REPO" ]; then
  echo
  echo "== real push path (private repo — proves authentication, not just reachability) =="
  docker run --rm ${GH_TOKEN:+-e GH_TOKEN="$GH_TOKEN"} "$IMAGE" bash -lc "
    git ls-remote --heads '$PRIVATE_REPO' >/dev/null 2>&1 && echo '  push path OK' || { echo '  push path FAILED'; exit 1; }
  " || rc=1
else
  echo
  echo "  note: pass a PRIVATE repo url as \$2 to prove authentication."
  echo "        against a public repo git ls-remote succeeds anonymously, which proves"
  echo "        reachability only."
fi

exit $rc
