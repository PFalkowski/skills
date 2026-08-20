#!/usr/bin/env bash
#
# setup.sh — run the whole shadow path in order.
#
#   ./setup.sh --check     read-only: report what is missing, change nothing
#   sudo ./setup.sh        build it
#   ./setup.sh 30 50       run only the named steps
#
# Every step is idempotent, so this doubles as a repair tool: run it against a box that
# half-works and it fixes the parts that do not.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

STEPS=(10-dev-user 20-storage 30-remote-access 40-immich 50-dev-image 60-launcher)

want=(); passthru=()
for a in "$@"; do
  case "$a" in
    --check|-n|--dry-run) passthru+=("$a") ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) want+=("$a") ;;
  esac
done

if [ ! -f "$here/setup.env" ]; then
  echo "Missing $here/setup.env" >&2
  echo "  cp $here/setup.env.example $here/setup.env   # then fill in DEV_USER and DATA_DISK" >&2
  exit 2
fi

rc=0
for s in "${STEPS[@]}"; do
  if [ ${#want[@]} -gt 0 ]; then
    match=0
    for w in "${want[@]}"; do case "$s" in "$w"*|*"$w"*) match=1 ;; esac; done
    [ "$match" = 1 ] || continue
  fi
  printf '\n\033[1m### %s\033[0m\n' "$s"
  # A failing step does not abort the run: later steps still report, so one pass shows
  # everything that is wrong rather than only the first thing.
  "$here/$s.sh" "${passthru[@]:-}" || rc=1
done

echo
if [ "$rc" = 0 ]; then
  echo "Done. Next: cd into a repo under your repo root and run 'dev'."
else
  echo "Some steps reported problems. See PITFALLS.md — several of these look like a"
  echo "different problem than they are."
fi
exit $rc
