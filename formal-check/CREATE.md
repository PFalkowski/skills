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

## 4. Show it able to fail, in a scratch copy

A broken variant is a scratch change to the real code, such as a removed check or a reordered
step. Make it and run it in a scratch copy of the code. No command in this step writes to the
working tree, so uncommitted work is never at risk. Never edit the working tree to show a check
failing, and never use `git stash`, `git checkout -- <file>` or `git reset` here.

The blocks below are bash. Shell variables do not last from one command to the next, so each
later block starts from the two literal paths the first one prints.

**4.1. Make the scratch copy.** Run from inside the target repo.

```bash
top=$(git rev-parse --show-toplevel) && scratch=$(mktemp -d) &&
  git -C "$top" checkout-index -a --prefix="$scratch/" &&
  echo "top folder: $top" && echo "scratch copy: $scratch"
```

The copy holds every tracked file as the index has it. It is a plain folder in the system temp
folder, with no `.git` folder in it. It stays there after this step: remove it when you no longer
need it.

**4.2. Copy in what the index does not hold.** Changes that are not staged, and files git does not
track, are not in the copy. Copy the covered files, the check's own files and, for a model check,
the model and its config from the working tree into the copy. `git status --porcelain` lists every
file that differs from the index: copy each one the check reads.

```bash
top=<the top folder printed in 4.1>
scratch=<the scratch copy printed in 4.1>
if cd "$top" && [ -d "$scratch" ]; then
  for f in <each file, as a path relative to the top folder>; do
    mkdir -p "$scratch/$(dirname "$f")" && cp "$f" "$scratch/$f" || echo "NOT COPIED: $f"
  done
else
  echo "NOT STARTED: the top folder or the scratch copy is missing"
  false
fi
```

**4.3. Run the check in the copy, unchanged.**

```bash
scratch=<the scratch copy printed in 4.1>
( cd "$scratch" && <the check's command> )
echo "CHECK EXIT STATUS: $?"
```

It must pass. A pass also shows that the check runs in the copy. If it fails, run the check in the
working tree:

- It fails there too: stop. That failure is a finding on the real code (step 5), and the check has
  now been seen to fail.
- It passes there: the copy lacks something the check needs, usually installed dependencies or
  build outputs that git ignores. Set them up in the copy the way the repo's own instructions say,
  then run this block again. If the check cannot be made to pass in a copy, stop and report that
  it was not shown able to fail.

**4.4. Put the variant in the copy.** Edit the files under the scratch copy, by their full paths
there, never the files in the working tree. For a model check, change the code in the copy, then
rewrite the model's actions in the copy from that changed code, each citing path:line. Then print
the variant:

```bash
top=<the top folder printed in 4.1>
scratch=<the scratch copy printed in 4.1>
sleep 1
for f in <each file the variant changes, as a path relative to the top folder>; do
  touch "$scratch/$f"
  diff -u "$top/$f" "$scratch/$f"
done
```

What it prints is the variant, and it goes in the handoff. `diff` exits 1 for a file that differs,
which is expected here. A file that prints nothing is the same in both places: the variant is not
in the copy. The block also waits a second and then gives each changed file a new modification
time. Without that, a tool that judges by time can run the check on what it built from the
unchanged file: Python kept its bytecode when a variant of the same size was written in the same
second as the copy.

**4.5. Run the check in the copy again,** with the block from 4.3. It must fail: for TLC, exit 12
and the line naming the invariant ([TLC.md](TLC.md)); for an every-input check, a failing property.
If it passes, the check cannot see the break: fix the check, not the variant.

**What step 4 does not handle:**

- a check that needs git history: the copy has no `.git` folder;
- submodules, and files git ignores such as installed dependencies: the copy holds them only if
  you put them there;
- a check that cannot run outside the working tree: it is reported as not shown able to fail.

Commands: [git-rev-parse](https://git-scm.com/docs/git-rev-parse) (`--show-toplevel`),
[git-checkout-index](https://git-scm.com/docs/git-checkout-index) (`-a` writes every file in the
index, `--prefix` writes them under another folder),
[git-status](https://git-scm.com/docs/git-status) (`--porcelain`),
[mktemp](https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html), the
POSIX utilities [mkdir](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/mkdir.html),
[dirname](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/dirname.html),
[cp](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/cp.html),
[diff](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/diff.html) (exit 1 when the
files differ), [sleep](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/sleep.html),
[touch](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/touch.html),
[echo](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/echo.html),
[cd](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/cd.html),
[test](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/test.html) (written `[ ]`) and
[false](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/false.html); and the `for`,
`if` and `( )` forms of the
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
TLC.md. The one value filled at run time is TLC.md's work folder, taken from the output of its
download block.

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
what it does not cover, and any library added. For step 4, give the scratch copy's path, the
variant as `diff` printed it, and the check's result before and after the variant. CREATE does not
edit the target repo's continuous integration (CI). A check that needs a new toolchain, such as
TLC, is reported with its command and "not in CI".
