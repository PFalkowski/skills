# The principal brief — running other skills under the manager

Most skills in this set already know how to run without a human: `fix-pr` has a headless mode where "the caller is the principal", `sdlc-old-fashioned` has an autonomous dial that defers questions to a backlog file, `nightshift` defers to its backlog, `nights-watch` reports refusals instead of enacting them, `code-review-grill` never auto-posts and asks who should. Each of them turns its would-be questions into something a caller can answer. **The manager is that caller.** The brief below is what makes it so: it names the manager as principal, states the policies the skill would otherwise have to ask for, and fixes the shape of what comes back.

## The brief — paste it into every dispatch

```
PRINCIPAL: the manager (the session that dispatched you) is your principal. There is no
human in this loop; questions to "the user" reach the manager, and it answers them.

- Never block on a question. Turn it into a line
    needs-decision: <what> | options: <a / b> | recommend: <x> | blocks: <what waits on it>
  and continue with everything that does not depend on it.
- Policies for this run: reply=<post|draft> resolve=<fixed|none> tickets=<file|draft>
  merge=never  (the manager merges or escalates; you do not).
- Working assumptions: <list>. If one turns out to be wrong, stop the leg that depends
  on it and return ESCALATE: <assumption> — <what you found> — <what it changes>.
- Actions that leave a mark outside your own worktree — push, post, file, delete,
  install, network writes — are allowed only if listed here: <allowed list, or "none">.
  Anything else is a PROPOSAL (what / why / reversible? / blast radius), batched, and
  you wait.
- Report back in this shape, nothing else:
    DONE: <what, with evidence pointers — commit shas, check URLs, test output>
    NEEDS-DECISION: <the lines above, or "none">
    PROPOSALS: <numbered, or "none">
    OPEN: <work you saw and did not do, each with why>
```

Fill every `<…>` from the mandate. A brief with a blank policy is a question the skill will have to ask, which is the thing the brief exists to prevent.

## Per-skill notes — where each one's questions surface

| Skill | Its autonomous shape | Where its asks come out | What the manager does with them |
|---|---|---|---|
| `sdlc-old-fashioned` | Dial 1 = **autonomous**; fresh process per phase | deferred questions in `prompts/sdlc-backlog.md`; the merge gate | answer in the backlog file after each phase's result comes back; hold the merge gate per `merge=` |
| `sdlc-workhorse` (Workflow) | already autonomous, evidence-gated | its `RESULT`; stops at irreversible lines | consume the result; the irreversible lines are the manager's verdicts |
| `nights-watch` | standing loop; `once` for a single pass | patrol summary: blockers, refusals, `ai-done` PRs | decide each refusal and blocker; grill or merge-escalate each `ai-done` PR; enact on the board what the Watch would not |
| `nightshift` | autonomous by construction | backlog-file deferrals; end-of-run summary | answer deferrals in the file; verdicts on the summary |
| `fix-pr` | headless: mode coerces to auto | `needs-discussion` report lines; drafted replies | decide each; post the replies per `post=` |
| `code-review-grill` | reviewer runs alone; posting is asked | the findings table and "post which?" | verified findings post per `post=`; unverified ones are not findings |
| `go-go-go` | whatever-mode, stops at hard blockers | its hard blockers | the manager's verdict is the blocker's answer; then re-dispatch |
| `walk-the-dog` | the walker vets actions | `PROPOSAL` / `ESCALATE` | the manager *is* the walker for legs it fences this way |
| any `Workflow` script | agents inside cannot spawn ([#46](https://github.com/PFalkowski/skills/issues/46)) | the script's return value | dispatch with `scriptPath`; consume the return; never ask an in-workflow agent to orchestrate |

## Talking back to a running agent

- **Live subagent** (spawned with `Agent`, still resident) → `SendMessage` with the verdict block. Keep it alive only while the next leg needs its context; otherwise let it end and brief a fresh one with the verdict handed in.
- **Fresh process** (`sdlc-old-fashioned` Dial 2, a `claude` OS process) → write the answer into the backlog file the next phase reads; the phase brief points at it.
- **Workflow** → there is no channel into a running script; the verdict shapes the *next* dispatch's arguments.
- **An agent in another session** (the pasted-report case) → the verdict is posted where that agent will look: a comment on its PR or ticket, and the report to the human names the agent to forward it to.
- **The board** → every DEFER files, every state change transitions, every verdict on a PR or ticket is a comment there. Ticket text meets the [readiness bar](../triage/READINESS.md); the manager never closes a ticket it has not verified is done, and never deletes one.

## Fencing — the hard leash under the soft one

The brief is the soft leash. The toolset is the hard one, and both are used: dispatch with read-only tools granted freely and mutating ones withheld or fenced, so a worker that ignores the brief still cannot push, post or delete on its own. The manager's own session runs under [auto-mode-setup](../auto-mode-setup/SKILL.md); its deny rules bound everything the manager can approve, and a manager approval never reaches past them. Higher permission means a tighter fence, not a looser one.
