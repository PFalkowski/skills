# ADR-0001: Agent state lives outside the tree; deliverables and PRs carry the record

- **Status:** Accepted
- **Date:** 2026-09-11
- **Proposed:** 2026-09-07
- **Deciders:** repo owner
- **Migration:** tracked in [#181](https://github.com/PFalkowski/skills/issues/181). Until it
  lands, [docs/agent-state.md](../agent-state.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md)
  still give the previous convention as the rule. `scripts/check-state-paths.sh` cannot tell the
  two apart: its scan skips a dot-directory preceded by `~`, `/`, `.` or `-`, so the new root is
  invisible to it in every qualified spelling, while it still requires the wholesale `.agents/`
  line in `.gitignore`. Read the decision below as where the repository is going, not as what the
  written rules say today.

## Context

Skills in this repository write two very different kinds of file into the repository they
are acting on. Some are things a human will read later — a decision record, a runbook, a
lesson. Some are only evidence that a run happened — a log, a journal, a lock, a
watermark. Today's standard, [docs/agent-state.md](../agent-state.md), separates them with
a good test and then puts the second kind in a bad place. This ADR keeps the test and
moves the place.

Four facts, all verified while writing this record, set the problem.

**Codex owns `.agents/`.** OpenAI's Codex reads *committed team skills* from
`$REPO_ROOT/.agents/skills` and personal skills from `$HOME/.agents/skills`
(<https://developers.openai.com/codex/skills>, now served from
<https://learn.chatgpt.com/docs/build-skills>). The current standard tells every managed
repo to add a wholesale `.agents/` line to `.gitignore`, which would untrack a team's
Codex skills. It also puts the `nights-watch` public-repo Hunt root at
`~/.agents/nights-watch/<repo-slug>/`, inside Codex's personal skills directory. This
repository's own README already links every skill into `~/.agents/skills/`, so the
collision is not hypothetical here.

**Ignored in-tree state dies with the worktree.** A gitignored file is per-checkout. A
repository that runs agents in per-task worktrees — this one and the managed repository
described below both do — loses every run's state the moment the worktree is swept. `sdlc-old-fashioned` already carries a
ritual around this hole: copy the run logs out and file the backlog's open items *before*
proposing the worktree be removed (`sdlc-old-fashioned/SKILL.md`, Step 0.7 and Phase 13).
A ritual is not a fix.

**A managed repo already gives `.agents/` the opposite meaning.** A private repository
managed by these skills settled, in a noise-reduction campaign of its own, on `.agents/`
as a *tracked* tier for agent process records — a dozen or so files on its default branch,
including `.agents/INDEX.md`, several `RUNBOOK.md`/`INDEX.md` pairs, and
`.agents/recurring-backlog.md` — while ignoring only `.agents/*/runs/`. The same directory
name means "always committed" there and "never committed" here.

**Reasoning already has a durable home, and committing it has been rejected twice in
practice.** The `manager` skill's rule 7 requires every decision to be written twice: once
in its journal and once on the PR or ticket the decision concerns. So the journal is a
local ledger whose durable copy is GitHub. In one managed repository, a
documentation-truth pull request deleted dozens of files and several thousand lines of
`docs/sdlc/` process records; a later lifecycle run re-added roughly 1,900 lines there
across its phase commits, and a review finding removed every one of them again before
merge, on the same grounds. `docs/sdlc/` is empty on that repository's default branch
today. Meanwhile its `.agents/manager/journal.md` is tracked and needed a pull request of
its own, still open, just to persist one run's entries.

### Part 1 — inventory: what is written where today

One tree per persistence plane, for two repositories side by side. Each entry carries the
audience that reads it — `[agent]`, `[human]` or `[both]`; each plane header says what the plane
is and what it outlives. Entries marked **≠** are where this repository's skill defaults and the
managed repository's practice disagree, and are listed after the trees.

**1. Skill defaults (this repository).**

```text
<repo>/                              tracked in-tree · outlives commit, branch, PR, worktree
├── CLAUDE.md · AGENTS.md · CONTEXT.md          [both]  harness instructions, domain context
├── LESSONS-LEARNED.md                          [both]  postmortem lessons
├── docs/
│   ├── adr/ · runbooks/                        [both]  decision records, runbooks
│   ├── recurring-backlog.md                    [both]  the schedule a human reads
│   ├── plans/ · loops/<subject>/               [both]  report links, relay-loop handoffs
│   └── <process>/INDEX.md                      [agent] recurring-improvement indexes
├── prompts/backlog.md · prompts/<slug>.md · backlog.md   [human] prompt-backlog, nightshift
├── .out-of-scope/ · .nights-watch/library/     [both]/[agent] rejected requests, curated facts
└── .claude/settings.json · workflows/*.js      [both]/[agent] project settings, workflow defaults

<repo>/                              gitignored in-tree · dies with the worktree
├── .claude/settings.local.json                 [both]  personal harness settings
└── .agents/
    ├── skills/                              ≠  [agent] Codex team skills, swallowed by the ignore line
    ├── sdlc-old-fashioned/runs/ · backlog.md   [agent] phase logs, briefs, run backlog
    ├── nights-watch/journal.md · chronicles/ · locks/ · hunts/   [agent]
    ├── housekeeping/chronicles/                [agent]
    ├── manager/journal.md                      [agent]
    ├── recurring-improvement/backlog.md        [agent]
    └── sdlc-workhorse/backlog.md · chronicles/ [agent]

~/                                   outside the tree · outlives everything in the repo; per machine
├── .agents/nights-watch/<repo-slug>/           [agent] public-repo Hunt root ← inside Codex's ~/.agents/
├── .agents/skills/                             [agent] Codex personal skills (another harness)
├── .claude/settings.json · .claude/skills/     [both]  user settings, skill install target
└── .loyal-dog/ · HANDOVER-ALL.md               [both]  loyal-dog memory (archived), session dumps

GitHub                               permanent · linked to the merge commit
└── PR body · PR comments · issues              [both]  findings, verdicts, decisions

~/.claude/projects/<encoded-cwd>/<session-id>.jsonl   harness session dir · transcripts [agent]
```

**2. A private repository managed by these skills** (worked example, read-only inventory);
its outside-the-tree, GitHub and session planes match the defaults, its in-tree ones do not.

```text
<repo>/                              tracked in-tree · outlives commit, branch, PR, worktree
├── CLAUDE.md · AGENTS.md · CONTEXT.md · LESSONS-LEARNED.md   [both]
├── docs/
│   ├── adr/ (84 files) · runbooks/ (10 files)  [both]
│   └── agents/ (5 files)                    ≠  [agent] house guides with no counterpart in the defaults
├── prompts/ (2 files)                          [human] input backlogs
├── .nights-watch/
│   ├── library/ (68 files)                     [agent] curated facts
│   └── chronicles/ (64 files)               ≠  [agent] ignore line present, the files tracked anyway
├── .agents/
│   ├── INDEX.md · <process>/RUNBOOK.md · INDEX.md   ≠  [agent] workspace and process indexes
│   ├── recurring-backlog.md                 ≠  [both]  the schedule, at the spelling the defaults retired
│   └── manager/journal.md                   ≠  [agent] needed a pull request of its own to persist
└── .claude/settings.json                       [both]  no env block

<repo>/                              gitignored in-tree · dies with the worktree
├── .agents/*/runs/ · .claude/worktrees/        [agent] run reports, per-task worktrees
└── docs/sdlc/runs/                          ≠  [agent] ignored, and docs/sdlc/ itself is absent
```

Where the defaults and the managed repository disagree:

1. `.agents/` — one gitignored subtree in the defaults, three **≠** entries in the managed
   repository's *tracked* tree: "never committed" in one, "always committed" in the other.
2. `.agents/recurring-backlog.md` **≠** — the defaults retired that exact spelling as a
   bare, non-conforming path and put the schedule at `docs/recurring-backlog.md`.
3. `.agents/manager/journal.md` — gitignored in the defaults, **≠** tracked in the managed
   repository, where persisting one run's entries needed a pull request of its own.
4. `docs/agents/` **≠** — tracked there, no line anywhere in the defaults trees: the standard
   names no home for agent-facing prose that is not run state.
5. `.nights-watch/chronicles/` **≠** — the ignore line matches the defaults, yet the entry
   sits in the *tracked* tree: 64 files committed before the line was added are still tracked.
6. `docs/sdlc/` **≠** — the defaults retire `docs/sdlc/runs/` to `.agents/sdlc-old-fashioned/runs/`;
   that repository removed such records twice on review, so the two agree only by accident.
7. `.agents/skills/` **≠** in the defaults' gitignored tree — Codex's committed team-skill
   directory, caught by the wholesale ignore line; latent until a managed repo adds it.

## Decision

**1. The line.** By the time a pull request is opened, everything a future reader needs is
either committed in that PR or posted on it — in the body, in a comment, or on a linked
issue. Everything else is run state and may be deleted at any moment after merge. No
artifact is durable because a file happens to survive; it is durable because it was
published.

**2. Always source-controlled, never movable.** `CLAUDE.md` and `AGENTS.md`, decision
records, runbooks, `LESSONS-LEARNED.md`, the Night's Watch Library, agent-facing house
guides under `docs/agents/`, and the human-authored input backlogs — `prompt-backlog`'s
`prompts/backlog.md`, `nightshift`'s `backlog.md`, and the recurring-improvement schedule.
Audience does not decide persistence. The test is the existing one: would a human read this
later without knowing a run happened? A guide written for agents is still a deliverable.

**3. Reasoning and evidence are posted, not committed.** Root-cause analysis, spec, plan,
review notes, verdicts, and fix status go onto the PR at publish time. They are not
committed into the tree and they do not merely sit in state until the worktree is swept.
This makes explicit what those two reviews already enforced by hand.

**4. The default state root moves outside the tree**, to
`~/.agent-state/<repo-slug>/<skill>/`. No harness claims that name. `AGENTS_STATE` becomes
the in-tree opt-in rather than an escape hatch: a team that wants state in the checkout
sets `AGENTS_STATE=.agent-state` in the `env` block of the committed
`.claude/settings.json`, so every clone and every worktree inherits it. A personal override
goes in `~/.claude/settings.json`. Skill-specific variables such as `MANAGER_STATE` keep
precedence over `AGENTS_STATE`, which keeps precedence over the default. There is no
folder-presence detection.

**5. First run in a repo with no setting.** Use the default and say so in the run's report,
in one line: where the state root is, and which setting flips it in-tree. An interactive run
may ask instead and write the answer into the setting. A headless run never prompts.

**6. Permissions.** One line in the user's `~/.claude/settings.json`:
`permissions.additionalDirectories: ["~/.agent-state/"]`, so `Write` and `Edit` there never
prompt. `Bash` writes there already do not.

**7. `scripts/check-state-paths.sh` follows the decision.** The default root it enforces
changes; `.agents/<slug>/` joins the retired-paths table under the existing one-release
read-fallback rule; the assertion that the repo's `.gitignore` carries a wholesale
`.agents/` line is dropped; and the check must never flag `.agents/skills/`, which belongs
to Codex, in any repository.

**8. Managed repos migrate separately.** A managed repository that has made `.agents/` a
tracked tier renames it in a follow-up of its own: process runbooks join `docs/agents/`,
still-open INDEX identifiers become issues, and the manager journal becomes run state. That
is that repository's own ADR to write, referenced here as a consequence, not decided here.

### Target state — the same planes, one set of trees

```text
<repo>/                              tracked in-tree · outlives commit, branch, PR, worktree
├── CLAUDE.md · AGENTS.md · CONTEXT.md · LESSONS-LEARNED.md   [both]  instructions, lessons
├── docs/
│   ├── adr/ · runbooks/                        [both]  decision records, runbooks
│   ├── agents/                                 [agent] agent-facing house guides
│   └── recurring-backlog.md                    [both]  the schedule a human reads
├── prompts/backlog.md · backlog.md             [human] input backlogs (prompt-backlog, nightshift)
├── .out-of-scope/ · .nights-watch/library/     [both]/[agent] rejected requests, curated facts
├── .agents/skills/                             [agent] Codex team skills — never ignored
└── .claude/settings.json                       [both]  env.AGENTS_STATE picks the state root

GitHub                               permanent · posted at publish time, before the PR opens
└── PR body · PR comments · issues  [both]  RCA, spec, plan, review notes, verdicts, findings, fix status, decisions

~/.agent-state/<repo-slug>/<skill>/  outside the tree · the default; outlives the worktree, until deleted
├── runs/ · backlog.md                          [agent] phase logs, briefs, run backlogs
├── journal.md                                  [agent] manager and Night's Watch journals
├── locks/ · hunts/                             [agent] locks, watermarks, ledgers
└── chronicles/                                 [agent] chronicles, field notes, workflow defaults

<repo>/.agent-state/<skill>/         gitignored in-tree · the opt-in; dies with the worktree
└── the same subtree as above                   [agent] chosen by env.AGENTS_STATE=.agent-state

~/.claude/settings.json                               personal state-root override [both]
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl   harness session dir · transcripts [agent]
```

## Alternatives considered

- **Keep `.agents/` ignored wholesale.** Rejected: it untracks a team's Codex skills at
  `.agents/skills/`, and the `~/.agents/nights-watch/<repo-slug>/` Hunt root squats inside
  Codex's personal skills directory.
- **Narrow to `.agents/state/<slug>/`.** Rejected: it still squats in a directory another
  harness owns, and it still dies with the worktree, which is the more expensive half of the
  problem.
- **`.agent-state/` in-tree as the default.** Rejected: a fresh name fixes the clash but not
  the lifetime — it still dies with the worktree and still needs a `.gitignore` line in every
  managed repo. Kept as the opt-in, not the default.
- **Prompt at install time.** Rejected: installation is per machine and the choice is per
  repository, so one answer would be applied to every repo the machine ever touches.
- **Detect a folder marker.** Rejected: a fresh worktree has no marker and would silently
  choose the wrong root, and a repo where both roots exist is ambiguous with no rule to break
  the tie.
- **Commit the spec and plan.** Rejected in practice twice already: in one managed
  repository a documentation-truth pull request deleted dozens of such files, and a later
  run's review finding deleted the rest, both on the grounds that the pull request and the
  ADR already carry the record.

## Consequences and migration

Tracked as [#181](https://github.com/PFalkowski/skills/issues/181). Teaching
`scripts/check-state-paths.sh` the new root comes first, not because the others fail without it but
because without it nothing verifies them: the check walks only top-level directories holding a
`SKILL.md`, so it never reads `docs/agent-state.md`, and a skill moved to the new root passes it
silently.

- [ ] Rewrite [docs/agent-state.md](../agent-state.md): new default root, `AGENTS_STATE` as
      the in-tree opt-in, the publish-at-PR-time rule, `docs/agents/` named as a deliverable
      home. `CONTRIBUTING.md`'s "Where skill run logs and state go" section repeats the old
      root and moves with it.
- [ ] Update `scripts/check-state-paths.sh` and `scripts/check-state-paths.test.sh`: new
      default root, no `.gitignore` assertion, an explicit exemption for `.agents/skills/`.
- [ ] Add `.agents/<slug>/` to the retired-paths table with the one-release read fallback,
      and keep the retired `.nights-watch/` lines for the same window.
- [ ] Update the path prose in `sdlc-old-fashioned`, `nights-watch`, `manager`,
      `housekeeping`, and `recurring-improvement`, including
      `sdlc-old-fashioned`'s "confirm the repo's `.gitignore` carries the wholesale line"
      step in Phase 1 and its copy-the-logs-out ritual, which the move makes unnecessary.
- [ ] Update the workflow defaults in `.claude/workflows/` — these are values in code, not
      prose, so the check cannot see them; change the script and its header example together.
- [ ] Add `permissions.additionalDirectories: ["~/.agent-state/"]` to the documented
      `~/.claude/settings.json`, and to `auto-mode-setup`'s guidance.
- [ ] Managed repos keep their existing `.agents/` and `.nights-watch/` gitignore lines for
      one release so a clone written by the previous version keeps its logs out of the diff.
- [ ] Any managed repository that tracks an `.agents/` tier writes its own follow-up ADR:
      process runbooks to `docs/agents/`, open INDEX identifiers to issues, manager journal
      to run state, and any already-tracked `.nights-watch/chronicles/` files resolved one
      way or the other.
- [x] ~~Rebase the open skills PR #170 ("three lessons from one lifecycle run") onto this
      decision.~~ Moot as written: #170 merged on 2026-09-09, before this ADR was accepted. It
      left the path prose byte-identical, so the sweep above does not touch what it did change,
      which is the item below.
- [ ] Reconcile `sdlc-old-fashioned` with decision 3. PR #170 made `docs/sdlc/` the default home
      for the spec, plan, review notes and retro, committed on the branch
      (`sdlc-old-fashioned/SKILL.md`, `references/handover-protocol.md`). This ADR says those are
      posted to the pull request and not committed into the tree. An agent following the skill
      today does the opposite of the accepted decision, so one of the two has to give.
