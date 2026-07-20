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
| **Only proven claims are *held*** | The gate does not merely subtract — it hands the next phase the **surviving claim set** as an explicit `VERIFIED PREMISE` block, and says plainly that everything else in the artifacts is unverified. Returning only the refuted claims made "unprovable = false" a veto and nothing more: the survivors were discarded along with the failures, so the next phase re-read the raw artifact and silently inherited every assertion in it — including the ones no refuter had looked at. A gate that only subtracts cannot tell the phase after it what is left standing. |
| **The premise itself is fact-checked, not just the plan** | Spec and requirements-grill are premise gates too, adjudicated before the plan ever sees them. Previously only the plan's claims were refuted, so the *definition of correct* — the acceptance criteria that become the RED tests — reached the build unexamined. An ungrounded criterion is worse than a missing one: it becomes a test asserting something nobody established, and a green suite then certifies it. |
| **Grounding is the work at the premise phases** | Spec, grill, and plan each carry a mandatory `fact-check` instruction: prove every load-bearing claim *before writing it down*, and an unprovable claim does not go in hedged — it does not go in. The downstream refuters are a net, not a substitute, because they only ever see claims an extractor pulled out of a finished artifact; an assumption the author never wrote down is invisible to them and has to be caught by the agent making it. |
| **Findings are verified before they cost a fix cycle** | Every review finding needs a concrete failure scenario, then gets refute-tested. Plausible-but-wrong findings die before anyone acts on them. |
| **Docs ship with the code** | Documentation is Phase 10, not a hope. It also re-runs the Phase-1 baseline and reports regression. |
| **The retrospective closes every path that produced work** | Including the run that stopped at the design gate — the one that went sideways has the most to teach, so it must not be the path that skips the reflection. If the run hit real failures it applies `postmortem` discipline to them. (A red baseline is the one exception: it aborts before there is anything to reflect on.) |
| **It cannot cross an irreversible line** | There is **no merge, publish, migrate, or spend code path in the script.** The line is enforced by absence, not by an instruction a tired agent reads past. |

## Skill composition — who owns each phase

The workflow **conducts; it does not solo.** Each phase reaches for the skill that owns it, so a skill's improvement propagates here for free:

| Skill | Where | Why there |
|---|---|---|
| `to-prd` | Spec | Owns the spec artifact. |
| `grill-with-docs` (fallback `grill-me`) | Grill, Plan review | Owns adversarial interrogation against the domain model and the docs. |
| `fact-check` | Inside **every** refuter, at every gate | Owns the evidence *method* — the strongest-evidence ladder. |
| `tdd` | Build (RED, then GREEN → REFACTOR) | Owns the red-green-refactor loop. |
| `code-review-grill` | Review, per slice | Owns the fresh-agent hunk-by-hunk grill and the house-rules read. |
| `postmortem` | Retrospective, when the run hit real failures | Owns symptom → root-cause → fix → forward-looking rule. |
| `evolve-skill` / `write-a-skill` | Retrospective | Owns turning a lesson into a durable capability. |
| `merge-stack` | *After* the run, by a human | Owns landing the PR stack `parallel > 1` produces. |

**The division of labour with `fact-check` is deliberate and worth stating plainly.** The script does *not* delegate the verdict — it counts the votes of three perspective-diverse refuters and applies *unprovable = false* itself. What it delegates to `fact-check` is how each refuter *gathers evidence*. Hand-rolling that ladder inline would fork the method: the day `fact-check` gets sharper, this workflow would silently keep the old copy. So: **the script owns the decision rule, the skill owns the evidence.**

### Composing interactive skills from an autonomous run

Three of these skills are **interactive by design** — `grill-me`/`grill-with-docs` interview a user, and `code-review-grill` has two ALWAYS-ASK gates (Step 0 stance, Step 7 posting). Dropped into an autonomous worker with no human attached, they stall or improvise past their own rules. The workflow handles this explicitly rather than by hoping:

- Every prompt that reaches for one carries a **no-human rule**: a question you'd ask the user is settled by *exploring* instead (`grill-me`'s own rule — if the codebase can answer it, explore rather than ask). What truly needs a human is **recorded, not asked**: reversible → default + logged to the backlog; irreversible → returned as a blocker.
- `code-review-grill`'s gates are **pre-answered as args**: `reviewStance` (default `single`) settles Step 0, and Step 7 is settled by instruction — *post nothing, return the findings*, because this run has no authority to speak on a PR.
- **Skipping the skill is never the answer**, and the prompts say so. An agent that can't ask the question is not licensed to abandon the discipline.

## Inherited from nights-watch

- **Truth before all.** Every critical decision decomposes into verifiable sub-claims proved with real evidence — a runnable experiment and its output, a `path:line`, or independent authoritative sources. Discovering mid-check that the premise is false is a **success** of the process.
- **Lowest sufficient tier — with a floor under the premise.** `haiku` for mechanical work and the many cheap refuters, `sonnet` by default. The four **premise phases** (spec, requirements grill, plan, plan review) are pinned at `opus` and **`cfg.tiers` may raise them, never lower them** — the clamp runs after the merge, so a caller passing `{grill: 'haiku'}` gets `opus` anyway and the substitution is logged. This is a floor rather than a default because a cheap premise is not a cheap run: every later phase inherits it as fact — the slicer slices against the plan, the RED test asserts the acceptance criteria, the reviewer judges the diff against the spec — so a wrong premise doesn't fail, it produces a green suite certifying the wrong behaviour. Slices are tiered individually at slice time. Never defaults a worker to the session tier.
- **Watch the tokens.** A slice is not started unless the remaining budget covers its `reserve`. Deferred slices are logged, never silently dropped. **Refuters are the dominant cost of a run** — measured at 93 of 103 agents on a P3 one-file fix — so the premise gates bound the fan-out rather than the depth: at most `maxClaimsPerGate` claims are attacked per gate, largest blast radius first, and a claim already adjudicated is not re-proved when a later round re-extracts it. Three perspective-diverse lenses per claim is never what gets cut; spending them on fifteen claims an extractor merely *called* load-bearing is. Whatever the cap drops is named in the log and joins neither the held premise nor the rejected set — an unexamined claim that nobody names reads downstream as one that passed.
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
    maxClaimsPerGate: 5,               // claims refuted per premise gate, largest blast radius first
    reserve: 60000,                    // output tokens held back per slice
    reviewStance: 'single',            // pre-answers code-review-grill Step 0; 'quorum' to fan out per concern
    reviewConcerns: ['correctness', 'documentation'],   // used only when reviewStance is 'quorum'
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
