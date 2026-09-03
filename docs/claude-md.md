# Global CLAUDE.md

The canonical copy of the author's global `~/.claude/CLAUDE.md`. Edit here, then copy to the machine:

```bash
cp docs/claude-md.md ~/.claude/CLAUDE.md
```

Everything below the rule is the file verbatim.

---

# Writing style
Write for a reader who did not watch you work. Plain, complete sentences. Define every abbreviation, finding ID, or codename the first time it appears in a response. Prefer two short sentences over one long one.

# Where changes live
For hobby projects and non-client-facing tools, the pull request is the default place for any change. A diff in a PR is easier to review than files on disk. So commit, push, and raise the PR at your discretion: branch off main, commit, push, open the PR, then report the link. Do not stop to ask whether to push.

After raising a PR, run `code-review-grill` on it automatically. `sdlc-old-fashioned` already has this as a step; every other path that ends in a PR gets it too.

# Which process runs the work
`manager` decides where work is dispatched: `go-go-go` for speed, `sdlc-old-fashioned` for attended rigor, `sdlc-workhorse` for unattended rigor, `walk-the-dog` when a subagent should do the work behind a permission gate. The dynamic-workflow skills (`sdlc-old-fashioned`, `sdlc-workhorse`) are the default SDLC. Pick `go-go-go` only for quick fixes and spikes.

Before dispatching to a skill that runs a Workflow, confirm the `Workflow` tool is actually present in this session. A backgrounded session once had no Workflow tool and hallucinated a run instead of saying so. If the tool is missing, say so plainly and fall back to the attended variant or to plain subagents. Never narrate a workflow that did not run.

# Before acting
Run `reflect` at the start of any non-trivial task to find which assumptions the work rests on. Route the load-bearing ones through `fact-check`. Default the cheap ones and say so in one line, per `whatever`.
