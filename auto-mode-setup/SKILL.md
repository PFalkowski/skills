---
name: auto-mode-setup
description: 'Configures a repository tree for unattended agent runs: sets permission allowlists and the deny rules that are the actual safety boundary. Run once per machine, or when the permission posture needs revisiting.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# auto-mode-setup

Unattended runs fail in two directions. Too few permissions and the agent stalls on a prompt at
02:00 with nobody watching. Too many and it force-pushes over a week of work. This skill sets both
edges deliberately, from evidence rather than guesswork.

## The one thing to get right first

**In auto mode the allowlist is a convenience. The deny list is the safety boundary.**

Auto mode hands the approve/reject decision to a classifier instead of a human. Anything you have
not denied may therefore be approved without you. So the deny list is the only part of this setup
that is load-bearing, and it is the part to write first. An allowlist merely saves latency on
commands the classifier would have waved through anyway.

Do this in the order below, not the reverse.

## Four facts that determine the layout

Confirm these against `code.claude.com/docs/en/permissions` if behaviour ever looks wrong; they are
the constraints the whole layout is built on.

1. **Project settings do not cascade down a directory tree.** `.claude/settings.json` is read from
   the directory the session starts in; `.claude/settings.local.json` resolves to the *git
   repository* root. A `.claude/` folder in a non-repo parent that merely *contains* many repos
   reaches none of them. **The only layer that reaches every repo is `~/.claude/settings.json`.**
2. **`defaultMode: "auto"` is ignored in project settings** — and worse, setting it there makes
   Claude Code fall back to the built-in default *instead of* the `defaultMode` in
   `~/.claude/settings.json`. Auto mode belongs in user settings or managed settings, nowhere else.
3. **Deny beats ask beats allow, first match wins, across every scope.** Specificity does not break
   the tie. A user-scope deny overrides a project-scope allow. A broad deny cannot carry a narrow
   allowlist exception — `Bash(git push:*)` denied blocks a `Bash(git push origin docs:*)` allow.
4. **Allow rules in project settings need workspace trust accepted for that folder.** Deny and ask
   rules apply regardless, because they only restrict.

## Workflow

### 1. Inventory the tree

List every git repo under the target root, and note which are worktrees or scratch clones. Report
the count before writing anything — a baseline over 70 repos deserves a moment's pause.

### 2. Mine what is actually run

```bash
node scripts/mine-permissions.mjs            # defaults to ~/.claude/projects
node scripts/mine-permissions.mjs --top 60 --json
```

It streams every session transcript, extracts each Bash/PowerShell command, splits on `|`, `;`,
`&&`, and reports `tool subcommand` pairs by frequency, split into **read-only**, **mutating**, and
**dangerous**. Derive the allowlist from the read-only column and nothing else.

Two things to remember when reading its output:

- Claude Code already runs a built-in read-only set without prompting — `ls`, `cat`, `echo`, `pwd`,
  `head`, `tail`, `grep`, `find`, `wc`, `which`, `diff`, `stat`, `du`, `cd`, and read-only `git`
  forms. Allowlisting those buys nothing. Drop them from the output before writing rules.
- High frequency is not the same as safe. `git push` and `dotnet run` will rank near the top of any
  real transcript set. Frequency tells you what to *consider*, never what to grant.

### 3. Write the user-scope baseline

`~/.claude/settings.json` — the deny list, the ask tier, and allow rules that are safe in literally
any repo. Copy the starting sets from [BASELINE.md](BASELINE.md); they are organised by what each
rule protects against, so you can defend or drop each one individually rather than pasting blind.

Do not skip the **ask** tier. It is where commands go that are fine under supervision and unsafe
without it — `terraform apply` being the archetype. Denying those breaks interactive work and gets
the rule deleted; putting them on `ask` makes an unattended run stall instead of proceed.

Keep `defaultMode: "auto"` here and only here.

Back the file up first and preserve every unrelated key — this file also carries the model,
status line, effort level, and plugin settings, and clobbering those is a bad trade for a
permission change.

### 4. Write per-repo overrides

Anything that builds, tests, deploys, or talks to a paid or shared service goes in that repo's
`.claude/settings.json` — never in the baseline. One repo's `dotnet test` is another repo's
`terraform apply`.

Commit these. They are as much a project artifact as the CI config, and an agent-ready repo should
stay agent-ready for the next person who clones it.

Three things a real tree will throw at you here, all of which mean *stop and report* rather than
work around:

- **The repo gitignores `/.claude/*`.** Some do, deliberately. The override still applies locally
  but will never travel to another machine or another person. Respect the ignore; say so in the
  report rather than force-adding the file.
- **The repo is in detached HEAD.** Committing produces an orphaned commit that the next checkout
  discards silently. Leave the edit in the working tree and flag it.
- **Existing `settings.local.json` holds hundreds of accumulated "don't ask again" grants.** These
  are not curated and frequently include `git push`, `git reset`, and prune commands. Do not try to
  clean them; the baseline's deny and ask rules override them from a higher scope, which is the
  whole point. Report the overlap so the user knows what changed.

### 5. Verify before trusting it

Never declare this done from the settings files alone. Prove it:

- `claude --debug` in a sample repo, confirm the mode and rules that actually loaded. The debug log
  prints each scope's rules as `Applying permission update: Adding N allow rule(s) to destination
  'userSettings' / 'projectSettings' / 'localSettings'` — read those lines, not the JSON you wrote.
  **This is interactive-only.** `claude --debug -p "…"` prints no permission lines at all, so an
  agent running this skill headlessly cannot complete this check and must not claim it did.
- Headless, substitute an observation that is stronger anyway: provoke one denied command in a
  **throwaway directory** and confirm both that it was refused *and* that its target is untouched.
  Check the target, not just the refusal — a rule that blocks after the command has already run
  looks identical in the transcript to one that blocks before. For a deny on a destructive command,
  `git init` a temp directory with one untracked file, run the denied form against it, and assert
  the file still exists.
- Watch for `Ignoring N permissions.allow entries from .claude/settings.json: this workspace has
  not been trusted`. Creating a project `settings.json` where none existed re-arms the trust
  dialog, so brand-new allow rules silently do nothing until a human accepts it once
  interactively. Deny and ask rules are unaffected. Never flip `hasTrustDialogAccepted` on the
  user's behalf to skip this — the dialog exists so a person reviews what is being granted.
- Deliberately trigger one denied command and confirm it is blocked — see the throwaway-directory
  note above; "it was denied" and "it did not run" are different claims.
- Confirm the deny list survives from the repo *and* from a worktree of it, since worktree
  resolution is the usual place a rule silently stops applying.

Report which repos were configured, which were skipped, and what remains prompting.

## Where deny rules do not save you

State this plainly when handing the setup over; it is the gap people assume is covered.

`Read` and `Edit` deny rules cover Claude's own file tools and the file commands it recognises in
Bash (`cat`, `head`, `sed`). **They do not cover a subprocess that opens files itself** — a Python
or Node script the agent writes and runs reads whatever the OS allows. If the tree holds real
secrets and the run is genuinely unattended, permission rules are not sufficient on their own;
enable the sandbox for OS-level enforcement.

Likewise, an agent that can run `docker`, or a package manager with a lifecycle-script hook, can
reach past most of the rules above. Both belong in per-repo settings, consciously.

## Anti-patterns

- Putting `defaultMode: "auto"` in project settings — silently disables the user-level setting.
- Building the allowlist first and treating the deny list as cleanup.
- One permissive baseline across client work and public repos alike, because it was less typing.
- `Bash(git:* push)` — the `:*` wildcard is only recognised at the end of a pattern; mid-pattern the
  colon is a literal and the rule matches nothing.
- Allowlisting the built-in read-only commands, which never prompted anyway.
- Declaring success without a `--debug` run proving which rules loaded.

## See also

- [BASELINE.md](BASELINE.md) — the concrete rule sets, each with the reason it exists.
- `nights-watch`, `nightshift`, `go-go-go` — the unattended runs this setup exists to serve.
- `update-config` — for a single setting or one-off permission change; reach for that instead when
  the job is not a whole-tree setup.
