---
name: auto-mode-setup
description: 'Configure unattended agent permissions and deny rules once per machine.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# auto-mode-setup

Auto mode delegates approval to a classifier. **Write deny rules first:** anything not denied may be approved. Allowlists provide convenience, not containment.

## Four facts that determine the layout

If behavior differs, verify against `code.claude.com/docs/en/permissions`:

1. Project settings do not cascade: `.claude/settings.json` resolves from session start; `.claude/settings.local.json` from git root. A non-repo parent reaches no child repos. Only `~/.claude/settings.json` reaches all repos.
2. Project `defaultMode: "auto"` is ignored and can suppress the user's default. Put it only in user/managed settings.
3. Across scopes: deny > ask > allow, first match wins; specificity cannot override deny. A broad push deny defeats a narrow push allow.
4. Project allows require workspace trust; deny/ask rules apply regardless.

## Workflow

### 1. Inventory the tree

Enumerate repos under the target root, marking worktrees and scratch clones. Report the count before writes, especially large trees (e.g. 70+ repos).

### 2. Mine what is actually run

```bash
node scripts/mine-permissions.mjs            # defaults to ~/.claude/projects
node scripts/mine-permissions.mjs --top 60 --json
```

The miner streams transcripts, splits Bash/PowerShell commands on `|`, `;`, `&&`, and ranks command pairs as read-only/mutating/dangerous. Derive additional allows only from read-only entries. Omit built-in unprompted reads (`ls`, `cat`, `echo`, `pwd`, `head`, `tail`, `grep`, `find`, `wc`, `which`, `diff`, `stat`, `du`, `cd`, read-only git).

Frequency is not safety: `docker run`/`dotnet run` are not globally safe. Baseline `git push` is an explicit exception requiring paired deny rules and accepted gaps, including bundled short flags such as `-fd`; read [BASELINE.md](BASELINE.md).

### 3. Write the user-scope baseline

Back up `~/.claude/settings.json` and preserve unrelated model/status/effort/plugin keys. Read BASELINE for deny, ask, and universally safe allow sets. Keep `defaultMode: "auto"` here. Do not omit ask rules for commands safe only under supervision (e.g. `terraform apply`): they must stall unattended runs without disabling interactive use.

### 4. Write per-repo overrides

Builds, tests, deploys, and paid/shared services belong in each repo's `.claude/settings.json`, never the baseline. Commit these except:

- Gitignored `/.claude/*`: respect the ignore, do not force-add; report local-only coverage.
- Detached HEAD: leave edits uncommitted and flag them.
- Accumulated `settings.local.json` grants: do not clean them; baseline deny/ask overrides apply. Report overlapping grants.

Stop and report these cases rather than circumventing them.

### 5. Verify before trusting it

- In an interactive sample repo, run `claude --debug`; inspect actual mode and `Applying permission update: Adding N allow rule(s) to destination 'userSettings' / 'projectSettings' / 'localSettings'` messages. `--debug -p` emits no such lines; never claim this check from a headless run.
- Headless alternative: provoke a denied operation in a **throwaway directory**, then verify refusal **and unchanged target**. For destructive git forms, initialize a temporary repo with one untracked file and assert it survives. Transcript denial alone is insufficient.
- Check for `Ignoring N permissions.allow entries from .claude/settings.json: this workspace has not been trusted`. New project settings can re-arm trust; a human must accept interactively. Never set `hasTrustDialogAccepted` yourself. Deny/ask remain active.
- Verify denied operations from both repo and worktree.

Report configured/skipped repos, observed verification, and remaining prompts. Files alone do not prove enforcement.

## Where deny rules do not save you

Explain at handover: Read/Edit denies cover native tools and recognized Bash file commands, not Python/Node subprocess file access. For unattended work around real secrets, enable OS-level sandbox enforcement. Docker and package lifecycle scripts also escape many rules and require conscious per-repo grants.

`Bash(git:* push)` matches nothing useful: `:*` works only at a pattern's end; elsewhere its colon is literal.

## See also

[BASELINE.md](BASELINE.md) contains rule sets/rationale. `nights-watch`, `nightshift`, and `go-go-go` consume this setup. Use `update-config` for one setting rather than whole-tree setup.
