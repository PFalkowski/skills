---
name: msys-path-conversion-mangles-git-rev-paths
description: On Windows Git Bash, `git show <ref>:<path>` silently becomes a bogus Windows path — set MSYS_NO_PATHCONV=1
type: tooling
---

In the Git Bash shell on this machine, MSYS path conversion rewrites arguments that look like paths
before git ever sees them. It turns `origin/main:.github/workflows/checks.yml` into
`origin\main;.github\workflows\checks.yml` — forward slashes to backslashes **and the colon to a
semicolon**, which destroys the `<rev>:<path>` syntax entirely.

Observed failure:

```
$ git show "origin/main:.github/workflows/checks.yml"
fatal: ambiguous argument 'origin\main;.github\workflows\checks.yml':
unknown revision or path not in the working tree.
```

The trap is that the symptom **looks like absence**. Piped into `grep`, the fatal is swallowed by
`2>&1 | grep <pattern>` and the command reports no matches — which reads exactly like "the file
does not contain that string", or "the file is not at that ref". During one fire this nearly
produced the opposite of the truth: `git ls-tree -r --name-only origin/main` listed the file, while
`git show origin/main:<the same path>` claimed it did not exist. Two git commands disagreeing about
one ref is the tell.

The fix:

```sh
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" git show "origin/main:.github/workflows/checks.yml"
```

This is the absence-of-evidence rule with a concrete cause: an empty result proves the check came
back empty, never that the thing is not there. Check the exit status — `128` here, not `1` — before
reading emptiness as a fact. See [[repo-ci-check-surface]].

A second, unrelated Windows quoting trap sits beside this one: a `cat > file <<'EOF'` heredoc whose
body contains prose apostrophes fails to parse through this tool with `unexpected EOF while looking
for matching '`. Write such files with the editor tool rather than a heredoc.
