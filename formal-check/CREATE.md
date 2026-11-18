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

A model and its config go in the project skill's folder (step 6). An every-input harness goes
where the repo's test runner finds it, and the project skill records its path. Before writing
anything into the project skill's folder, check that git does not ignore it. Give the folder with a
trailing slash: a folder that does not exist yet only matches a folder-only ignore rule, such as
`build/`, when written that way.

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

A broken variant is a scratch change to the real code. The working tree holds it only while one
command runs: that command takes the backup, puts the variant in, runs the check, puts the
originals back and proves it. Nothing else in this step writes to the tree. Never use `git stash`,
`git checkout -- <file>` or `git reset` here: the stash is shared with other sessions, and checkout
and reset destroy uncommitted work.

Each attempt gets its own run folder under
`~/.agent-state/<repo-slug>/formal-check/<check-name>/`. Run folders are evidence and are never
deleted. Where the repo sets `AGENTS_STATE`, that folder replaces `~/.agent-state/<repo-slug>`
([agent-state](../docs/agent-state.md)). Shell variables do not last from one command to the
next, so every block below starts from a literal path printed by an earlier one.

A run folder holds `tree` (the top folder of the worktree it belongs to), `files` (the files the
variant changes, one path per line, relative to that folder), `variant/` and `orig/` (the changed
and the original copies), and the markers `applied` and `restored`.

**4.1. Guard, then make the run folder.** Run from the top folder of the target repo. A run that
was applied and never restored blocks a new run in the same tree.

```bash
S=~/.agent-state/<repo-slug>/formal-check/<check-name>
top=$(git rev-parse --show-toplevel)
blocked=0
for d in "$S"/run.*; do
  [ -f "$d/applied" ] && [ ! -f "$d/restored" ] || continue
  t=$(cat "$d/tree")
  if [ "$t" = "$top" ]; then
    echo "REFUSED: run $d of tree $t was applied and not restored; recover it with step 4.6"
    blocked=1
  elif [ -d "$t" ]; then
    echo "REPORT ONLY: run $d of tree $t was applied and not restored; it may still be running, so never recover it from here"
  else
    echo "ABANDONED: run $d of tree $t was applied and not restored, and that tree no longer exists"
  fi
done
if [ "$blocked" = 0 ]; then
  mkdir -p "$S" && run=$(mktemp -d "$S/run.XXXXXX") && printf '%s\n' "$top" > "$run/tree" && echo "run folder: $run"
else
  false
fi
```

On a REFUSED line the command exits 1 and creates nothing: recover that run with 4.6 first. A
REPORT ONLY or ABANDONED line does not block; put it in the handoff.

**4.2. Prepare the variant outside the tree.** Copy each file the variant changes into the run
folder, then edit the copies under `variant/` there, never the files in the tree. For a model
check, these files are the model and its config, together with every code file the broken model is
rewritten from; rewrite the model's actions from the changed code, each citing path:line.

```bash
run=<the run folder printed in 4.1>
cd "$(cat "$run/tree")" &&
for f in <each file the variant changes, as a path relative to the top folder>; do
  mkdir -p "$run/variant/$(dirname "$f")" && cp "$f" "$run/variant/$f" && printf '%s\n' "$f" >> "$run/files"
done
```

**4.3. Run the check once on the unchanged code.** It must pass. If it fails, stop: that failure is
a finding on the real code (step 5), and the check has now been seen to fail.

**4.4. Back up, swap in, run, restore and prove, in one command.** Put the check's command where
the block says. The block sets no `set -e`, so a failing check never skips the restore. A run
folder is used once: on a folder that was applied before, or that lists no files, the block prints
NOT STARTED and changes nothing.

```bash
run=<the run folder printed in 4.1>
ok=0
if [ -e "$run/applied" ] || [ ! -s "$run/files" ]; then
  echo "NOT STARTED: $run was used before or lists no files; start again from 4.1"
elif cd "$(cat "$run/tree")"; then
  ok=1
  while IFS= read -r f; do
    mkdir -p "$run/orig/$(dirname "$f")" && cp "$f" "$run/orig/$f" && [ -f "$run/variant/$f" ] ||
      { echo "NO BACKUP: $f; nothing in the tree was changed"; ok=0; }
  done < "$run/files"
fi
if [ "$ok" = 1 ]; then
  touch "$run/applied"
  while IFS= read -r f; do cp "$run/variant/$f" "$f"; done < "$run/files"
  ( <the check's command> )
  echo "CHECK EXIT STATUS: $?"
  while IFS= read -r f; do
    cp "$run/orig/$f" "$f"
    cmp -s "$run/orig/$f" "$f" || { echo "NOT RESTORED: $f in tree $PWD"; ok=0; }
  done < "$run/files"
  [ "$ok" = 1 ] && touch "$run/restored" && echo "RESTORED: every file in $run/files matches its copy in $run/orig"
fi
[ "$ok" = 1 ]
```

The restore uses plain `cp`, never `cp -p`: a restored file must get a new modification time, or a
build tool keeps outputs it built from the variant. Plain `cp` onto an existing file keeps that
file's mode. The per-file `cmp` is the proof that the tree is back: `git status` and `git diff` do
not show an untracked file left in its broken state. If the command is cut short, nothing restores
the tree on the spot: the next 4.1 in that tree refuses, and 4.6 recovers it. One limit is not
handled: another process that edits the same files while this command runs.

**4.5. Read the result.** The check must have failed in 4.4: for TLC, exit 12 and the line naming
the invariant ([TLC.md](TLC.md)); for an every-input check, a failing property. If it passed, the
check cannot see the break: fix the check, not the variant.

**4.6. Recover a run.** Only after a REFUSED line, a NOT RESTORED line, or a 4.4 command that was
cut short. The block changes into the tree the run names.

```bash
run=<the run folder to recover>
ok=0
if cd "$(cat "$run/tree")"; then
  ok=1
  while IFS= read -r f; do
    if cmp -s "$run/orig/$f" "$f"; then
      echo "ALREADY ORIGINAL: $f"
    elif cmp -s "$run/variant/$f" "$f"; then
      cp "$run/orig/$f" "$f" && cmp -s "$run/orig/$f" "$f" && echo "RESTORED: $f" ||
        { echo "NOT RESTORED: $f in tree $PWD"; ok=0; }
    else
      echo "CHANGED SINCE: $f in tree $PWD matches neither its original nor the variant; left as it is"
      ok=0
    fi
  done < "$run/files"
fi
[ "$ok" = 1 ] && touch "$run/restored" && echo "RUN RESTORED: $run"
```

A CHANGED SINCE file was edited after the variant went in, so copying the original back would lose
that edit. `diff -u "$run/orig/<f>" "$run/variant/<f>"` shows exactly what the variant changed: take
that change out of the file by hand, then mark the run with `touch "$run/restored"`, using the
literal run folder.

Commands: [git-rev-parse](https://git-scm.com/docs/git-rev-parse) (`--show-toplevel`),
[mktemp](https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html), the
POSIX utilities [mkdir](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/mkdir.html),
[cat](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/cat.html),
[dirname](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/dirname.html),
[touch](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/touch.html),
[cp](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/cp.html) (an existing target is
opened and truncated, so its mode stays),
[cmp](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/cmp.html) (exit 0 when
identical, `-s` prints nothing),
[diff](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/diff.html) and
[read](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/read.html) (`-r` keeps
backslashes), and the `for`, `while`, `if` and `( )` forms of the
[POSIX shell language](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html).

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

It uses the repo's real commands, paths and names, and leaves no placeholders, such as `<M>` from
TLC.md.

It tells the next agent how to tell a real bug from a modelling error: replay each step of the
counterexample against the code. A step the code cannot take means the model is wrong. It says the
sync commit moves only after the check is rerun against the new commit, never in a
documentation-only pass, and points to formal-check MAINTAIN.

**Clean-tree test.** Write the hash from `git rev-parse HEAD` as the sync commit only when
`git status --porcelain -- <covered files>` prints nothing. Otherwise write `none` in its place,
with the reason. Do not use `git diff --quiet HEAD -- <file>` for this: it exits 0 for an untracked
file ([git-status](https://git-scm.com/docs/git-status),
[git-diff](https://git-scm.com/docs/git-diff)).

## 8. Follow the project skill once

Run it as the next agent would, from the skill alone. A step that does not run is a defect in the
skill: fix it.

## 9. Hand off

Report what was checked, which tool and why, the bounds, the findings in plain words, the command,
what it does not cover, and any library added. Name the state root the run folders are under, and
list every REFUSED, REPORT ONLY, ABANDONED, NOT RESTORED and CHANGED SINCE line from step 4. CREATE does not edit the target repo's continuous integration (CI). A check that
needs a new toolchain, such as TLC, is reported with its command and "not in CI".
