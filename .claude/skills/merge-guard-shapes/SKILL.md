---
name: merge-guard-shapes
description: 'Rerun or update the every-shape check of merge-guard after changing how it reads a command.'
---

# merge-guard shapes: one check for how the guard reads a merge command

Built with [formal-check](../../../formal-check/SKILL.md) CREATE. Use it when you change
`merge-guard/scripts/merge-guard.js`, or when a newer `gh` accepts a new way to write the command.

- **Promise.** For every shape in which `gh pr merge` can name a literal pull request (PR),
  merge-guard looks up the PR and the repository that `gh` would merge, or refuses the command
  because it is split over lines.
- **Harm.** A shape the guard misreads merges a PR whose head no review saw, or is judged by the
  reviews of the same PR number in another repository.

## Run it

From the top folder of the repo:

```bash
node --test merge-guard/scripts/merge-shapes.test.js
```

It prints its bound, `bound: 28800 commands, the longest 158 characters`, and passes. On a failure
it says how many commands were misread and prints the first one.

## What a pass covers

It is an every-input check by bounded exhaustive enumeration. It runs the real `reason` function
with a stub in place of the `gh pr view` call, and no model. A pass covers exactly the commands
this grammar builds, 4 × 2 × 25 × 9 × 4 × 2 × 2 = 28800:

| Part | Values |
|---|---|
| Line before the command | none, ``SHA=`git rev-parse HEAD` ``, `cd C:\src\`, `x=1 \` |
| Executable | `gh`, `gh.exe` |
| Repo flag | none, or one of `-R o/r`, `--repo o/r`, `--repo=o/r`, `--repo="o/r"`, `-R=o/r`, `-Ro/r` in one of four places: before `pr`, before `merge`, before the PR, after the PR |
| Gap between words | plain: one space, two spaces, a tab. Split: a backslash and a new line, a backtick and a new line, a backtick and a Windows line ending. Nine cases: each of the six in every gap, and each split gap only in the gaps after `merge` |
| Option before the PR | none, `--squash`, `--subject "fix 7"`, `--match-head-commit a1b2c3d` |
| PR | `42`, `https://github.com/o/r/pull/42` |
| Tail | none, `--delete-branch` |

For a command with plain gaps, the guard must ask for exactly that PR in exactly that repository,
once, and must refuse the merge when the PR has no review summary. For a command with a split gap,
the guard must refuse without asking for any PR, and say to write the command on one line.

Two more tests in the same file pin cases outside the grammar. A PR number split in two by a mark
and a line break is never looked up as its first half. A second merge on the line after a merge
whose line ends in a mark is not let through.

**Why a split command is refused, not read.** A backslash before a new line continues a command
in bash, and a backtick does in PowerShell. The same marks also end a comment, a Windows path or a
command substitution, and then the next line is a command of its own. Three versions of this guard
joined split lines into one, and each misread something else for it: a line glued onto the one
before, a PR number cut in half, a second merge swallowed by the first. So the guard never joins
lines. It reads one line at a time and refuses a merge command that has a line ending in a mark.

**Assumption.** `gh` accepts every plain shape. That was checked by hand on `gh` 2.106.0 with
`pr view`, which only reads, in place of `pr merge`: the flag before `pr`, between `pr` and the
next word, attached as `-Ro/r`, and written with `=`.

**Left out.** The check says nothing about:

- two repo flags in one command;
- short flags written as one group, such as `-sR o/r`: the guard does not read the repository
  from a group;
- a quoted or escaped word, a variable, an alias, a wrapper script, or a merge through `gh api`;
- two merge commands on one line with nothing between them: `gh` rejects a second PR on a line,
  so nothing merges, and the guard reads only the first;
- what the guard decides once it has the PR: `merge-guard/scripts/merge-guard.test.js` covers
  that with examples.

A known cost: a merge command whose line ends in a backtick that closes a command substitution is
refused too, although it is on one line.

## Coverage record

`merge-guard/scripts/merge-guard.js`: the patterns `GAP`, `REPO`, `MERGE` and `SPLIT`, the functions
`unquote` and `target`, and the first three lines of the loop in `reason`. The check itself is
`merge-guard/scripts/merge-shapes.test.js`.

Sync commit: f7e7b70219f053e99ce73b12d899b4d1bbdd4a70

The sync commit moves only after the check is rerun against the new commit, never in a
documentation-only pass. [MAINTAIN](../../../formal-check/MAINTAIN.md) says how to bring the check
back in line after the code changed.

## A failure: real bug or wrong grammar

A failure names one command. Write the same shape with `pr view` in place of `pr merge` and a real
repository and PR, and run it. If `gh` accepts the shape, the guard misreads a command an agent can
write: that is a bug in the guard. If `gh` rejects it, the grammar builds a command nobody can run:
fix the grammar in the test, not the guard.

## Shown able to fail

On 2026-11-27, in a scratch copy, each of eight broken variants of the guard failed the check.
The count is the commands of the grammar misread:

- no repo flag accepted before `pr`: 6912;
- no repo flag accepted between `pr` and `merge`: 6912;
- a split command read up to the line break and not refused: 19200, and the second-merge test fails;
- no mark accepted between the words `gh`, `pr` and `merge`: 9600;
- no Windows line ending accepted after a mark between the words: 3200;
- no Windows line ending accepted after a mark at the end of a line: 6400;
- an attached `-R` value not read: 1536;
- a repo value left in its quotes: 1536.

The guard before this check existed misread 25344, and failed the second-merge test.
