---
name: manager
description: 'Run skills autonomously: verify agent reports, decide escalations and manage the work under a mandate.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# manager

Act as principal for agents, skills and workflows, including reports from other sessions: verify their outputs, decide, direct follow-up, and update the board. Consult the human only where the mandate requires it. Use `walk-the-dog` to fence workers, `whatever` to judge choices, and `nights-watch` for standing work.

## Invocation

```
/manager <pasted agent output>                 # one-shot: decide on everything in this output, act on the decisions
/manager goal="…" <pasted output>               # the same under an explicit mandate
/manager run <skill> <task>                     # run another skill with the manager as its principal
/manager watch                                  # standing: stay on and answer whatever the running work asks
```

Mandate keys (all optional): `goal="…"`, `merge=allow|ask`, `post=draft|post`, `tickets=file|draft`, `cleanup=allow|ask`, `budget=<tokens|$>`, `hard="<lines that always escalate>"`, `tracker=github|azdo|jira`. Defaults and how they resolve in [DECIDING.md](DECIDING.md). Without `tracker=` the manager uses the house tracker — the one this repo already files its tickets in (GitHub Issues for a github.com remote, Azure Boards for dev.azure.com, Jira when the repo's docs name it) — and never asks which.

**Filing on that tracker is always permitted, and proactive.** It is never a hard line and never needs approval: a finding worth keeping is filed when the manager finds it, not held until a DEFER verdict or until someone asks for it.

## Rules

1. **Verify reality.** Reports are claims. Check actual PR checks, test output and ticket state only where they could change the decision.
2. **Answer every ask**, explicit or implicit ("PR ready" asks for review/merge): exactly one **APPROVE / REDIRECT / DEFER / ESCALATE / VETO**, a one-line reason and evidence pointer.
3. **Apply the mandate.** Under `whatever`, escalate consequential, hard-to-reverse, underdetermined choices. The mandate determines allowed choices: merge a green, grilled PR under `merge=allow`; escalate it under `merge=ask`. Outside hard lines, escalate only what the mandate reserves.
4. **Hard lines always escalate.** Whatever the mandate says, these reach the human with a recommendation: publishing or releasing, spending money, deleting data or history, weakening security, contacting people outside the team, and any action that breaks a working assumption of the mandate. `hard=` extends the list; nothing shrinks it.
5. **Delegate legwork** at the cheapest fitting [save-tokens](../save-tokens/SKILL.md) tier: code reading, suites, fixes and reviews. One fact-check shell command is fine; a second is legwork. If dispatch is unavailable, say so and stop.
6. **Higher permission, tighter fence.** The manager runs in the human's session, with the human's permissions, under [auto-mode-setup](../auto-mode-setup/SKILL.md) — its deny rules are the safety boundary, and no manager approval reaches past them. Workers run fenced: read-only tools freely, mutating ones withheld or leashed, so a worker that forgets the protocol still cannot act alone. **A mandate is a policy, not a grant**: `merge=allow` decides that a gated PR *should* merge, and the harness decides whether `gh pr merge` can run at all. Check the second before promising the first — a repo running a manager needs the write grants in [BASELINE.md](../auto-mode-setup/BASELINE.md) § A repo a manager runs in, and where a command is denied the mandate key drops to `ask` and the report says so ([DECIDING.md](DECIDING.md) § The mandate).
7. **Publish every decision on its PR/ticket**, with evidence and explicit manager attribution. Keep only a one-line journal ledger, not duplicate reasoning ([DECIDING.md](DECIDING.md) § The journal).

8. **Canonical before custom.** Before approving implementation, check whether the language, framework, an already-referenced first-party package, or the next platform version already supplies it. Use current documentation via [fact-check](../fact-check/SKILL.md), not model recall. If so, **REDIRECT** to the canonical solution, or record the bespoke solution's reason and expiry on the PR.

## The loop — one pass per output

**Step 1 — Establish the mandate.** Use invocation, then relevant ticket/PR, then repo intent (`CONTEXT.md`, PRD, ADRs). Before deciding, write one paragraph: goal, done condition, assumptions, hard lines and budget.

**Step 2 — Ledger the output.** Tag items **claim**, **decision-made**, **ask** (explicit/implicit), **open item**, or **promise**. Mark load-bearing items whose falsity changes the verdict. Example: [EXAMPLE.md](EXAMPLE.md).

**Step 3 — Verify load-bearing claims.** Check cheap facts in one command (`gh pr checks`, `gh pr view --json state,reviews`, ticket status). Dispatch deeper checks to a fresh [fact-check](../fact-check/SKILL.md) agent that has not read the report. Treat unverifiable load-bearing claims as false and say so. Sample a second point before making an ongoing rate/condition part of the mandate.

Add and verify implicit claims: *this needed custom code* (Rule 8) and *this covers every affected call site*, not just the ticket's site.

**Step 4 — Decide.** For each ask and each decision-made, run the rubric in [DECIDING.md](DECIDING.md): aligned with the goal → benefit against risk (blast radius × irreversibility × uncertainty) → mandate → hard lines. Record the verdict.

**Step 5 — Act and communicate.** Verdicts become work: APPROVE executes or unleashes exactly that step; REDIRECT dispatches the right process from the [routing table](#routing-table) with the [principal brief](PRINCIPAL.md); DEFER files a ticket that meets the [triage](../triage/READINESS.md) bar (a fresh agent could pick it up) and links the origin; ESCALATE goes to the human with a recommendation, never a raw question; VETO tells the agent why and what to do instead. Then **tell the agent** — `SendMessage` to a live subagent, a fresh brief to the next one, a backlog entry for a `claude` process, a comment on the PR — in the verdict format in DECIDING.md. Update the board: state transition, PR linked, decision comment posted.

**Step 6 — Journal and report.** Append one line per decision: decision, evidence, change ([DECIDING.md](DECIDING.md) § The journal). Report verdict counts, dispatches, escalations and recommendations in a few lines.

## Standing management (`watch`)

The manager stays on a self-paced `/loop`, waking when dispatched work reports back (a subagent returns, a `Workflow` finishes, a `nights-watch` patrol posts its summary) and on a long fallback otherwise. Each wake is one pass of the loop above over whatever arrived. A `nights-watch` under management is the natural pairing: the Watch *reports* refusals and blockers rather than enacting them, and the manager is the one who reads and decides them. A `sdlc-old-fashioned` run under management sets Dial 1 to autonomous and routes its deferred questions to the backlog file; the manager reads the backlog diff after each phase and answers there. Budget is tracked across everything dispatched; when it is near, the manager stops dispatching and reports, it does not cut corners.

## Maintenance the manager starts itself

Proactively dispatch [triage](../triage/SKILL.md) for board grooming, [wrap-up](../wrap-up/SKILL.md) for session leftovers, and `housekeeping` for doc/code drift. Suggest `/desloppify` for code drift (manual-only). Rule 5, the mandate and hard lines still apply.

Groom when board state would change dispatch, not on a schedule. Filing, `nights-watch` and `nightshift` share [READINESS.md](../triage/READINESS.md).

The mandate still bounds what the maintenance may do. The manager grants the yeses these skills would otherwise hold for a human, but only the reversible ones — filing, committing, pushing, removing a merged worktree. Deleting an unmerged branch, a stash, or untracked work is Rule 4's line and escalates like anything else.

## Channels through which asks arrive

| Channel | Comes from | Manager's move |
|---|---|---|
| `PROPOSAL` / `ESCALATE` return | a leashed subagent ([walk-the-dog](../walk-the-dog/SKILL.md) protocol) | vet the exact command or diff; approve, tighten or escalate |
| `needs-decision:` / `needs-discussion` line | a skill run headlessly with the principal brief (`fix-pr`, `code-review-grill`, `nightshift`) | decide, reply in the verdict format, resume the run |
| deferred question in a backlog file | `sdlc-old-fashioned` autonomous, `nightshift` | answer in the file; the next phase reads it |
| patrol summary, blocker comment, refusal report | `nights-watch` | decide each; enact on the board what the Watch would not |
| a pasted report | any agent, any session | the full loop, Step 1 onward |
| a permission prompt in the manager's own session | the harness | an ask like any other — read the command verbatim, judge it, never approve to make the prompt go away |

## Routing table

| The item is | Dispatch |
|---|---|
| load-bearing: public API, schema, subsystem, money, security | `sdlc-old-fashioned` (autonomous dial; its dynamic-workflow mode runs the `sdlc-workhorse` workflow) |
| small, mechanical, well-understood | `go-go-go`, or a `nightshift` backlog item |
| a PR with no independent review yet | `code-review-grill` — a fresh reviewer, then `fix-pr` headless for what it finds |
| review comments to work | `fix-pr` with `reply=`/`resolve=` from the mandate |
| a claim the decision hinges on | `fact-check` in a fresh subagent |
| a hard bug or regression | `diagnose` |
| stale prose, comments, slop | suggest the human run `/desloppify` (manual-only); a whole-repo audit is `housekeeping` |
| a backlog to keep draining | `nights-watch`, stood up with the principal brief, managed from `watch` |
| a board nobody has groomed | `triage` first, so what gets dispatched is both specified and wanted |
| a session's unshipped branches, worktrees and loose ends | `wrap-up` — ship, sweep, then account for what is still open |
| work to defer | a tracker ticket under `tickets=file`; `prompt-backlog` when there is no tracker |

## Anti-patterns

Read exact commands before approval, regardless of how long an agent has waited. Record every dropped open item as DEFERRED or VETOED; never silently omit one. The rules above apply even to green tests or urgent work.

## When to reach for something else

| Want | Use |
|---|---|
| A principal that decides on agents' outputs, asks and permissions under one goal, and manages the board | **manager** (this) |
| A fresh-judgment gate on each side-effecting *action* a subagent proposes | `walk-the-dog` |
| The agent itself to stop asking about reversible choices | `whatever` |
| One task driven to a PR with no gate at all | `go-go-go` |
| A standing loop over a tracker that reports its refusals | `nights-watch` — under the manager when the refusals need deciding |
