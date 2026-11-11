# Dynamic-workflow mode — the lifecycle as a script

Dial 2's dynamic-workflow option ([SKILL.md](../SKILL.md)). The phases, gates and quality standard are the
skill's; this file holds only what is particular to running them as [`workflows/sdlc-workhorse.js`](../../workflows/sdlc-workhorse.js).

## When

The conductor dispatches that script and **never authors its own**. It is autonomous by construction (Dial 1 is
autonomous in this mode) and ends at a merge-ready report. Confirm first that this session has a `Workflow` tool; if it does not, say so and run
the lifecycle as fresh process per phase instead.

## Dispatch

```
Workflow({
  name: 'sdlc-workhorse',                  // from a plugin install: 'pfalkowski-skills:sdlc-workhorse'
  args: {
    goal: '<the change, in enough detail to specify — the one required arg>',
    backlogPath: '<state>/backlog.md',     // the conductor's backlog stays the live source of truth
    chronicleDir: '<state>/chronicles',
    startedAt: '<MM-dd HH:mm>',            // stamps every log line with the run
    // optional, defaults shown
    parallel: 1,                           // only 1 is supported; a higher value throws until each slice gets its own worktree
    maxSlices: 12,
    maxGrillRounds: 3,                     // then unresolved questions defer with their defaults logged
    maxPlanRounds: 2,                      // at least 1; then it stops rather than build on an unapproved design
    maxClaimsPerGate: 5,                   // claims refuted per premise gate, largest blast radius first
    reserve: 60000,                        // output tokens held back per slice
    reviewStance: 'single',                // code-review-grill Step 0; 'quorum' fans out one reviewer per concern
    reviewConcerns: ['correctness', 'documentation'],   // quorum only; the script appends 'quality-standard'
    libraryIndex: null,                    // '.nights-watch/library/INDEX.md' if the repo keeps one
    tiers: { document: 'sonnet' },         // per-phase model; fable throws; spec, grill, plan and plan review never drop below opus
  },
})
```

Without `backlogPath` or `chronicleDir` the prompts carry the placeholder
`$HOME/.agent-state/<repo dir name>/sdlc-workhorse/…` for the agents to resolve.

**If the name is not found**, dispatch by `scriptPath` instead, resolved rather than guessed:

- link install: the skills repo is the parent of the junction target of `~/.claude/skills/sdlc-old-fashioned`
  (`readlink`, or `(Get-Item ~/.claude/skills/sdlc-old-fashioned -Force).Target`); the script is
  `<repo>/workflows/sdlc-workhorse.js`. A lexical `..` through the junction does not reach it.
- plugin install: the `installPath` of the `pfalkowski-skills@<marketplace>` entry in `~/.claude/plugins/installed_plugins.json`, plus
  `/workflows/sdlc-workhorse.js`.

`test -f` the path. If neither the name nor the path resolves, **stop and report blocked** — never improvise a
lifecycle script in its place. On Windows a CRLF copy fails `scriptPath` validation; pass the file's contents
as `script` instead ([WATCH.md § Dispatch](../../nights-watch/WATCH.md)).

## What the script enforces

| Discipline | How |
|---|---|
| Never build on a red baseline | Phase 1 runs the repo's checks and throws if any fail. |
| No phase gets skipped | The phases are the script; documentation cannot be dropped for running long. |
| The author never grades their own work | Every grill is a separate agent handed the artifact as text. |
| No code before a real red test | A second agent confirms the RED failed on the asserted behaviour; a false red stops the slice. |
| Unprovable = false | Load-bearing claims at each premise gate face three refuters; only survivors reach the next phase as `VERIFIED PREMISE`. |
| The premise is floored | Spec, grill, plan and plan review run at opus or above whatever `tiers` says, and the clamp is logged. |
| invert in design | Plan and plan review read invert/SKILL.md; every failure mode names what blocks it. |
| The quality standard is a gate | GREEN writes to `less-is-more` and `no-comment`; a verified breach blocks `mergeReady` whatever its severity. |
| Findings are verified | Every review finding is refute-tested before it counts; a blocking one the refuters leave without a majority either way blocks `mergeReady`. A verdict needs two of the three refuters; a dead or unverifiable one is no verdict. |
| A gate that did not run did not pass | A dead reviewer, lens or claim extractor blocks `mergeReady` and is named in `mergeBlockedBy`. |
| Docs ship with the code | The Document phase updates docs and re-runs the baseline. |
| The retro closes every path | Including a run that stopped at the design gate. |
| No irreversible line is crossed | There is no merge, push, publish, migrate or spend path in the script, and every agent that writes is told never to push or touch a PR. |

## Reading the report

- `mergeReady` — every planned slice built and green, every gate ran, no blockers, no verified blocker/major or
  quality-standard finding, baseline still green. When false, `mergeBlockedBy` says why; report it unsoftened.
- `stoppedAt` — the design never cleared its gate; no code was written.
- `slices[].verifiedFindings` — findings that survived refutation, each with its `rule`.
- `blockers` / `deferred` — what needs a human, and what was parked in the backlog with a default chosen.
- `retro`, `reproduction` — lessons, and enough to pick the run up cold.

The script never commits, pushes or touches a PR. When it returns, the conductor, in order:

1. commits the run's work on the run's branch;
2. pushes and opens the PR with the manual-testing notes Phase 8 asks for, as a draft with `mergeBlockedBy` in its body when `mergeReady` is false;
3. posts the report's `spec`, `plan`, each slice's `verifiedFindings` (severity, rule, summary, evidence), and `retro` on the PR ([SKILL.md](../SKILL.md), Step 0.7);
4. runs Phase 9 onward: `code-review-grill` on the PR head, Phase 10, the Phase 12 merge gate, Phase 13.

When `stoppedAt` is set, no code was written: post the spec, plan and retro on the tracker issue instead and report.
