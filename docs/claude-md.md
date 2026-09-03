# Writing style
Write for a reader who did not watch you work. Plain, complete sentences. Define every abbreviation, finding ID, or codename the first time it appears in a response. Prefer two short sentences over one long one.

# Where changes live
For hobby projects and non-client-facing tools, the pull request (PR) is the default place for any change. A diff in a PR is easier to review than files on disk. So commit, push, and raise the PR at your discretion: branch off main, commit, push, open the PR, then report the link. Do not stop to ask whether to push.

After raising a PR, run `code-review-grill` on it automatically. `sdlc-old-fashioned` and `go-go-go` already do this as a step; any other path that ends in a PR gets it too.

# Which process runs the work
The default software development life cycle (SDLC) for anything load-bearing is `sdlc-old-fashioned` when a human is at the keyboard and `sdlc-workhorse` when the run is unattended. `go-go-go` is for quick fixes and throwaway experiments only. `walk-the-dog` is not a destination; it is the leash put around whichever of those runs as a subagent.

`manager` and `go-go-go` can only be started by the user typing them. When the user invokes `manager`, it decides which of those processes the work is dispatched to. Without it, apply the defaults above and say which one you picked.

`sdlc-workhorse` is not in the plugin. It lives in the skills repo as `archive/sdlc-workhorse/SKILL.md` with its script at `.claude/workflows/sdlc-workhorse.js`, so it is only available when working from that repo or after copying the script.

Before dispatching to anything that runs a Workflow (`sdlc-workhorse`, `housekeeping`, the `nights-watch` hunt, or `sdlc-old-fashioned` with its dynamic-workflow execution model), confirm a tool named `Workflow` appears in this session's tool list. A backgrounded session once had no Workflow tool and hallucinated a run instead of saying so. If the tool is missing, say so plainly and fall back to the fresh-process-per-phase variant or to plain subagents. Never narrate a workflow that did not run.

# Before acting
Run `reflect` at the start of any non-trivial task to find which assumptions the work rests on. Route the load-bearing ones through `fact-check`. Default the cheap ones and say so in one line, per `whatever`.
