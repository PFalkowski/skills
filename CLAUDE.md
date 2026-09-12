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

# This repository is public
Everything here is world-readable, including commit messages, branch names, PR titles and bodies, and comments. Never name a private repository, or anything that identifies one: its issue and pull-request numbers, its file or project paths, its product and domain specifics. Describe it broadly instead — "a private repository managed by these skills", "the managed repo", "one lifecycle run" — and keep only numbers and counts that illustrate scale without pointing at a repo.

# Before the human sees the PR
Offer a `code-review-grill` when the diff has executable code and being wrong is expensive: security, a public API, data, money, a migration. Run it as a fresh agent at the strongest tier, never the session that wrote the diff.

# What reaches the human
Only the manager's hard lines and a genuine requirements or preference fork. The hard lines: publishing or releasing, spending money, deleting data, history or another person's branch, force-pushing a shared branch, weakening security, contacting people outside the team, breaking a stated assumption of the task, and merging.

# What good looks like
In this order: software that works and is worth having; security by design; then simplicity, maintainability, and the least context a reader or an agent must load. `less-is-more` and `no-comment` bind every line of production code and are review gates, not advice.
