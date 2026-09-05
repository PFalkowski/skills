#!/usr/bin/env bash
# Checks the "Irreversible history loss" deny rules in BASELINE.md against what they actually do,
# not what they read like they do. Two layers:
#
#   1. A static guard, no dependencies beyond grep: `:*` is documented (see the syntax reminders
#      near the top of BASELINE.md) as end-of-pattern shorthand, and a live session confirms it is
#      read that way no matter where in the pattern it sits -- so a rule with `:*` anywhere but the
#      literal end matches nothing, silently. That shape must never reappear in a `Bash(...)` rule.
#   2. A live guard: feeds the current deny block plus `Bash(git push:*)` to a real `claude -p`
#      session against a scratch repo with a nonexistent remote host, so a command that reaches
#      git (git produces its own error or output) is unambiguously distinguishable from one the
#      permission layer denied outright (no tool call happens at all). Requires the `claude` CLI
#      and working credentials; skips (not fails) without them, since most CI runners have neither.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="$ROOT/BASELINE.md"

fail=0
total=0

# --- 1. Static guard ------------------------------------------------------------------------

total=$((total + 1))
bad_lines="$(grep -nE '^Bash\(.*:\*[^)]' "$BASELINE" || true)"
if [ -n "$bad_lines" ]; then
  echo "FAIL: a rule uses ':*' before the end of its pattern -- it will match nothing:"
  echo "$bad_lines"
  fail=$((fail + 1))
else
  echo "PASS: no rule places ':*' anywhere but the very end of the pattern"
fi

# --- 2. Live guard ---------------------------------------------------------------------------

if ! command -v claude >/dev/null 2>&1; then
  echo "SKIP: 'claude' is not on PATH -- live permission checks not run (static guard above still applies)"
  [ "$fail" -eq 0 ]
  exit $?
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

REPO="$WORK/repo"
mkdir -p "$REPO"
(
  cd "$REPO" \
    && git init -q \
    && git config user.email t@example.com \
    && git config user.name t \
    && git commit -q --allow-empty -m init \
    && git remote add origin https://example.invalid/nonexistent-remote.git
) >/dev/null 2>&1

# Pull the deny rules straight out of the file under test, so a future edit to this block is
# exactly what gets exercised -- a revert or a typo shows up here without touching this script.
rules="$(awk '/^### Irreversible history loss$/{flag=1} flag && /^```$/{c++; if(c==2){exit}; next} flag && c==1 {print}' "$BASELINE")"

SETTINGS="$WORK/settings.json"
{
  printf '{"permissions":{"allow":["Bash(git push:*)"],"deny":['
  first=1
  while IFS= read -r rule; do
    [ -z "$rule" ] && continue
    if [ "$first" -eq 1 ]; then first=0; else printf ','; fi
    printf '%s' "$rule" | sed 's/.*/"&"/'
  done <<< "$rules"
  printf ']}}'
} > "$SETTINGS"

preflight="$(cd "$REPO" && claude -p "reply with exactly: ok" --settings "$SETTINGS" --permission-prompts none --output-format json 2>&1)"
if ! printf '%s' "$preflight" | grep -q '"is_error":false'; then
  echo "SKIP: 'claude' is present but not usable here (no credentials?) -- live checks not run"
  echo "  preflight said: $(printf '%s' "$preflight" | head -c 300)"
  [ "$fail" -eq 0 ]
  exit $?
fi

check() {
  local expect="$1" cmd="$2" out actual
  total=$((total + 1))
  out="$(cd "$REPO" && claude -p "Use the Bash tool to run exactly this command, verbatim, with no explanation first: $cmd" \
        --settings "$SETTINGS" --permission-prompts none --output-format json 2>&1)"
  if printf '%s' "$out" | grep -q '"permission_denials":\[\]'; then
    actual=allow
  else
    actual=deny
  fi
  if [ "$actual" != "$expect" ]; then
    echo "FAIL: expected $expect, got $actual -- command: $cmd"
    echo "  raw: $(printf '%s' "$out" | head -c 500)"
    fail=$((fail + 1))
  else
    echo "PASS ($actual): $cmd"
  fi
}

# One representative case per rule family (leading flag, trailing, trailing-plus-extra) -- not
# exhaustive, since each live call is a real model turn. A plain push is included as the sanity
# check that the allow rule still works at all.
check deny "git push --force origin main"
check deny "git push origin main --force --quiet"
check deny "git push -f origin main"
check deny "git push origin b1 --delete --quiet"
check deny "git push origin --mirror --quiet"
check deny "git push origin +main:main"
check allow "git push origin main"

# The documented gap itself: the colon delete-refspec is not blocked in either position. These
# stay `allow` on purpose -- if a future rule change makes either of them `deny`, BASELINE.md's
# prose needs updating in the same commit, not just this script.
check allow "git push origin :b1"
check allow "git push origin :b1 main"

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
