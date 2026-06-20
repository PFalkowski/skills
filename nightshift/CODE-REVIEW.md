# NightShift — Adversarial code review (every code item)

The default TDD LOOP proves an item against the test the *implementer* chose to write. That test encodes the implementer's mental model — so it cannot catch the bug the implementer didn't think to test for (the off-by-one in an untested branch, the dropped guard in a refactor, the caller the change just broke). Adversarial code review closes that gap with an **independent** reviewer that hunts for what the green test missed.

This is distinct from [ADVERSARIAL.md](ADVERSARIAL.md) (data-claim verification): that mode checks *claims about the world* via WebFetch; this mode checks the *implementation* for correctness defects. Same governing principle — **independence** — different target.

## When it runs

After an item is GREEN + refactored, **before** the commit/PR for that item. Every code item gets one review pass. (Pure data/doc items with no executable surface use the data-claim mode instead; an item can warrant both.)

## The pattern

1. **Implementer** (the loop agent) finalizes the green diff and captures it: `git diff <item-base>...HEAD` (or `git diff --staged`).
2. **Reviewer subagent — fresh context, no shared memory with the implementer.** It receives ONLY:
   - the diff,
   - the item's `**Acceptance:**` line,
   - read access to the repo (Read/Grep/Glob; may run the test runner).
   It must NOT receive the implementer's plan, rationale, or Run-log reasoning. A reviewer that sees *why* the code was written the way it was inherits the implementer's blind spots — the entire value is the independent second model.
3. **Reviewer hunts** at extra-high recall (catching a real bug outranks avoiding a false positive) across, at minimum:
   - **line-by-line** over each hunk, then the *enclosing function* (bugs on unchanged lines of a touched function are in scope — the change re-exposes them);
   - **removed-behavior** — for every deleted/replaced line, name the invariant it enforced and find where it's re-established;
   - **cross-file tracer** — grep callers/callees of changed symbols for broken preconditions, return-shape, or ordering;
   - **language/framework pitfalls** for the stack;
   - **reuse/simplification** (secondary to correctness).
   Returns findings as JSON `{file, line, severity, summary, failure_scenario, vote}` where `vote ∈ CONFIRMED | PLAUSIBLE | REFUTED`. Empty array if clean — do not pad.
4. **Implementer triages** each non-REFUTED finding:
   - **CONFIRMED correctness bug** → write a failing test reproducing it (Red), fix (Green), re-run the regression net. This is in-scope work for the item, not a new retry against the 3-attempt budget — unless the fix itself can't go green, in which case the normal retry budget applies to that sub-fix.
   - **PLAUSIBLE** → if cheap and in-scope, fix it; otherwise log `A: deferred because <reason>` in the Run log and (if PR policy is on) file a follow-up issue rather than expanding the item's blast radius.
   - **REFUTED / cleanup-only** → apply if trivial, else note and move on.
5. **Re-run the regression net**; stay green.
6. **Log** in the Run log: `REVIEW: <n> findings — <c> confirmed-fixed, <p> deferred, <r> refuted`.
7. Then commit / push / open the PR.
8. **Post the review to the PR.** Once the PR exists, add a comment that makes the independent review auditable — it states the review ran on clean context, what it checked, every finding, and each finding's disposition. Even a **0-finding** review gets a short comment naming what was checked: a PR with no review comment is indistinguishable from one that skipped the review. This publishes the triage from steps 4–6; it does not re-run it.

## Posting the review to the PR

Post the review as a comment on the item's PR (`gh pr comment`, or the host's equivalent) so the independent pass is auditable where the change is reviewed — not just buried in a Run log. Format:

```
## 🔍 Independent adversarial code review

Fresh reviewer subagent, clean context (diff + acceptance + repo-read only, no implementer rationale).

**Findings: <n>.**  [for each finding:]
1. <summary> → **<Fixed in `<sha>` | Accepted-as-designed: <rationale> | Migrated to #<issue>>**.

**Disposition:** <one line>.
```

Each finding lands in exactly one bucket: **fixed** (regression test + fix in this PR), **migrated** (pre-existing/out-of-scope → its own `gh issue`, linked), or **accepted-as-designed** (a deliberate, justified choice — state the rationale; this is a resolution, not a defect). Never leave a finding in none of these.

## Hard rules

1. **The reviewer is a separate subagent, never the implementer re-reading its own diff.** Self-review re-walks the same assumptions; the independent pass is the whole point.
2. **Withhold the implementer's rationale from the reviewer.** Diff + acceptance + codebase only. Independence is the asset.
3. **A CONFIRMED correctness finding gets a regression test before the fix** — same Red→Green discipline as the item itself, so the bug can't silently return.
4. **Confirmed-bug fixes don't consume the item's retry budget**; they're part of finishing the item. Only a fix that itself won't go green re-enters the retry math.
5. **Don't let review findings silently expand scope.** In-scope confirmed bugs: fix now. Out-of-scope or pre-existing bugs the diff merely surfaced: file a follow-up issue and link it — never fold an unrelated refactor into the item.
6. **A pre-existing bug found in a touched function is reported, not necessarily fixed in-item.** Fixing it would change behavior the item must preserve; log it and file a follow-up issue (e.g. a double-applied mapping surfaced while reviewing an otherwise-mechanical move — file it and fix it in its own PR, never folded into the move).
7. **Empty is a valid result, but a reviewer that returns empty on most items is too shallow.** Track findings-per-item in the exit summary; a run of ≥8 code items with near-zero confirmed findings means the reviewer prompt needs sharpening (mirror of the data-mode calibration band).
8. **A compiling build is NOT the all-clear for an accessibility- or visibility-narrowing diff** (making a symbol private / internal / sealed / non-exported, or tightening a signature). Two classes of trap survive compilation: (a) **reflection / proxy / DI reach** — code that constructs, mocks, or injects the symbol *dynamically* compiles fine but fails at run time once the narrowed visibility blocks the dynamic access; (b) **call sites a bare-name grep misses** — fully-qualified or aliased references the reviewer didn't count. Have the reviewer grep for dynamic/reflective construction of the narrowed symbol *and* for fully-qualified call sites, then re-run the affected **test** build, not just the main build. *(Concrete .NET instance: sealing or internalizing a type breaks a `Mock<ILogger<ThatType>>` at proxy-generation despite compiling — fix is an extra `InternalsVisibleTo("DynamicProxyGenAssembly2")` beyond the test-assembly grant — and `new Some.Namespace.Type(` call sites are missed by a grep for bare `new Type(`.)* This is the visibility-change sibling of rules 1–2's independence principle: the reviewer's job is to find the trap the green build hid.

## Calibration

Across a run, track confirmed-findings rate and confirmed-fix rate per item. A reviewer surfacing **zero** confirmed bugs across a long run is probably pattern-matching, not reading enclosing functions and tracing callers. A reviewer flooding **every** item with low-confidence findings the implementer always refutes is mis-tuned toward noise. Fold concrete tuning notes (which angle caught the real bug, which produced only noise) into this file's hard-rules list on exit — the list grows monotonically, same as the data-mode rules.
