# NightShift — Loop iteration

One iteration = one work item, end-to-end. This file governs Phase 2 only — the user is asleep, no synchronous questions are allowed.

## Per-item flow

```
1. Read backlog file. Find first [pending] item. If none → exit (write summary).
2. Atomically: change [pending] → [in_progress], append "started: <ISO timestamp>" to Run log.
3. Plan (write 2–3 sentences in Run log):
   - Test approach (integration vs unit; existing fixture or new).
   - Implementation sketch (files, types, public surface).
   - ADR snippet if architectural — link or inline a short Why/What/Trade-off.
4. RED:
   - Write the failing test(s).
   - Run the test runner.
   - Confirm test fails for the EXPECTED reason — not a build error,
     not a wrong assertion target. Read the failure message.
   - Append "RED: <test-name> failed: <one-line reason>" to Run log.
5. GREEN:
   - Write the minimum code to pass.
   - Run the targeted test → pass.
   - Run the broader regression net (integration suite if the change
     could affect it) → all pass.
   - Append "GREEN: <test-name> + <N> regression tests pass" to Run log.
6. Refactor (optional): only if the new code exposes a clear duplication
   or smell. Keep green throughout. If you can't articulate the value of
   the refactor in one sentence, skip it.
7. Commit (if policy=yes): conventional message, single item scope.
   Imperative mood: "feat(<area>): <what>" or "fix(<area>): <what>".
8. Mark item [done], append wall-clock duration to Run log.
9. Hand off to next item — see "Context management" below.
```

## Retry budget

A "failed attempt" is any of: RED triggers for the wrong reason (build error, wrong assertion target), GREEN doesn't go green, or the regression-run breaks something else.

Counting:
- The first pass at RED→GREEN is **attempt 1**.
- If that fails, diagnose (read test output, read the code, *don't* re-run the same approach), pivot, and try **attempt 2**.
- If that also fails, pivot again — **attempt 3**.
- **If attempt 3 fails, the item is `failed-after-retries`.** Stop trying. Do not start an attempt 4.

When attempt 3 fails:
- Mark the item `failed-after-retries`.
- Append diagnosis notes to the Run log (last error message + your hypothesis about why you're stuck + which approaches you tried).
- **Do not** revert your changes — leave the partial state for the user to inspect. But **do** make sure tests are at least back to a clean compile (no broken build for the next item).
- Move to the next item.

The 3-attempt limit is the line where "transient flake" stops being plausible and "I have a wrong mental model of the problem" becomes likely. More attempts mostly compound the wrong model and burn context.

## Question deferral

When you can't decide from the codebase alone:
- Append `Q: <specific question>` to the Run log (be concrete — "should X return null or throw on empty input" not "what about errors").
- Decide reversibility:
  - **Reversible** (variable name, internal helper, log message, test assertion message) → inline `A: chose X because Y` and proceed.
  - **Irreversible** (DB schema migration, public API surface, deletion of code that may have hidden callers, anything that touches `*Settings.cs` or `*.appsettings.json`) → mark `blocked-on-question`, move to next item.

Never silently guess. Either log A: with reasoning, or block.

## Context management between items

After finishing item N (status `done` / `blocked-on-question` / `failed-after-retries`):

### Default: spawn a fresh general-purpose Agent for item N+1

Why: Anthropic prompt cache TTL is 5 minutes. A test run that takes longer than that uncaches the entire parent context. Across 10+ work items the parent re-pays the cache miss 10+ times. Spawning resets the cache budget per item, and the parent doesn't accumulate per-item code edits.

Spawn prompt template:
```
Description: "NightShift item: <next item title>"
Subagent: general-purpose
Prompt: """
You are running a single NightShift loop iteration in Phase 2.
The user is asleep — do NOT do pre-flight, do NOT ask questions.
Read the backlog at <ABSOLUTE PATH>, find the first [pending] item,
and execute the per-item flow from
C:\\Users\\John\\.claude\\skills\\nightshift\\LOOP.md against it.
Defer any ambiguity per the question-deferral protocol — log Q:/A:
inline and either proceed with a documented assumption or mark
blocked-on-question.
When the item finishes (done / blocked / failed-after-retries),
return a single-line status: "<status>: <item title> — <one-line summary>".
Do NOT spawn a further subagent — the parent will do that for the next item.
"""
```

After the subagent returns, the parent reads the backlog (cheap, the file has been updated) and decides whether to spawn the next or exit.

### Alternative: in-place compression (short backlogs only)

Use this only when:
- The backlog is short (< 5 items) AND tight (no big test runs).
- Two consecutive items share substantial setup (e.g. "add field" + "use field") where re-loading context wastes cycles.

Compression recipe between items:
- Summarize completed items into a 5-line status block in your own context.
- Discard tool-result transcripts older than 2 items back.
- Re-read CLAUDE.md / saved memories at the top of each iteration so they re-cache.

If a single item runs > 5 minutes (test suite duration), abandon in-place compression and switch to spawning — the cache miss math no longer favors staying.

## Exit + summary

When a stop condition fires, do these in order:

### 1. Fold tuning observations into the relevant skill files (BEFORE the summary)

If the run surfaced lessons worth codifying — concrete prompt-tuning notes, new failure modes, refinements to existing rules, calibration thresholds that worked or didn't — fold them into the right skill file BEFORE writing the exit summary. The run record alone is not propagation: a per-run markdown file is read once, by the morning reviewer, and never again. Skills are read on every subsequent invocation.

Where things go:
- **Project-specific rules** (tied to a particular project's data shape, source-allowlist quirks, domain conventions) → the project's own skill file (e.g. `.claude/skills/<project-skill>/SKILL.md` "Cumulative hard rules" section).
- **Project-agnostic rules** (transferable patterns that would apply to any verification-heavy multi-agent flow, any TDD loop, any backlog-driven cycle) → this generic skill — `SKILL.md` "Hard rules that transfer across projects" or `ADVERSARIAL.md` "Hard rules" section.
- **Worked examples** (what failed and how the rule caught it the next round) → the project skill's run-history table; never the generic skill (the generic skill stays project-neutral).

If the parent NightShift agent is the one writing the summary, it does the fold. If a Phase-2 spawned subagent finishes the run alone (rare — usually the parent re-enters), it appends a TODO line to the summary and the parent folds in the next cycle.

A run that captures 6 tuning observations in the exit summary but doesn't fold them anywhere has wasted 5 of them. The first one is read by the morning reviewer; the rest decay.

### 2. Prepend the summary block to the backlog file

```md
# NightShift run — <ISO date> <local timezone>

- **Wall-clock:** <hh:mm:ss>
- **Completed:** <N>
- **Deferred (Q&A inline, please review):** <N>
- **Blocked on question:** <N>
- **Failed after retries:** <N>
- **Notable:** <one-line surprises — e.g. "QuoteService integration test was flaky, retried twice on item 3">
- **Folded into skills:** <list of skill files touched + commit hashes; or "none — no new lessons surfaced this run">

## Items needing your attention

<list `blocked-on-question` and `failed-after-retries` items by title with one-line reason>

---
```

The `Folded into skills` line is the audit trail for whether step 1 actually happened. If it reads "none", that's fine — not every run produces new rules. If it's missing entirely, the run skipped step 1.

### 3. Return control

If running under the parent agent, return a one-line status. If running standalone (e.g. via `/loop`), simply terminate.

## Anti-patterns to avoid in the loop

- **Don't skip RED.** "I'll write the implementation and then the test" defeats the whole point — you can't tell the test is testing the right thing.
- **Don't extend the retry budget** by reframing the problem mid-attempt. If you're on attempt 3, mark it blocked or failed; don't pretend it's attempt 1 of a "different" problem.
- **Don't commit** before tests are green. The commit log is a contract that "this passed" — broken builds in history are noise for the morning review.
- **Don't push** unless explicit pre-flight policy said yes.
- **Don't spawn nested subagents.** Phase-2 spawned agents must NOT spawn their own. Only the parent (the one the user said "go" to) spawns.
