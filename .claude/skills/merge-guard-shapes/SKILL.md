---
name: merge-guard-shapes
description: 'Rerun or update the every-shape check of merge-guard after changing how it reads a command.'
---

# merge-guard shapes: one check for how the guard reads a merge command

Built with [formal-check](../../../formal-check/SKILL.md) CREATE. Use it when you change
`merge-guard/scripts/merge-guard.js`, or when a newer `gh` accepts a new way to write the command.

- **Promise.** For every shape in which `gh pr merge` can name a literal pull request (PR),
  merge-guard looks up the PR and the repository that `gh` would merge.
- **Harm.** A shape the guard misreads merges a PR whose head no review saw, or is judged by the
  reviews of the same PR number in another repository.

## Run it

From the top folder of the repo:

```bash
node --test merge-guard/scripts/merge-shapes.test.js
```

It prints its bound, `bound: 14400 commands, the longest 158 characters`, and passes. On a failure
it says how many commands were misread and prints the first one.

## What a pass covers

It is an every-input check by bounded exhaustive enumeration. It runs the real `reason` function
with a stub in place of the `gh pr view` call, and no model. A pass covers exactly the commands
this grammar builds, 3 × 2 × 25 × 6 × 4 × 2 × 2 = 14400:

| Part | Values |
|---|---|
| Line before the command | none, ``SHA=`git rev-parse HEAD` ``, `cd C:\src\` |
| Executable | `gh`, `gh.exe` |
| Repo flag | none, or one of `-R o/r`, `--repo o/r`, `--repo=o/r`, `--repo="o/r"`, `-R=o/r`, `-Ro/r` in one of four places: before `pr`, before `merge`, before the PR, after the PR |
| Gap between words | one space, two spaces, a tab, a backslash and a new line, a backtick and a new line, a backtick and a Windows line ending |
| Option before the PR | none, `--squash`, `--subject "fix 7"`, `--match-head-commit a1b2c3d` |
| PR | `42`, `https://github.com/o/r/pull/42` |
| Tail | none, `--delete-branch` |

For each command the guard must ask for exactly that PR in exactly that repository, once, and must
refuse the merge when the PR has no review summary.

**Assumption.** `gh` accepts every one of these shapes. That was checked by hand on `gh` 2.106.0
with `pr view`, which only reads, in place of `pr merge`: the flag before `pr`, between `pr` and
the next word, attached as `-Ro/r`, and written with `=`. A backslash before a new line continues a
command only in bash, and a backtick only in PowerShell; the grammar builds both in every shape,
because the guard reads commands for both shells without knowing which one it has.

**Left out.** The check says nothing about:

- two repo flags in one command;
- short flags written as one group, such as `-sR o/r`: the guard does not read the repository
  from a group;
- a quoted or escaped word, a variable, an alias, a wrapper script, or a merge through `gh api`;
- what the guard decides once it has the PR: `merge-guard/scripts/merge-guard.test.js` covers
  that with examples.

## Coverage record

`merge-guard/scripts/merge-guard.js`: the patterns `REPO`, `MERGE` and `CONTINUATION`, the functions
`unquote` and `target`, and the first two lines of the loop in `reason`. The check itself is
`merge-guard/scripts/merge-shapes.test.js`.

Sync commit: 294453ec40b68d2f40734ce9f762bbeda584048a

The sync commit moves only after the check is rerun against the new commit, never in a
documentation-only pass. [MAINTAIN](../../../formal-check/MAINTAIN.md) says how to bring the check
back in line after the code changed.

## A failure: real bug or wrong grammar

A failure names one command. Write the same shape with `pr view` in place of `pr merge` and a real
repository and PR, and run it. If `gh` accepts the shape, the guard misreads a command an agent can
write: that is a bug in the guard. If `gh` rejects it, the grammar builds a command nobody can run:
fix the grammar in the test, not the guard.

## Shown able to fail

On 2026-11-27, in a scratch copy, each of seven broken variants of the guard failed the check.
The count is the commands misread:

- no repo flag accepted before `pr`: 3456;
- no repo flag accepted between `pr` and `merge`: 3456;
- line continuations not joined: 7200;
- line continuations joined with nothing in place of a space: 9600;
- no Windows line ending accepted in a continuation: 2400;
- an attached `-R` value not read: 2304;
- a repo value left in its quotes: 2304.

The guard before this check existed misread 11808.
