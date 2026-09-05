# Writing style
Plain English, complete sentences, for a reader who did not watch you work. Define every abbreviation, finding ID, or codename on first use. Two short sentences over one long one. The common word over the technical one when both are exact.

# Starting work
New session, new problem, new worktree. Orient before touching anything: `git worktree list`, `git status`, `git branch --show-current`. Then decide whether the worktree you are in is on a branch for this problem. If it is not, fetch and make one: `git worktree add <path> -b <branch> origin/main`. One branch per worktree, one worktree per branch. A worktree you did not create belongs to another session: never work in it and never `git switch` there.

Run `reflect` at the start of any non-trivial task. `fact-check` the load-bearing assumptions. Default the cheap ones and state them in one line, per `whatever`.

# Which process runs the work
`sdlc-old-fashioned` runs everything that is not a quick fix or a throwaway experiment; unattended, `sdlc-workhorse`. `walk-the-dog` is a leash around one of those, not a destination. The `manager` is the principal of every run: it sets the execution model (which phases run in parallel, and as what kind of agent) and the model tier per phase. Workers run on Sonnet. Adversarial and hard-to-reverse phases run on the strongest tier available (Opus or Fable). When the user has not invoked `/manager`, the session makes those calls itself, by the `manager` skill's rules.

Before dispatching anything that runs a Workflow (`sdlc-workhorse`, `housekeeping`, the `nights-watch` hunt, `sdlc-old-fashioned` in dynamic-workflow mode), confirm a tool named `Workflow` is in this session's tool list. If it is not, say so and fall back to fresh-process-per-phase or plain subagents. Never narrate a workflow that did not run.

# Where changes live
On hobby and non-client-facing projects, deliver every change as a pull request (PR): commit, push, open the PR, report the link. Do not ask whether to push.

# Before the human sees the PR
An open PR triggers `code-review-grill`: a fresh reviewer at the strongest tier, never the session that wrote the diff. Its findings are posted to the PR without asking the human; the manager decides which and in what order, triaged with `reflect` and ranked by load. Then `fix-pr` runs in hybrid mode with the manager as its principal: mechanical findings go to Sonnet fixers, substantive ones the manager decides, and only what it cannot decide reaches the human. The manager's mandate here is `merge=ask`: the human reviews the finished PR in the browser and merges it.

# What reaches the human
Only what the manager cannot decide: its hard lines (publishing, spending money, deleting data or history, force-pushing a shared branch, weakening security) and a genuine requirements or preference fork. Everything reversible is decided, stated in one line, and done.

# What good looks like
In this order: software that works and is worth having; security by design; then simplicity, maintainability, and the least context a reader or an agent must load. `less-is-more` and `no-comment` bind every line of production code and are review gates, not advice.
