# desloppify runbook

This is the operating detail for a `desloppify` run. Keep the active context small: inspect
the files that decide the next step, retain evidence and decisions, and stop a lane when it
produces no new signal. Do not read the whole repository just to prove that a scan exists.

## 1. Resolve the run

Parse the arguments from `SKILL.md` and state the resolved values. If a value is omitted, use
the defaults there. `mode=item` is for one named hotspot; `mode=campaign` is for a bounded set
of approved cleanup slices; `mode=assess` produces a plan and no broad edits.

Start with:

```powershell
git status --short --branch
rg --files -g '!**/bin/**' -g '!**/obj/**' -g '!**/dist/**' -g '!**/build/**' -g '!**/vendor/**'
```

Read repository instructions and architecture sources before source files: `AGENTS.md`,
`CLAUDE.md`, contributing guides, README entry points, ADRs, package/build manifests, CI, and
the configured formatter/linter/test commands. Record ignored, generated, inaccessible, and
out-of-scope areas as `uncovered`; never imply that they are clean.

For `mode=campaign`, isolate the work first if the current worktree is not already dedicated.
Do not overwrite unrelated user changes.

## 2. Establish truth before taste

Use the housekeeping source-of-truth ladder for each load-bearing claim:

- behavior → code and tests;
- intent → the authoritative tracker or PRD;
- decisions → ADRs;
- external contracts → the published contract, then code;
- procedures → a runbook last exercised, or explicitly unverified;
- unresolved claims → a human decision.

Audit the smallest useful document surface first. For each candidate, record `id`, claim,
source of truth, actual evidence, and one disposition: `fix-doc`, `rewrite-doc`, `delete-doc`,
`supersede-adr`, `file-ticket`, `keep`, or `ask-human`. Separate:

- **drift** — prose disagrees with truth;
- **bloat** — prose says nothing code cannot say;
- **gap** — a reader needs a claim that no suitable owner records.

Do not edit an ADR into agreement with the present. Do not fix code merely to satisfy stale
documentation. Do not remove a document or comment that is the sole record of a behavior until
the behavior is pinned or a human explicitly accepts the loss.

## 3. Measure context load without fake precision

Find hotspots using cheap signals: very large or high-churn files, many concepts in one unit,
deep nesting, repeated domain terms, high fan-in, duplicate rules, dead paths, unclear names,
comment volume, and tests that execute without asserting the important behavior. Exclude generated
output and history from the ranking. Line count is evidence of a question, not a verdict.

For each candidate, write one sentence for the reader cost: what must be remembered, searched,
or reconciled before a safe change. Prefer one root-cause item over several lens-specific symptoms.
Use this order unless the repository gives a better one:

1. warnings, formatting, and broken guardrails;
2. stale or duplicated guidance;
3. untested behavior needed to make a refactor safe;
4. duplicated rules, dead paths, and unnecessary dependencies;
5. dense units, confusing names, nesting, and comments;
6. architecture drift, only against a documented or user-requested architecture.

For `budget=small`, inspect the highest-leverage hotspots only. `standard` covers each selected
lens once. `deep` adds ripple tracing and a fresh adversarial review for material changes. Stop
at `max_items` after grouping by cause, not before verifying the candidates.

## 4. Scan, verify, and route

Apply the relevant lenses from housekeeping: warnings, bugs, unit/integration test gaps,
duplication, library consistency, architecture drift, smells, and formatting. Apply no-comment
to code comments: rename, extract, or encode first; delete commented-out code and TODO/FIXME
promises; keep only why-comments, external constraints with sources, required markers, and
destructive-operation warnings. A comment about behavior belongs beside the behavior it protects,
and important behavior belongs in a test.

Every surviving finding needs:

```text
id · location · root cause · reader/context cost · risk/size
evidence: exact path:line, command/output, test, or authoritative source
confidence: confirmed | likely | unverified
smallest honest change · dependencies · disposition: now | ticket | drop
```

Use fact-check's strongest available method. A hypothesis without an artifact is not a finding.
Trace callers, dependents, tests, config, and sibling implementations before proposing deletion.
Kill taste-only findings, rules nobody documented, already-guarded issues, and duplicates.

Route `now` only to small, reversible, bounded work. Route design choices, broad refactors,
public-contract changes, missing tests, and real `L`/`XL` work to `ticket`. Route true but
low-value churn to `drop` and say why. For each ticket, search the tracker first, then prepare a
falsifiable triage brief with acceptance criteria, scope boundaries, evidence, honest size/risk,
and an explicit null-result outcome for investigative work. Show the exact ticket before filing.

## 5. Apply approved slices

The approval gate is explicit. `apply=approved` means an already-approved plan, not permission to
expand it. If no such approval exists, remain in report mode.

Order work so safety precedes simplification: establish or strengthen tests for load-bearing
behavior; fix formatter/linter setup; remove stale prose and comments; simplify names, branches,
or duplication; remove orphaned paths, tests, and configuration; then consider an architectural
move. Keep each slice behavior-preserving unless the user approved a behavior change.

Never add a wrapper, interface, flag, helper, DDD layer, Clean Architecture layer, or document
just to make a hotspot appear tidy. Add structure only when it reduces total reader cost and the
repo's guidance or user intent supports it. Split dense code when names make the behavior easier
to hold, even if the diff gains lines.

After every slice, run the narrowest relevant tests, then the repository's build/test/lint checks.
For a material diff, invoke code-review-grill's fresh review and resolve findings before declaring
the slice done. Show the diff; do not commit, push, merge, or post as a side effect.

## 6. Close the run

Report in this order:

1. `uncovered` and failed or unavailable checks;
2. baseline and final signals (including comments/prose removed, if measured);
3. documentation truth decisions and preserved sole records;
4. applied changes, grouped by root cause, with tests;
5. `ticket` and `drop` items, including user decisions and duplicate checks;
6. remaining risks, assumptions, and the next smallest useful run.

Do not add a permanent report, summary index, or knowledge graph merely to preserve the run.
