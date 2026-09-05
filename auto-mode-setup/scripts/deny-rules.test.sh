#!/usr/bin/env bash
# Checks the "Irreversible history loss" deny rules in BASELINE.md against what they actually do,
# not what they read like they do. Three layers:
#
#   1. A static shape guard, no dependencies beyond grep: `:*` is documented (see the syntax
#      reminders near the top of BASELINE.md) as end-of-pattern shorthand -- so a rule with `:*`
#      anywhere but the literal end is, at minimum, suspect and must never reappear in a
#      `Bash(...)` rule without the surrounding prose being re-examined (see BASELINE.md's own note
#      that whether such a rule gates anything is disputed and unresolved, not settled either way).
#   2. A static presence guard, also no dependencies: the shape check above says nothing about a
#      load-bearing rule being deleted outright -- e.g. `Bash(git push * --force *)` -- since a
#      missing line has no ':*' to trip on. Assert every rule the prose relies on is present,
#      verbatim, in the deny block. This is what would have caught that exact regression.
#   3. A live guard: feeds the current deny block plus `Bash(git push:*)` to a real `claude -p`
#      session against a scratch repo with a nonexistent remote host, so a command that reaches
#      git (git produces its own error or output) is unambiguously distinguishable from one the
#      permission layer denied outright (no tool call happens at all). Requires the `claude` CLI
#      and working credentials; skips (not fails) without them, since most CI runners have neither
#      -- layers 1 and 2 are the ones CI can actually enforce today.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="$ROOT/BASELINE.md"

fail=0
total=0

# --- 1. Static guard: ':*' placement ---------------------------------------------------------

total=$((total + 1))
bad_lines="$(grep -nE '^Bash\(.*:\*[^)]' "$BASELINE" || true)"
if [ -n "$bad_lines" ]; then
  echo "FAIL: a rule uses ':*' before the end of its pattern -- it will match nothing:"
  echo "$bad_lines"
  fail=$((fail + 1))
else
  echo "PASS: no rule places ':*' anywhere but the very end of the pattern"
fi

# Pull the deny rules straight out of the file under test, so a future edit to this block is
# exactly what both static-presence and live checks exercise -- a revert or a typo shows up here
# without touching this script.
rules="$(awk '/^### Irreversible history loss$/{flag=1} flag && /^```$/{c++; if(c==2){exit}; next} flag && c==1 {print}' "$BASELINE")"

# --- 2. Static guard: load-bearing rules present, verbatim ------------------------------------

total=$((total + 1))
required_rules=(
  'Bash(git push --force:*)'
  'Bash(git push * --force)'
  'Bash(git push * --force *)'
  'Bash(git push -f:*)'
  'Bash(git push * -f)'
  'Bash(git push * -f *)'
  'Bash(git push --delete:*)'
  'Bash(git push origin --delete:*)'
  'Bash(git push * --delete)'
  'Bash(git push * --delete *)'
  'Bash(git push -d:*)'
  'Bash(git push * -d)'
  'Bash(git push * -d *)'
  'Bash(git push --mirror:*)'
  'Bash(git push * --mirror)'
  'Bash(git push * --mirror *)'
  'Bash(git push * +*)'
)
missing=()
for rule in "${required_rules[@]}"; do
  if ! printf '%s\n' "$rules" | grep -qxF "$rule"; then
    missing+=("$rule")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "FAIL: the deny block is missing rule(s) BASELINE.md's prose credits with gating git push:"
  printf '  %s\n' "${missing[@]}"
  fail=$((fail + 1))
else
  echo "PASS: every load-bearing git-push deny rule is present, verbatim, in the deny block"
fi

# --- 3. Live guard -----------------------------------------------------------------------------

if ! command -v claude >/dev/null 2>&1; then
  echo "SKIP: 'claude' is not on PATH -- live permission checks not run (static guards above still apply)"
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
