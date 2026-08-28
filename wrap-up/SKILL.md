---
name: wrap-up
description: 'End-of-session closer: ships outstanding work, sweeps session scaffolding, files what''s still open in the tracker or a handoff-lite block, and routes skill feedback and memory updates. Triggers: "wrap it up", "close the session", "we''re done here", "tidy up and finish".'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# wrap-up

Three passes, in order: **ship** (nothing valuable exists only on this machine), **sweep** (no dead
scaffolding left behind), **account** (nothing promised is silently dropped). The passes are ordered
so that nothing pass 2 deletes is something pass 1 should have shipped or pass 3 still needs.

## Scope first

Before touching anything, state in one line:

- **Project**: the repo(s) this session actually worked in — never every repo on the machine.
- **Session scope**: the branches, worktrees, stashes and files this session created or modified.
  Anything older or belonging to another session is out of bounds unless the user widens the scope
  explicitly ("clean up everything stale" widens it; silence does not).

## Pass 1 — ship: committed, pushed, PRed

Inventory the project repo(s):

- Dirty and untracked files: `git status --short` — including inside session worktrees.
- Unpushed commits: `git branch -vv` ahead markers; `git log @{u}..` per session branch.
- Pushed branches with no PR: `gh pr list --head <branch>`, or the az repos / house equivalent.
- Stashes this session created: `git stash list`.

Classify every finding as **work** (commit → push → PR), **junk** (delete), or **park** (leave in
place, carried into pass 3). Do not guess the boundary: present the full list with a per-item
recommendation and let the user decide what to push and what to delete. Deletion is the
irreversible branch — each delete needs its own yes; pushes may be batch-approved. If the user is
not present, ship the work items and park everything ambiguous; delete nothing.

## Pass 2 — sweep: worktrees and branches

Run only when pass 1 leaves nothing outstanding in scope. Project-only, session-scope-only.

- Worktrees this session created, once clean and their branch is pushed or merged:
  `git worktree remove <path>`, then `git worktree prune`. A dirty worktree is a pass-1 escape —
  go back, don't force. Also sweep empty leftover directories under the worktrees root.
- Local branches whose work has landed: `git branch -d` — the merged-only form. Deleting an
  unmerged branch is the user's call to make explicitly, never a cleanup default.
- `git fetch --prune` to drop remote-tracking refs of branches deleted on the host.

Guard: if a pass-3 open item references a worktree or branch, it survives the sweep — say so.

## Pass 3 — account: the conversation ledger

Re-read the conversation and collect what is still open: tasks requested, promises made ("I'll…",
"next we should…"), assumptions stated as future work, items parked in pass 1. An item is done only
if the transcript shows it verified done — command output, not a claim.

Route everything open per house rules:

- **A tracker is in use** — determined from CLAUDE.md, the remote host, or existing issues
  (GitHub issues / Azure Boards / Jira). Draft one issue per item — title, the context a stranger
  needs, one acceptance line — show the drafts, get a yes, then post.
- **No tracker, or the user declines**: emit a `handoff-lite` block inline (that skill defines the
  format — open action points with only stated reasons and risks, plus the recent exchange).

Ordering: the user's stated priority wins; absent one, blockers first.

### Skill evolution

The session is also evidence about the skills it used. If a skill from this set misfired, needed a
correction mid-run, or drew feedback ("it should also…", "next time do X"), that is an open item —
route it upstream to the set's home repo, https://github.com/PFalkowski/skills, not into a local
note that dies with the session:

- **Default**: raise a GitHub issue there — name the skill, the observed behaviour, the desired
  one, and quote the user's feedback verbatim.
- **The user is the author or a contributor of that repo**: raise a PR instead — apply the
  generalized edit to the skill's canonical source and open it (the `evolve-skill` skill defines
  the discipline: edit the source of truth, strip private specifics, keep it generic).

Same gate as every outward action: show the draft issue or diff first.

### Memory

Persistent memory is part of the ledger. Review the entries this session touched:

- **Relied on and confirmed** — leave it alone.
- **Contradicted** — the session proved an entry wrong or stale (a renamed flag, a reversed
  decision, a fact that no longer holds): update or delete it now. A stale memory misleads every
  future session, which is worse than no memory.
- **Lesson learned** — the session taught something durable that the repo itself does not record
  (a user preference, a corrected approach, a constraint): write it, following the house memory
  discipline (one fact per entry, why + how to apply, indexed).

## Rules

- Scope statement before the first action; nothing deleted without a per-item yes.
- `git branch -d`, never `-D`; `git worktree remove` without `--force`; push, never force-push.
- Other sessions' branches and worktrees stay untouched however stale they look — wrap up only
  work this conversation can account for.
- Posting issues is outward-facing: drafts first, always. Unattended, post only if house rules
  name the tracker; otherwise emit the handoff-lite block to the log.
- An empty result is a valid result: "everything shipped, nothing to sweep, ledger clear" — one
  line, done.
