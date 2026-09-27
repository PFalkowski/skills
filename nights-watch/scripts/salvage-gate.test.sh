#!/usr/bin/env bash
# Drives salvage-gate.sh against real throwaway repositories: a bare "origin", a clone, and linked
# worktrees in every state the gate must tell apart. `claude` and `gh` are stubs on PATH; git is real.
set -uo pipefail

GATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/salvage-gate.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
TMP=$(cd "$TMP" && pwd)

export GIT_CONFIG_GLOBAL="$TMP/gitconfig" GIT_CONFIG_NOSYSTEM=1
git config --global user.name test
git config --global user.email test@example.invalid
git config --global init.defaultBranch main

mkdir "$TMP/bin"
cat > "$TMP/bin/claude" <<'EOF'
#!/usr/bin/env bash
[ "${CLAUDE_STUB_FAIL:-}" = "1" ] && exit 1
[ "$1 $2" = "agents --json" ] || exit 1
printf '%s' "${CLAUDE_STUB_JSON:-[]}"
EOF
cat > "$TMP/bin/gh" <<'EOF'
#!/usr/bin/env bash
[ "$1 $2" = "pr view" ] || exit 1
[ -n "${GH_STUB_PR:-}" ] || { echo "no pull requests found" >&2; exit 1; }
printf '%s\n' "$GH_STUB_PR"
EOF
chmod +x "$TMP/bin/claude" "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH"

native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
folder_link() { if command -v cygpath >/dev/null 2>&1; then cmd //c mklink //J "$(native "$1")" "$(native "$2")" >/dev/null; else ln -s "$2" "$1"; fi; }
sessions_at() { CLAUDE_STUB_JSON=$(jq -n --arg c "$(native "$1")" '[{cwd: $c, kind: "interactive"}]'); export CLAUDE_STUB_JSON; }

git init -q --bare "$TMP/origin.git"
git clone -q "$TMP/origin.git" "$TMP/repo" 2>/dev/null
REPO="$TMP/repo"
printf 'bin/\nobj/\n*.local.json\nnotes/\nappsettings.json\n' > "$REPO/.gitignore"
echo base > "$REPO/readme.md"
git -C "$REPO" add -A && git -C "$REPO" commit -qm base && git -C "$REPO" push -q origin main 2>/dev/null

worktree() { git -C "$REPO" worktree add -q "$TMP/$1" -b "$1" 2>/dev/null; echo "$TMP/$1"; }
commit_in() { echo "$2" > "$1/$2" && git -C "$1" add "$2" && git -C "$1" commit -qm "$2"; }

fail=0
total=0
expect() {
  local desc="$1" expected="$2"; shift 2
  local out status
  total=$((total + 1))
  out=$(cd "$REPO" && bash "$GATE" "$@" 2>&1); status=$?
  if [ "$status" -ne "$expected" ]; then
    echo "FAIL: $desc -- expected exit $expected, got $status"
    echo "$out" | sed 's/^/    /'
    fail=$((fail + 1))
  fi
  LAST="$out"
}
expect_out() {
  total=$((total + 1))
  if ! printf '%s\n' "$LAST" | grep -qE -- "$2"; then
    echo "FAIL: $1 -- output does not match /$2/"
    echo "$LAST" | sed 's/^/    /'
    fail=$((fail + 1))
  fi
}
expect_no_out() {
  total=$((total + 1))
  if printf '%s\n' "$LAST" | grep -qE -- "$2"; then
    echo "FAIL: $1 -- output unexpectedly matches /$2/"
    fail=$((fail + 1))
  fi
}
exists() { total=$((total + 1)); [ -e "$2" ] || { echo "FAIL: $1 -- $2 is gone"; fail=$((fail + 1)); }; }
gone() { total=$((total + 1)); [ ! -e "$2" ] || { echo "FAIL: $1 -- $2 still exists"; fail=$((fail + 1)); }; }
has_branch() { total=$((total + 1)); git -C "$REPO" rev-parse --verify -q "refs/heads/$2" >/dev/null || { echo "FAIL: $1 -- branch $2 is gone"; fail=$((fail + 1)); }; }
no_branch() { total=$((total + 1)); ! git -C "$REPO" rev-parse --verify -q "refs/heads/$2" >/dev/null || { echo "FAIL: $1 -- branch $2 still exists"; fail=$((fail + 1)); }; }

export CLAUDE_STUB_JSON='[]' CLAUDE_STUB_FAIL='' GH_STUB_PR=''

# --- preflight -----------------------------------------------------------------------------------
PLAIN=$(worktree plain)
expect "a clean linked worktree is eligible" 0 preflight "$PLAIN"
expect "the main worktree is refused" 1 preflight "$REPO"
expect_out "the main worktree names its reason" 'main worktree'
expect "a folder that is not a worktree is refused" 1 preflight "$TMP/bin"
mkdir -p "$PLAIN/src"
expect "a subfolder of a worktree is refused" 1 preflight "$PLAIN/src"
git init -q "$TMP/other"
expect "another repository is refused" 1 preflight "$TMP/other"

LOCKED=$(worktree locked)
git -C "$REPO" worktree lock "$LOCKED"
expect "a locked worktree is refused" 1 preflight "$LOCKED"
expect_out "a lock names its reason" 'locked'

REBASING=$(worktree rebasing)
mkdir "$(git -C "$REBASING" rev-parse --absolute-git-dir)/rebase-merge"
expect "a rebase in progress is refused" 1 preflight "$REBASING"
expect_out "an operation names its reason" 'operation in progress'

sessions_at "$PLAIN"
expect "a live session in the worktree is refused" 1 preflight "$PLAIN"
expect_out "a live session names its reason" 'live Claude session'
sessions_at "$PLAIN/src"
expect "a live session in a subfolder is refused" 1 preflight "$PLAIN"
sessions_at "$REPO"
expect "a session in the repository root does not block a worktree" 0 preflight "$PLAIN"
CLAUDE_STUB_FAIL=1 expect "unknown live sessions refuse" 1 preflight "$PLAIN"
export CLAUDE_STUB_JSON='[]'

git init -q "$TMP/lib" && commit_in "$TMP/lib" lib.txt
MODULAR=$(worktree modular)
git -C "$MODULAR" -c protocol.file.allow=always submodule add -q "$TMP/lib" lib 2>/dev/null
expect "a worktree with initialized submodules is refused" 1 preflight "$MODULAR"
expect_out "submodules name their reason" 'submodules'
CLONED=$(worktree cloned)
git clone -q "$TMP/lib" "$CLONED/sub" 2>/dev/null
git -C "$CLONED" -c protocol.file.allow=always submodule add -q "$TMP/lib" sub 2>/dev/null
expect "a submodule whose git data sits inside the worktree is refused" 1 preflight "$CLONED"
expect_out "an in-place submodule names its reason" 'submodules'

SKIPPED=$(worktree skipped)
git -C "$SKIPPED" update-index --skip-worktree readme.md
expect "a skip-worktree file is refused" 1 preflight "$SKIPPED"
expect_out "skip-worktree names its reason" 'skip-worktree'
ASSUMED=$(worktree assumed)
git -C "$ASSUMED" update-index --assume-unchanged readme.md
expect "an assume-unchanged file is refused" 1 preflight "$ASSUMED"

mkdir "$TMP/store" && echo precious > "$TMP/store/precious.txt"
LINKED=$(worktree linked)
folder_link "$LINKED/bin" "$TMP/store"
expect "a folder link inside the worktree is refused" 1 preflight "$LINKED"
expect_out "a folder link names its reason" 'symbolic link or junction'

OUTER=$(worktree outer)
git -C "$REPO" worktree add -q "$OUTER/inner" -b inner 2>/dev/null
expect "a worktree holding another worktree is refused" 1 preflight "$OUTER"
expect_out "a nested worktree names its reason" 'another worktree inside'

# --- secrets -------------------------------------------------------------------------------------
SECRETS=$(worktree secrets)
mkdir -p "$SECRETS/.claude" "$SECRETS/bin" "$SECRETS/notes"
echo '{"ConnectionStrings":{}}' > "$SECRETS/appsettings.json"
echo '{}' > "$SECRETS/.claude/settings.local.json"
printf 'key\n-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n' > "$SECRETS/notes/deploy.txt"
echo '{}' > "$SECRETS/bin/appsettings.json"
echo 'plain notes' > "$SECRETS/notes/plan.md"
echo 'class CredentialStore {}' > "$SECRETS/CredentialStore.cs"
expect "secrets lists but does not fail" 0 secrets "$SECRETS"
expect_out "an ignored appsettings.json is a secret" '^appsettings\.json$'
expect_out "an ignored local settings file is a secret" '^\.claude/settings\.local\.json$'
expect_out "a private key inside an ordinary file is a secret" '^notes/deploy\.txt$'
expect_no_out "build output is not scanned" '^bin/'
expect_no_out "ordinary notes are not secrets" 'plan\.md'
expect_no_out "a source file named for credentials is not a secret" 'CredentialStore'
expect_no_out "a secret's contents never reach the output" 'BEGIN'
LEAKY=$(worktree leaky)
mkdir -p "$LEAKY/notes"
for f in terraform.tfstate .envrc local.settings.json .git-credentials data.json; do echo x > "$LEAKY/notes/$f"; done
echo 'todo' > "$LEAKY/notes/todo.txt"
echo x > "$LEAKY/prod.env"
echo 'db = postgres://user:hunter2@db.example.invalid/app' > "$LEAKY/db.txt"
echo 'password=hunter2secret' > "$LEAKY/lower.txt"
expect "secrets on common secret holders" 0 secrets "$LEAKY"
for f in notes/terraform.tfstate notes/.envrc notes/local.settings.json notes/.git-credentials prod.env db.txt lower.txt; do
  expect_out "$f is reported" "^${f//./\.}\$"
done
expect_out "an ignored file of an unlisted type is reported" '^notes/data\.json$'
expect_no_out "an ignored text file is committable" 'todo\.txt'

# --- push-check ----------------------------------------------------------------------------------
PUSHY=$(worktree pushy)
commit_in "$PUSHY" feature.txt
expect "unpushed commits without secrets pass" 0 push-check "$PUSHY" HEAD
mkdir -p "$PUSHY/cfg"
echo '{}' > "$PUSHY/cfg/secrets.json"
git -C "$PUSHY" add cfg && git -C "$PUSHY" commit -qm cfg
expect "a secret-named file in an unpushed commit fails" 1 push-check "$PUSHY" HEAD
expect_out "the failing file is named" 'cfg/secrets\.json'
TOKENY=$(worktree tokeny)
printf 'token = "ghp_%s"\n' "$(printf 'a%.0s' $(seq 36))" > "$TOKENY/config.txt"
git -C "$TOKENY" add config.txt && git -C "$TOKENY" commit -qm config
expect "a token in an unpushed commit fails" 1 push-check "$TOKENY" HEAD
expect_out "the file holding the token is named" 'config\.txt'
expect_no_out "the token never reaches the output" 'ghp_'
EVIL=$(worktree evil)
git -C "$EVIL" checkout -q -b evil-side && commit_in "$EVIL" side.txt && git -C "$EVIL" checkout -q evil
commit_in "$EVIL" main-side.txt
git -C "$EVIL" merge -q --no-commit evil-side
echo 'Server=db;Password=hunter2secret' > "$EVIL/conn.txt"
git -C "$EVIL" add conn.txt && git -C "$EVIL" commit -qm "merge side"
expect "a secret added inside a merge commit fails" 1 push-check "$EVIL" HEAD
expect_out "the file the merge added is named" 'conn\.txt'
FORCED=$(worktree forced)
mkdir -p "$FORCED/notes" && echo idea > "$FORCED/notes/idea.md"
git -C "$FORCED" add -f notes/idea.md && git -C "$FORCED" commit -qm idea
expect "a force-added ignored text file passes" 0 push-check "$FORCED" HEAD
echo '{}' > "$FORCED/notes/state.json"
git -C "$FORCED" add -f notes/state.json && git -C "$FORCED" commit -qm state
expect "a force-added ignored file of another type fails" 1 push-check "$FORCED" HEAD
expect_out "the force-added file is named" 'notes/state\.json'

# --- discard -------------------------------------------------------------------------------------
UNPUSHED=$(worktree unpushed)
commit_in "$UNPUSHED" work.txt
GH_STUB_PR="OPEN unpushed - false" expect "commits no remote holds are never discarded" 1 discard "$UNPUSHED" https://example.invalid/pr/1
exists "an unpushed worktree stays" "$UNPUSHED"
has_branch "an unpushed branch stays" unpushed

SHIPPED=$(worktree shipped)
commit_in "$SHIPPED" shipped.txt
git -C "$SHIPPED" push -q origin shipped 2>/dev/null
expect "no pull request refuses" 1 discard "$SHIPPED" https://example.invalid/pr/2
GH_STUB_PR="CLOSED shipped - false" expect "a closed pull request refuses" 1 discard "$SHIPPED" https://example.invalid/pr/2
GH_STUB_PR="OPEN somewhere-else - false" expect "a pull request for other work refuses" 1 discard "$SHIPPED" https://example.invalid/pr/2
echo draft > "$SHIPPED/draft.md"
GH_STUB_PR="OPEN shipped - false" expect "an untracked file refuses" 1 discard "$SHIPPED" https://example.invalid/pr/2
expect_out "the unpreserved file is named" 'draft\.md'
rm "$SHIPPED/draft.md"
mkdir -p "$SHIPPED/notes" && echo idea > "$SHIPPED/notes/idea.md"
GH_STUB_PR="OPEN shipped - false" expect "an ignored file that is not build output refuses" 1 discard "$SHIPPED" https://example.invalid/pr/2
rm -r "$SHIPPED/notes"
echo tweak >> "$SHIPPED/shipped.txt"
GH_STUB_PR="OPEN shipped - false" expect "an uncommitted change refuses" 1 discard "$SHIPPED" https://example.invalid/pr/2
git -C "$SHIPPED" checkout -q -- shipped.txt
GH_STUB_PR="OPEN shipped - true" expect "a pull request from a fork refuses" 1 discard "$SHIPPED" https://example.invalid/pr/2
GH_STUB_PR="MERGED shipped $(git -C "$REPO" rev-parse main) false" expect "commits a merged pull request never held refuse" 1 discard "$SHIPPED" https://example.invalid/pr/2
expect_out "unreviewed commits name their reason" 'never held'
sessions_at "$SHIPPED"
GH_STUB_PR="OPEN shipped - false" expect "a live session refuses the discard" 1 discard "$SHIPPED" https://example.invalid/pr/2
export CLAUDE_STUB_JSON='[]'
exists "every refusal left the worktree" "$SHIPPED"
mkdir -p "$SHIPPED/bin/Debug" "$SHIPPED/obj" && echo x > "$SHIPPED/bin/Debug/app.dll" && echo x > "$SHIPPED/obj/cache"
GH_STUB_PR="OPEN shipped - false" expect "preserved work with only build output is discarded" 0 discard "$SHIPPED" https://example.invalid/pr/2
gone "the worktree is removed" "$SHIPPED"
no_branch "the local branch is deleted" shipped
total=$((total + 1))
git -C "$REPO" ls-remote --exit-code origin refs/heads/shipped >/dev/null || { echo "FAIL: the remote branch must never be touched"; fail=$((fail + 1)); }

MERGED=$(worktree merged-into-salvage)
commit_in "$MERGED" leftover.txt
git -C "$REPO" fetch -q origin
git -C "$REPO" worktree add -q "$TMP/salvage" -b salvage/2026-09-27 origin/main 2>/dev/null
git -C "$TMP/salvage" merge -q --no-ff merged-into-salvage -m "Salvage merged-into-salvage"
git -C "$TMP/salvage" push -q origin salvage/2026-09-27 2>/dev/null
GH_STUB_PR="OPEN salvage/2026-09-27 - false" expect "a leftover merged into the salvage branch is discarded" 0 discard "$MERGED" https://example.invalid/pr/3
gone "the leftover worktree is removed" "$MERGED"

DETACHED=$(worktree detached)
git -C "$DETACHED" checkout -q --detach
git -C "$REPO" branch -q -D detached 2>/dev/null
GH_STUB_PR="MERGED main $(git -C "$DETACHED" rev-parse HEAD) false" expect "a detached HEAD already on a merged pull request's branch is discarded" 0 discard "$DETACHED" https://example.invalid/pr/4
gone "the detached worktree is removed" "$DETACHED"
has_branch "no branch is deleted for a detached HEAD" main

expect "an unknown command is a usage error" 2 frobnicate

if [ "$fail" -ne 0 ]; then
  echo "$fail/$total salvage-gate checks failed"
  exit 1
fi
echo "all $total salvage-gate checks passed"
