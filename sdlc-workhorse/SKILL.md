---
name: sdlc-workhorse
description: "The full SDLC as an executable pipeline, run unattended — the autonomous counterpart to sdlc-old-fashioned. Gathers the goal, then dispatches a Workflow that runs the whole lifecycle as code: guardrail baseline (red baseline aborts) → spec → a fresh agent grills the requirements → design → a fresh agent grills the plan → slice into tracer bullets → per-slice TDD where the RED is verified by a second agent → fresh-agent grill of each diff with every finding refute-tested → documentation shipped in the same PR → retrospective that curates durable lessons and runs postmortem discipline on the failures. Truth before all: every load-bearing claim at every gate is decomposed and attacked by perspective-diverse refuters, and an unprovable claim is treated as FALSE. Autonomous like nights-watch: reversible questions defer to the backlog with the chosen default logged, workers run at the lowest sufficient tier, token spend is budget-guarded, and the run NEVER merges, publishes, migrates, or spends — it hands back a merge-ready report. Use when the user wants the full lifecycle run unattended / overnight / autonomously; says 'do it properly but don't babysit me', 'run the whole SDLC on this', 'build this end to end while I'm out'; or wants by-the-book rigor on a load-bearing change without standing at every gate. For the attended variant where a human holds every gate, use sdlc-old-fashioned. For speed over rigor, use go-go-go."
---

# sdlc-workhorse — the lifecycle, as a machine

The **autonomous** counterpart to [`sdlc-old-fashioned`](../sdlc-old-fashioned/SKILL.md). Same lifecycle, same gates, same refusal to skip a phase — but the sequence is a **Workflow script** rather than a runbook a conductor follows, and the discipline is enforced by code rather than by conscience.

The difference in one line: *old-fashioned holds the gates with a human standing at each one; the workhorse holds them with control flow, and stops at the lines a machine must not cross.*

| | **sdlc-old-fashioned** | **sdlc-workhorse** |
|---|---|---|
| Gates held by | a human, at every phase | the script — a failed gate is a code path |
| Questions | block until answered | reversible → default + logged to backlog; irreversible → stop |
| Phases run as | spawned `claude -p` processes you inspect live | workflow agents you read back as a report |
| You are | the conductor, present | the dispatcher, gone |
| Ends at | a merged PR | a **merge-ready report** — it never merges |

Pick the workhorse when the work deserves the full lifecycle but you are not going to stand at the gates. Pick old-fashioned when you want to.

## What is structural here, and not merely instructed

This is the whole reason it is a workflow. Prose can ask; a script decides.

| Discipline | How the script enforces it |
|---|---|
| **Never build on a red baseline** | Phase 1 runs the repo's own checks first and **throws** if any fail. There is no "…but this failure is unrelated" path. |
| **No phase gets skipped** | The phases *are* the script. Running long cannot quietly drop documentation, which is what always gets dropped. |
| **The author never grades their own homework** | Every grill is a separate `agent()` handed the artifact as **text**. It cannot inherit the author's rationale because it never had it — in prose, "use a fresh context" is an instruction; here it is the execution model. |
| **No code before a *real* red test** | The RED agent must return the test's **actual output**, and a **different** agent re-reads it and answers one question: did it fail on the asserted behaviour, or on a typo/import/missing fixture? A false red is rejected and the slice does not proceed. This is the gate prose cannot hold — "write a failing test first" is trivially satisfied by a test that fails for the wrong reason, and the author is the last person who will notice. |
| **Unprovable = false** | Load-bearing claims are extracted from each artifact and attacked by three **perspective-diverse** refuters (correctness / evidence / reproduction). The verdict is arithmetic, not vibes. A refuted claim in the plan sends the plan back even if the reviewer liked it. |
| **Findings are verified before they cost a fix cycle** | Every review finding needs a concrete failure scenario, then gets refute-tested. Plausible-but-wrong findings die before anyone acts on them. |
| **Docs ship with the code** | Documentation is Phase 10, not a hope. It also re-runs the Phase-1 baseline and reports regression. |
| **The retrospective closes every path that produced work** | Including the run that stopped at the design gate — the one that went sideways has the most to teach, so it must not be the path that skips the reflection. If the run hit real failures it applies `postmortem` discipline to them. (A red baseline is the one exception: it aborts before there is anything to reflect on.) |
| **It cannot cross an irreversible line** | There is **no merge, publish, migrate, or spend code path in the script.** The line is enforced by absence, not by an instruction a tired agent reads past. |

## Inherited from nights-watch

- **Truth before all.** Every critical decision decomposes into verifiable sub-claims proved with real evidence — a runnable experiment and its output, a `path:line`, or independent authoritative sources. Discovering mid-check that the premise is false is a **success** of the process.
- **Lowest sufficient tier.** `haiku` for mechanical and for the many cheap refuters, `sonnet` by default, `opus` for design (Phases 4–5) where a wrong call costs more than the tokens. Slices are tiered individually at slice time. Never defaults a worker to the session tier.
- **Watch the tokens.** A slice is not started unless the remaining budget covers its `reserve`. Deferred slices are logged, never silently dropped.
- **Chronicles.** Every agent appends field notes *as it works*, crash-safe, outside its worktree. The retrospective reads them — that is how a lesson survives an agent that died.
- **The Library.** Pass `libraryIndex` and the retrospective curates durable lessons into the shared `.nights-watch/library/`, and agents recall from its index leanly.

## Dispatch

```
Workflow({
  name: 'sdlc-workhorse',
  args: {
    goal: '<the change, in enough detail to specify — this is the one required arg>',

    // all optional, sane defaults shown
    parallel: 1,                       // slices in flight; >1 gives each a worktree and yields a PR stack
    maxWorkers: 3,
    maxSlices: 12,
    maxGrillRounds: 3,                 // then unresolved questions defer with their defaults logged
    maxPlanRounds: 2,                  // then it stops rather than build on an unapproved design
    reserve: 60000,                    // output tokens held back per slice
    backlogPath: 'prompts/sdlc-backlog.md',
    chronicleDir: '.sdlc/chronicles',
    libraryIndex: null,                // set to '.nights-watch/library/INDEX.md' if the repo keeps one
    tiers: { plan: 'opus', build: 'sonnet', verify: 'haiku' },  // per-phase overrides
  },
})
```

Invoking this skill **is** the user's opt-in to multi-agent orchestration. It spends real tokens across a full lifecycle — confirm the goal is worth it before dispatching.

> **Right-size first.** A typo, a one-liner, a throwaway spike → this is a `go-go-go` job, not a workhorse one. Say so and exit. The workhorse is for changes where getting it wrong is costly: features, subsystems, public APIs, data/schema, money, security, anything hard to reverse.

> **Isolate first.** Dispatch from a dedicated worktree + branch (`EnterWorktree`) so the main checkout stays clean. At `parallel: 1` the slices share that tree; above 1 each slice gets its own and you get a PR stack — hand it to `merge-stack`.

> Running from a repo other than this one? Named resolution reads `.claude/workflows/` in the current repo; elsewhere pass `scriptPath` at this repo's copy instead of `name`.

## Reporting the result

The workflow returns a report, not a merged branch. Lead with the honest state:

- **`mergeReady`** — true only when every slice went green, no blockers, no verified blocker/major findings, and the baseline is **still green**. If false, **`mergeBlockedBy`** says exactly what stands in the way. Do not soften this: a run that produced good work and a red baseline is not merge-ready, and saying otherwise is the one failure mode that makes the whole apparatus pointless.
- **`stoppedAt`** — present when the design never cleared its gate. No code was written. That is the process working: the cheapest place to kill a design mistake is before the first line of code.
- **`slices[].verifiedFindings`** — findings that *survived* refutation. Real defects, with evidence.
- **`blockers`** / **`deferred`** — what needs a human, and what was consciously parked in the backlog with a default already chosen.
- **`retro`** — what was evolved on the spot vs filed vs flagged.
- **`reproduction`** — goal, tiers, parallelism, paths, tokens spent. Enough to pick the run up cold.

Then do the part the workflow structurally cannot: **take the merge-ready branch to a human for the go.**

## Discipline

- **Gates are real.** No plan before the spec is grilled. No code before the plan is reviewed and a test is genuinely red. No merge before the baseline is green again.
- **Guard the scope.** Out-of-scope discoveries are filed to the backlog on the spot, never absorbed. That single habit is what keeps each slice shippable.
- **Every phase leaves an artifact.** Spec, ADR, plan, test, diff, docs, chronicle, reflection. The auditable trail *is* the deliverable, not a side effect.
- **Iterate, don't waterfall blindly.** A review that reopens a requirement sends the run back — that is the process working, not failing. The script bounds the loops so "working" doesn't become "spinning".
- **A bad run still closes properly.** Retrospective, chronicles curated, blockers surfaced plainly. The run isn't finished at green; it's finished after the reflection.
