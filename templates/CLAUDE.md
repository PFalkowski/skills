# Writing style
Plain English, complete sentences, for a reader who did not watch you work. Define every abbreviation, finding ID, or codename on first use. Two short sentences over one long one. The common word over the technical one when both are exact.

# Starting work
New session, new problem, new worktree. Orient first (`git worktree list`, `git status`, `git branch --show-current`): is this worktree on a branch for this problem? If not, make one: `git fetch origin`, then `git worktree add <path> --no-track -b <branch> origin/main`. If so, fetch and merge `origin/main` before the first edit. One branch per worktree, one worktree per branch. A worktree on another problem's branch belongs to another session: never work in it and never `git switch` there.

Run `reflect` at the start of any non-trivial task and `fact-check` the load-bearing assumptions. Default the cheap ones and state them in one line, per `whatever`.

Context is king; keep it lean. When a new request gains little from this session's context, offer a fresh session per `save-tokens`: a `handoff` lite plus a ready command that launches it, run on the user's yes.

A skill named here that is not installed is skipped. Plugin installs prefix skill names with `pfalkowski-skills:`.

# Which process runs the work
`sdlc-old-fashioned` runs everything that is not a quick fix or a throwaway experiment; those skip the lifecycle, not the delivery rules below. `walk-the-dog` is a leash around a run, not a destination. Every piece of work runs under `manager` as its principal, invoked by the session when the user has not (`manager run <skill> <task>`): it sets `sdlc-old-fashioned`'s execution model and the model tier per phase, answers the reversible questions, and decides what is posted and filed. Workers, including `sdlc-old-fashioned` build phases, run on Opus at low or medium effort; adversarial and hard-to-reverse phases run on the strongest tier available.

Before dispatching anything that runs a Workflow (`sdlc-workhorse`, `housekeeping`, the `nights-watch` hunt, `sdlc-old-fashioned` in dynamic-workflow mode), confirm a tool named `Workflow` is in this session's tool list. If it is not, say so and fall back to fresh-process-per-phase or plain subagents. Never narrate a workflow that did not run.

# Before the human sees the PR
Offer a `code-review-grill` when the diff has executable code and being wrong is expensive: security, a public API, data, money, a migration. Run it as a fresh agent at the strongest tier, never the session that wrote the diff.

# What reaches the human
Ask before pushing, before opening a pull request (PR), and before crossing any hard line: publishing or releasing, spending money, deleting data, history or another person's branch, force-pushing a shared branch, weakening security, contacting people outside the team, breaking a stated assumption of the task, and merging.

# What good looks like
In this order: software that works and is worth having; security by design; then simplicity, maintainability, and the least context a reader or an agent must load. `less-is-more` and `no-comment` bind every line of production code and are review gates, not advice.
