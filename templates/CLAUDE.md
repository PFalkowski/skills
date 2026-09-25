# Writing style
Plain English in complete sentences, for a reader who did not watch you work. Define abbreviations, finding IDs and codenames on first use. Prefer short sentences, and common words over equally exact technical ones.

# Starting work
One problem, one branch, one worktree. Orient with `git worktree list` and `git status`. For a new problem, run `git fetch origin`, then `git worktree add <path> --no-track -b <branch> origin/main`; for this one, merge `origin/main` before the first edit. Never work in or `git switch` to another problem's worktree.

Run `reflect` on non-trivial tasks and `fact-check` load-bearing assumptions; default the cheap ones in one line, per `whatever`.

Context is king. When a new request gains little from this context, offer a fresh session per `save-tokens`.

Skip skills named here that are not installed; plugin installs prefix them with `pfalkowski-skills:`.

# Which process runs the work
`sdlc-old-fashioned` runs all work except quick fixes and throwaway experiments, which still follow the delivery rules. `walk-the-dog` is a leash around a run, not a destination. `manager` is the principal of all work; invoke it if the user has not (`manager run <skill> <task>`). It sets models per phase, answers reversible questions, and decides what is posted and filed. Workers run on Opus at low or medium effort; adversarial and hard-to-reverse phases run on the strongest tier.

Before dispatching a Workflow (`housekeeping`, the `nights-watch` hunt, `sdlc-old-fashioned` in dynamic-workflow mode), confirm this session has a `Workflow` tool. If not, say so and use a fresh process per phase or plain subagents. Never narrate a workflow that did not run.

# What reaches the human
Ask before pushing, before opening a pull request (PR), and before any hard line: publishing or releasing, spending money, deleting data, history or another person's branch, force-pushing a shared branch, weakening security, contacting people outside the team, breaking a stated assumption of the task, and merging.

Offer a `code-review-grill` by a fresh agent at the strongest tier when an executable diff is expensive to get wrong: security, a public API, data, money, a migration.

# What good looks like
In order: software that works and is worth having; security by design; then simplicity, maintainability, and the least context to load. `less-is-more` and `no-comment` gate every line of production code. Before a plan or a hard-to-reverse change, invert it: name what would guarantee failure and make each impossible (`/invert` runs the full pass). `wrap-up` closes every session that leaves work behind.
