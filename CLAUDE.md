# Writing style
Plain English, complete sentences, for a reader who did not watch you work. Define every abbreviation, finding ID, or codename on first use. Two short sentences over one long one. The common word over the technical one when both are exact.

# Starting work
New session, new problem, new worktree. Orient first (`git worktree list`, `git status`, `git branch --show-current`): is this worktree on a branch for this problem? If not, make one: `git fetch origin`, then `git worktree add <path> --no-track -b <branch> origin/main`. If so, fetch and merge `origin/main` before the first edit. One branch per worktree, one worktree per branch. A worktree on another problem's branch belongs to another session: never work in it and never `git switch` there.

Run `reflect` at the start of any non-trivial task and `fact-check` the load-bearing assumptions. Default the cheap ones and state them in one line, per `whatever`.

# Which process runs the work
`sdlc-old-fashioned` runs everything that is not a quick fix or a throwaway experiment; those skip the lifecycle, not the delivery rules below. `walk-the-dog` is a leash around a run, not a destination. Every piece of work runs under `manager` as its principal, invoked by the session when the user has not (`manager run <skill> <task>`): it sets `sdlc-old-fashioned`'s execution model and the model tier per phase, answers the reversible questions, and decides what is posted and filed. The autonomy dial is autonomous: only irreversible gates stop for the human. Workers run on Sonnet; adversarial and hard-to-reverse phases run on the strongest tier available (Opus or Fable).

Before dispatching anything that runs a Workflow (`sdlc-workhorse`, `housekeeping`, the `nights-watch` hunt, `sdlc-old-fashioned` in dynamic-workflow mode), confirm a tool named `Workflow` is in this session's tool list. If it is not, say so and fall back to fresh-process-per-phase or plain subagents. Never narrate a workflow that did not run.

# Where changes live
On hobby and non-client-facing projects, deliver every change as a pull request (PR): commit, push, open the PR, report the link. Do not ask whether to push.

# Before the human sees the PR
Opening a PR triggers one `code-review-grill` pass (Phase 9 inside `sdlc-old-fashioned`) by a fresh reviewer at the strongest tier, never the session that wrote the diff. Its ask about what to post is the manager's to answer, not the human's: the manager picks which findings land, and in what order, with `reflect`. Then `fix-pr` runs in hybrid mode with the manager answering in the human's place: Sonnet fixers take the mechanical findings, the manager decides the substantive ones one by one, and the human hears only what it cannot decide. The mandate is `merge=ask`: the human reviews the finished PR in the browser and merges it.

# What reaches the human
Only the manager's hard lines and a genuine requirements or preference fork. The hard lines: publishing or releasing, spending money, deleting data, history or another person's branch, force-pushing a shared branch, weakening security, contacting people outside the team, breaking a stated assumption of the task, and merging.

# What good looks like
In this order: software that works and is worth having; security by design; then simplicity, maintainability, and the least context a reader or an agent must load. `less-is-more` and `no-comment` bind every line of production code and are review gates, not advice.
