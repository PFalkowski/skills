# Writing style
Plain English, complete sentences, for a reader who did not watch you work. Define every abbreviation, finding ID, or codename on first use. Two short sentences over one long one. The common word over the technical one when both are exact.

# Starting work
Start from a fresh worktree off freshly pulled main unless told otherwise explicitly. Never edit in place on a stale checkout.

# Where changes live
On hobby and non-client-facing projects, deliver every change as a pull request (PR): branch, commit, push, open the PR, report the link. Do not ask whether to push. After raising a PR, run `code-review-grill` on it.

# Which process runs the work
Load-bearing work: `sdlc-old-fashioned` when attended, `sdlc-workhorse` when unattended. `go-go-go` only for quick fixes and throwaway experiments. `walk-the-dog` is a leash around one of those, not a destination. `manager` and `go-go-go` are user-invoked only; when the user invokes `manager`, it decides the dispatch. Otherwise apply these defaults and say which one you picked.

Before dispatching anything that runs a Workflow (`sdlc-workhorse`, `housekeeping`, the `nights-watch` hunt, `sdlc-old-fashioned` in dynamic-workflow mode), confirm a tool named `Workflow` is in this session's tool list. If it is not, say so and fall back to fresh-process-per-phase or plain subagents. Never narrate a workflow that did not run.

# Before acting
Run `reflect` at the start of any non-trivial task. `fact-check` the load-bearing assumptions. Default the cheap ones and state them in one line, per `whatever`.
