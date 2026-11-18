# Lessons learned

Durable lessons from lifecycle runs in this repo. Each entry says what went wrong, why, and the rule that keeps it from happening again. Run narratives, specs and plans are posted on the pull request, not kept here (see [agent-state.md](docs/agent-state.md)).

## 2026-11-18: formal-check v2 run stopped before code

The `sdlc-workhorse` run for the opt-in v2 skills (`formal-check`, `code-review-grill-v2`, `sdlc-old-fashioned-v2`) used about 1,345k output tokens across baseline, spec, three grill rounds and two plan rounds, then stopped with "plan unapproved". No slice was built.

### The plan gate moved between rounds

- **Symptom.** Plan review round 1 asked for two fixes. Round 2 accepted both, then raised two new must-fix findings, so the run hit `maxPlanRounds` (default 2) and stopped.
- **Root cause.** Round 1's fix for lost backups added a new mechanism (per-run backup folders). Round 2 found a hole in that new mechanism: the folders are per repository, not per worktree, so an unrestored run in one worktree blocks or misleads a run in another. The second must-fix was a missing documentation citation, which is a wording fix, not a design flaw. With two rounds, any new mechanism added in round 1 gets exactly one review and no chance to fix what it finds.
- **Rule.** On the last plan round, a must-fix must be a defect a builder could not fix inside one slice (data loss with no stated guard, a broken premise). A missing citation or a narrow scoping fix goes to the slice's acceptance criterion instead. When a round-1 fix adds a new mechanism rather than changing a sentence, expect a third round.

### Scope was three skills in one run

- **Symptom.** 17 spec claims and 27 grill claims; with `maxClaimsPerGate` at 5, 12 and 22 of them were never examined. Each grill round found 16 to 21 holes.
- **Root cause.** One run carried a new skill and two overlays, plus a CI test that needs Java. Most holes were in the coupling between them (how text reaches each workhorse phase, and how fix-pr treats a finding that cannot be run).
- **Rule.** Ship the standalone skill first, then each overlay in its own run. Treat more than about 15 load-bearing claims at the spec gate as a sign the scope should be split.

### Running a model checker locally was refused

- **Symptom.** Three phases tried to run TLC (the TLA+ model checker) and the permission classifier refused each time: a Java download, then an installed Java runtime. One refuter subagent did run it. The backlog went on calling the runtime facts NOT RUN after they had been run once.
- **Root cause.** Two things. Baseline checked only `which java`, so it reported no Java at all, while an IDE-bundled runtime was installed. And the session had no permission rule for running a Java tool, so whether it ran depended on which agent asked.
- **Rule.** A baseline looks for installed runtimes off `PATH` before it reports a tool as missing. When a run needs a tool the session has never run, the plan asks for a permission rule or names CI as the place it first runs. It never retries after a refusal. When any agent runs the tool, the backlog's NOT RUN entry is updated in the same phase.

### Probes with simple stubs gave wrong answers

- **Symptom.** The table of which workhorse phase sees which text was rewritten three times. Round 1 said the review stage never sees spec text; the plan said plan text reaches the claims gate. Both were wrong.
- **Root cause.** The probes stubbed the agents with the simplest output: no grill acceptance criteria and no saved plan path. Real runs return both, and both change what each later prompt contains.
- **Rule.** A probe of `sdlc-workhorse.js` stubs each agent with the fields a real agent returns (grill acceptance criteria, `planPath`, a review finding) before its result is used as evidence.

### Calibration

- A design-only workhorse run on a multi-skill change, with three grill rounds and two plan rounds, costs about 1.3M output tokens before the first slice. Reserve at least that, plus the build, for a run of this size.
