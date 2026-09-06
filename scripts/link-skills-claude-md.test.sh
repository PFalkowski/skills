#!/usr/bin/env bash
# Exercises link-skills.ps1's CLAUDE.md installation offer (-ClaudeMd Skip/Replace/Append/Merge/
# Ask) against real pwsh, with -Dest pointed at a throwaway directory so the real skill-linking
# half of the script never touches ~/.claude/skills or ~/.agents/skills, and -ClaudeMdPath pointed
# at a fixture file so the real ~/.claude/CLAUDE.md is never touched either.
#
# Requires pwsh on PATH -- GitHub-hosted ubuntu-latest runners ship it. Skips (not fails) without
# it, the same way deny-rules.test.sh skips its live guard without the `claude` CLI.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/link-skills.ps1"
REPO_CLAUDE_MD="$ROOT/CLAUDE.md"

if ! command -v pwsh >/dev/null 2>&1; then
  echo "SKIP: 'pwsh' is not on PATH -- link-skills.ps1 tests not run"
  exit 0
fi

fail=0
total=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
SKILL_DEST="$WORK/skills-dest"
mkdir -p "$SKILL_DEST"

# Every invocation: -Dest is redirected away from the real ~/.claude and ~/.agents skill folders,
# CI=true forces the non-interactive path regardless of the host pwsh's own Console/RawUI quirks,
# and stdin is closed so a script that mistakenly prompts fails fast instead of hanging the suite.
run() {
  CI=true pwsh -NoProfile -File "$SCRIPT" -Dest "$SKILL_DEST" "$@" < /dev/null
}

check() {
  local desc="$1"
  total=$((total + 1))
  if "${@:2}"; then
    echo "PASS: $desc"
  else
    echo "FAIL: $desc"
    fail=$((fail + 1))
  fi
}

fixture() {
  # A CLAUDE.md fixture that differs from the repo's real one, so Replace/Append/Merge all have
  # real work to do.
  printf '%s\n' '# Existing CLAUDE.md' 'Some prior local instruction that must survive Append.' > "$1"
}

# --- Skip writes nothing -------------------------------------------------------------------

claude_md="$WORK/skip/CLAUDE.md"
mkdir -p "$(dirname "$claude_md")"
fixture "$claude_md"
before="$(cat "$claude_md")"
out="$(run -ClaudeMd Skip -ClaudeMdPath "$claude_md" 2>&1)"
after="$(cat "$claude_md")"
check "Skip leaves the existing file byte-for-byte unchanged" [ "$before" = "$after" ]
check "Skip prints a result line mentioning CLAUDE.md" bash -c "printf '%s' \"\$1\" | grep -qi 'CLAUDE.md'" _ "$out"
check "Skip creates no backup file" bash -c "[ \"\$(find "$(dirname "$claude_md")" -maxdepth 1 -name 'CLAUDE.md.bak-*' | wc -l)\" -eq 0 ]"

# --- Identical file is detected and not rewritten -------------------------------------------

claude_md="$WORK/identical/CLAUDE.md"
mkdir -p "$(dirname "$claude_md")"
cp "$REPO_CLAUDE_MD" "$claude_md"
before_mtime="$(stat -c %Y "$claude_md" 2>/dev/null || stat -f %m "$claude_md")"
out="$(run -ClaudeMd Replace -ClaudeMdPath "$claude_md" 2>&1)"
after_mtime="$(stat -c %Y "$claude_md" 2>/dev/null || stat -f %m "$claude_md")"
check "identical file: result line marks it unchanged ('=')" bash -c "printf '%s' \"\$1\" | grep -qE '^=.*CLAUDE.md'" _ "$out"
check "identical file: mtime untouched even under -ClaudeMd Replace" [ "$before_mtime" = "$after_mtime" ]
check "identical file: no backup created" bash -c "[ \"\$(find "$(dirname "$claude_md")" -maxdepth 1 -name 'CLAUDE.md.bak-*' | wc -l)\" -eq 0 ]"

# --- Replace backs up then overwrites -------------------------------------------------------

claude_md="$WORK/replace/CLAUDE.md"
mkdir -p "$(dirname "$claude_md")"
fixture "$claude_md"
original="$(cat "$claude_md")"
out="$(run -ClaudeMd Replace -ClaudeMdPath "$claude_md" 2>&1)"
after="$(cat "$claude_md")"
repo_content="$(cat "$REPO_CLAUDE_MD")"
check "Replace overwrites with the repo's CLAUDE.md" [ "$after" = "$repo_content" ]
backup="$(find "$(dirname "$claude_md")" -maxdepth 1 -name 'CLAUDE.md.bak-*' | head -1)"
check "Replace leaves a backup file behind" [ -n "$backup" ]
check "the backup holds the pre-replace content" bash -c "[ \"\$(cat \"\$1\")\" = \"\$2\" ]" _ "$backup" "$original"
# Compares the backup *filename*, not the full path: git-bash's mktemp and the pwsh child process
# it launches resolve the same temp directory through different path-translation namespaces
# (MSYS POSIX vs. native Windows), so the two absolute paths can legitimately print differently
# even though they name the same file.
check "Replace's result line names the backup file" bash -c "printf '%s' \"\$1\" | grep -qF \"\$(basename \"\$2\")\"" _ "$out" "$backup"

# --- Append preserves the original above a separator ----------------------------------------

claude_md="$WORK/append/CLAUDE.md"
mkdir -p "$(dirname "$claude_md")"
fixture "$claude_md"
original="$(cat "$claude_md")"
out="$(run -ClaudeMd Append -ClaudeMdPath "$claude_md" 2>&1)"
after="$(cat "$claude_md")"
check "Append keeps the original content as a prefix" bash -c "case \"\$1\" in \"\$2\"*) exit 0;; *) exit 1;; esac" _ "$after" "$original"
check "Append's tail matches the repo's CLAUDE.md" bash -c "case \"\$1\" in *\"\$2\") exit 0;; *) exit 1;; esac" _ "$after" "$repo_content"
check "Append inserted more than just concatenation (a separator line)" [ "${#after}" -gt "$(( ${#original} + ${#repo_content} ))" ]
check "Append also backs up the pre-append file" bash -c "[ \"\$(find "$(dirname "$claude_md")" -maxdepth 1 -name 'CLAUDE.md.bak-*' | wc -l)\" -ge 1 ]"

# --- Non-interactive run with no -ClaudeMd neither prompts nor writes -----------------------

claude_md="$WORK/default/CLAUDE.md"
mkdir -p "$(dirname "$claude_md")"
fixture "$claude_md"
before="$(cat "$claude_md")"
# No -ClaudeMd at all, and no stdin to answer a prompt with: this must not hang the test suite,
# and it must not write, since the documented non-interactive default is Skip.
out="$(timeout 15 bash -c "CI=true pwsh -NoProfile -File '$SCRIPT' -Dest '$SKILL_DEST' -ClaudeMdPath '$claude_md' < /dev/null" 2>&1)"
status=$?
after="$(cat "$claude_md")"
check "a non-interactive run with no -ClaudeMd does not hang" [ "$status" -ne 124 ]
check "a non-interactive run with no -ClaudeMd writes nothing" [ "$before" = "$after" ]

# --- Merge degrades honestly when the 'claude' CLI is unavailable --------------------------
# Stubs PATH to a directory with no 'claude' binary, regardless of whether this host happens to
# have one, so the assertion is deterministic rather than dependent on what's installed here.

claude_md="$WORK/merge-no-cli/CLAUDE.md"
mkdir -p "$(dirname "$claude_md")"
fixture "$claude_md"
before="$(cat "$claude_md")"
NO_CLAUDE_PATH="$WORK/no-claude-path"
mkdir -p "$NO_CLAUDE_PATH"
# Carry over the real dirs pwsh itself needs, minus anywhere a 'claude' binary might live.
SAFE_PATH="$NO_CLAUDE_PATH"
IFS=':' read -ra parts <<< "$PATH"
for p in "${parts[@]}"; do
  [ -e "$p/claude" ] || [ -e "$p/claude.exe" ] || [ -e "$p/claude.cmd" ] && continue
  SAFE_PATH="$SAFE_PATH:$p"
done
out="$(CI=true PATH="$SAFE_PATH" pwsh -NoProfile -File "$SCRIPT" -Dest "$SKILL_DEST" -ClaudeMd Merge -ClaudeMdPath "$claude_md" < /dev/null 2>&1)"
after="$(cat "$claude_md")"
check "Merge without the claude CLI leaves the existing file untouched" [ "$before" = "$after" ]
check "Merge without the claude CLI reports the degradation, not silence" bash -c "printf '%s' \"\$1\" | grep -qiE 'claude|merge'" _ "$out"
check "Merge without the claude CLI suggests an alternate mode" bash -c "printf '%s' \"\$1\" | grep -qiE 'Replace|Append'" _ "$out"

echo "$((total - fail))/$total passed"
[ "$fail" -eq 0 ]
