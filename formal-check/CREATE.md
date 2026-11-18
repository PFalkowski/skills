# CREATE: build one check for one promise

Read this before building a check. Terms, the CHOOSE table and the seven guards are in
[SKILL.md](SKILL.md). Run every command from the top folder of the target repo.

## 1. Pick the promise

Use the promise the caller named. Otherwise pick the strongest target in the repo: a promise whose
break harms users and that tests rarely reach, not the one that is easiest to check. Answer from
the code; ask the user only what you cannot observe.

## 2. Choose its check

Classify the promise with the CHOOSE table in SKILL.md.

## 3. Build it

The model or harness goes in the project skill's folder (step 6). Before writing anything there,
check that git does not ignore that folder. Give the folder with a trailing slash: a folder that
does not exist yet only matches a folder-only ignore rule, such as `build/`, when written that way.

```bash
git check-ignore -q <folder>/
```

Exit 1 means not ignored: go on. Exit 0 (ignored) or 128 (a fatal error): stop, report the check
as blocked, and print what `git check-ignore -v <folder>/` says
([git-check-ignore](https://git-scm.com/docs/git-check-ignore), "Exit status"). Never run
`git add -f`.

- **Model check**: the model and its config file. Every action cites the path:line it stands for,
  and one indivisible step in the code is one action. Keep the invariant definition on one line.
  Give every reachable state a successor, or set `CHECK_DEADLOCK FALSE` in the config with the
  source line cited ([TLC.md](TLC.md)).
- **Every-input check**: written with the repo's own tests ([EVERY-INPUT.md](EVERY-INPUT.md)).
- **A promise that needs a proof**: build the strongest bounded check, state its bound, and record
  the proof as an open item.

## 4. Show it able to fail, without touching other work

A broken variant is applied to the real code and must be taken back out exactly. Each attempt gets
its own run folder outside the tree. Shell variables do not last from one command to the next, so
use the printed run folder by its literal path in later steps. Never use `git stash`,
`git checkout -- <file>` or `git reset` here: the stash is shared with other sessions, and checkout
and reset destroy uncommitted work. Run folders are evidence and are not deleted.

**4.1 and 4.2. Make the run folder, then refuse while a run of this tree is unrestored.** Run as one
command. The folder records the tree it belongs to, because several worktrees of one repo share the
state folder.

```bash
S=~/.agent-state/<repo-slug>/formal-check/<check-name>
mkdir -p "$S"
run=$(mktemp -d "$S/run.XXXXXX")
top=$(git rev-parse --show-toplevel)
printf '%s\n' "$top" > "$run/tree"
echo "run folder: $run"
blocked=0
for d in "$S"/run.*/; do
  d=${d%/}
  { [ "$d" = "$run" ] || [ -e "$d/restored" ]; } && continue
  t=$top
  [ -f "$d/tree" ] && t=$(cat "$d/tree")
  if [ "$t" = "$top" ]; then
    if [ -d "$d/orig" ]; then
      echo "REFUSED: run $d of tree $t is not restored; restore its files from $d/orig first"
      blocked=1
    else
      touch "$d/restored"
      echo "MARKED RESTORED: run $d of tree $t never applied a variant"
    fi
  elif [ -d "$t" ]; then
    echo "REPORT ONLY: run $d of tree $t is not restored; restore it from that tree, never from here"
  else
    echo "ABANDONED: run $d of tree $t is not restored and that tree no longer exists; its copies stay in $d/orig"
  fi
done
if [ "$blocked" = 1 ]; then rm "$run/tree" && rmdir "$run"; fi
[ "$blocked" = 0 ]
```

On a REFUSED line (the command exits 1), stop and report it. The refused attempt removes its own
folder, which holds only its `tree` file
([rm](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/rm.html),
[rmdir](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/rmdir.html)). A REPORT ONLY or
ABANDONED line does not block: put it in the handoff. A run folder with no `tree` file counts as
this tree's.

**4.3. Run the check once on the unchanged code** and record the result. Any files the check
itself leaves behind then show up in the snapshot below and are not mistaken for damage.

**4.4. Snapshot the tree:**
`git status --porcelain > "$run/status.before"` and `git diff > "$run/diff.before"`.

**4.5. Copy every file the variant will touch** into the run folder, keeping relative paths. A
variant only edits existing files. For each file `<f>`:
`mkdir -p "$run/orig/$(dirname "<f>")" && cp -p "<f>" "$run/orig/<f>"`.

**4.6. Apply the broken variant**, such as a removed check or a reordered step. For a model check,
rewrite the model's actions from the changed code, each citing path:line.

**4.7. Keep the variant as evidence:** `diff -u "$run/orig/<f>" "<f>" >> "$run/variant.patch"` for
each file. `diff` exits 1 here because the files differ; that is expected.

**4.8. Run the check. It must fail**: for TLC, exit 12 and `Invariant <name> is violated.`; for an
every-input check, a failing property. If it passes, the check cannot see the break: restore
(4.9), then fix the check, not the variant.

**4.9. Restore and prove it.** Run as one command, with the literal run folder and the files from
4.5:

```bash
run=<the run folder printed in 4.1>
top=$(git rev-parse --show-toplevel)
ok=1
for f in <each file from 4.5>; do
  cp -p "$run/orig/$f" "$f"
  cmp "$run/orig/$f" "$f" || { echo "NOT RESTORED: $f in tree $top differs from $run/orig/$f"; ok=0; }
done
if [ "$ok" = 1 ]; then
  git status --porcelain > "$run/status.after"
  git diff > "$run/diff.after"
  if ! cmp -s "$run/status.before" "$run/status.after" || ! cmp -s "$run/diff.before" "$run/diff.after"; then
    echo "RESTORED, but git status or diff changed in tree $top:"
    diff -u "$run/status.before" "$run/status.after"
    diff -u "$run/diff.before" "$run/diff.after"
  fi
  touch "$run/restored"
fi
[ "$ok" = 1 ]
```

- Every `cmp` exits 0 and status and diff match: the run is restored.
- Every `cmp` exits 0 but status or diff differs: the run is marked restored and the difference is
  reported in the handoff.
- Any NOT RESTORED line (the command exits 1): stop and report it. The copies stay in
  `$run/orig`, there is no `restored` file, and 4.2 blocks the next run in this tree until the
  files are restored.

The per-file `cmp` is required. After an edit to an untracked file that was not restored,
`git status --porcelain` and `git diff` both print the same as before.

Commands: [git-rev-parse](https://git-scm.com/docs/git-rev-parse),
[git-status](https://git-scm.com/docs/git-status), [git-diff](https://git-scm.com/docs/git-diff),
[mktemp](https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html), and the
POSIX utilities [mkdir](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/mkdir.html),
[cat](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/cat.html),
[touch](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/touch.html),
[rm](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/rm.html),
[rmdir](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/rmdir.html),
[dirname](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/dirname.html),
[cp](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/cp.html) (`-p` keeps mode and
times), [diff](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/diff.html) (exit 1 when
the files differ) and [cmp](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/cmp.html)
(exit 0 when identical, `-s` prints nothing).

## 5. Run the check on the real code

It passes, or fails only on findings. A failure on the real code is a finding: report it with the
counterexample told in the code's words. Never weaken the property or the model, and never change
product code unless asked.

## 6. Write the project skill

Write it at `.claude/skills/<name>/SKILL.md`, unless the repo already keeps project skills in
another folder such as `.agents/skills`. Give it frontmatter that names the area and says when to
use it; without frontmatter the skill never registers. Write it only after the `git check-ignore`
test in step 3 exits 1 for its folder. The caller's process commits it.

## 7. What the project skill records

For each check:

- the promise and its harm, one plain sentence each;
- the one command that runs it (for TLC, the commands in [TLC.md](TLC.md) with the pinned URL and
  SHA-256);
- the bounds and assumptions, and what is left out;
- the coverage record;
- a line that starts with `Sync commit: ` followed by a 40-character commit hash.

It tells the next agent how to tell a real bug from a modelling error: replay each step of the
counterexample against the code. A step the code cannot take means the model is wrong. It says the
sync commit moves only after the check is rerun against the new commit, never in a
documentation-only pass, and points to formal-check MAINTAIN.

**Clean-tree test.** Write the hash from `git rev-parse HEAD` as the sync commit only when
`git status --porcelain -- <covered files>` prints nothing. Otherwise write `none` in its place,
with the reason. Do not use `git diff --quiet HEAD -- <file>` for this: it exits 0 for an untracked
file.

## 8. Follow the project skill once

Run it as the next agent would, from the skill alone. A step that does not run is a defect in the
skill: fix it.

## 9. Hand off

Report what was checked, which tool and why, the bounds, the findings in plain words, the command,
what it does not cover, and any library added. List every REPORT ONLY, ABANDONED or NOT RESTORED
line from step 4. CREATE does not edit the target repo's continuous integration (CI). A check that
needs a new toolchain, such as TLC, is reported with its command and "not in CI".
