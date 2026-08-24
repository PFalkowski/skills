# desloppify runbook

This is the operating detail for a `desloppify` run. Keep the active context small: inspect
the files that decide the next step, retain evidence and decisions, and stop a lane when it
produces no new signal. Do not read the whole repository just to prove that a scan exists.

## 1. Resolve the run

Parse the arguments from `SKILL.md`, state the resolved values, and bind each one to the steps
that read it. If a value is omitted, use the defaults there.

- `scope` bounds every scan in this runbook. Pass it as the path argument to the inventory
  commands below, restrict the step-2 document surface to documents inside it plus the
  repository-root entry points, and restrict the step-3 hotspot ranking to files under it.
  Files outside `scope` are `uncovered`, never `clean`.
- `focus` selects which steps run. `all` runs steps 2–5; `docs` runs step 2 only; `comments`
  runs step 4's no-comment pass only; `code` runs steps 3–4 without the document audit;
  `architecture` runs step 3 item 6 only; `tests` runs the test-gap lenses only. A step a
  `focus` value excludes is reported as `uncovered`, never as clean.
- `mode` selects what a run covers; `apply` selects whether it writes. They are orthogonal and
  neither overrides the other. `mode=item` takes its target from `scope`, which is mandatory in
  that mode and must resolve to a single file or unit — skip the step-3 ranking entirely and go
  straight to step 4 for that unit. `mode=campaign` is a bounded set of approved cleanup slices.
  `mode=assess` produces a plan and makes no edits at all.
- `architecture` selects the reference for step 3 item 6. `auto` judges drift only against an
  architecture the repository documents, and skips the item as `uncovered` when none is
  documented. `repo` does the same but fails the step loudly rather than skipping. `ddd` and
  `clean` supply a reference the user asserted; judge against it and record in the report that
  it is user-asserted, not repo-documented.
- `tracker` selects a read target and never authorises a write. `auto` detects the repository's
  tracker from its remote and configuration; `none` suppresses the step-4 tracker search and
  emits `ticket` items as text only.
- `max_items` caps reported root causes — not candidates, not findings, not applied slices.
- `budget` bounds depth. `small` inspects the highest-leverage hotspots only; `standard` covers
  each selected lens once; `deep` adds ripple tracing across callers, dependents, and sibling
  implementations.

Report mode — `apply=report`, the default — means the working tree is left exactly as found: no
file is created, edited, renamed, or deleted, no command that writes is run, and no external
system is written to. Producing the findings and the diff to show is the whole of the work.

Start with a bounded inventory. Never page the whole file listing into context — the listing of
a large repository costs more to read than most of what this run will save:

```bash
git status --short --branch
git ls-files -- $scope | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -30
git status --short --ignored -- $scope   # the `uncovered` list, named explicitly
```

Read repository instructions and architecture sources before source files: `AGENTS.md`,
`CLAUDE.md`, contributing guides, README entry points, ADRs, package/build manifests, CI, and
the configured formatter/linter/test commands. Then **run** the discovered build, test, lint,
and formatter-check commands once and record their exact output as the baseline, including
failures. A command that does not exist or cannot run is recorded under `uncovered`, never as
passing. This baseline runs in every mode, including `mode=assess`; step 3 item 1 and step 6
both read from it.

Record ignored, generated, inaccessible, and out-of-scope areas as `uncovered`; never imply
that they are clean.

For `mode=campaign` with `apply=approved`, isolate the work first if the current worktree is not
already dedicated. Do not overwrite unrelated user changes.

## 2. Establish truth before taste

Establish document truth using the doctrine in
[housekeeping/DOC-TRIAGE.md](../housekeeping/DOC-TRIAGE.md): the source-of-truth ladder, the
drift / bloat / gap split, contradictions and orphans, and the dispositions. Do not restate it
here — a second copy drifts, and nothing in this repository would notice when it did.

Audit the smallest useful document surface inside `scope` first, and record per candidate what
that doctrine requires: `id`, claim, source of truth, actual evidence, and one disposition.

Do not edit an ADR into agreement with the present. Do not fix code merely to satisfy stale
documentation. Do not remove a document, comment, or test that is the sole record of a behavior
until the behavior is pinned elsewhere or a human explicitly accepts the loss. A test with no
callers is not thereby orphaned — having no dependents is what a pin looks like; a test is
orphaned only when the behavior it asserts no longer exists.

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
6. architecture drift, against the reference `architecture` selected in step 1.

`budget` is bound in step 1 and governs depth only. The fresh review in step 5 is required at
every budget for a material diff; `deep` additionally applies that review to the *plan*, before
any slice is written.

## 4. Scan, verify, and route

For anything broader than one or two named hotspots, dispatch the `housekeeping-sweep` workflow
as [housekeeping](../housekeeping/SKILL.md) step 5 describes — one agent per lens, blind to the
others, because a single agent asked to cover nine concerns covers the two it finds interesting
and reports the set as complete. Inline single-agent lens work is limited to `mode=item` on a
named hotspot, and the report must then say which lenses were never fanned out. The lens
catalogue, the kill-list, and the routing rules live in
[housekeeping/SWEEP.md](../housekeeping/SWEEP.md).

Apply no-comment to code comments: rename, extract, or encode first; delete commented-out code
and TODO/FIXME promises. The exempt categories are
[ALLOWLIST.md](../no-comment/ALLOWLIST.md) and a project's own additions, which override it — do
not paraphrase that list here. A comment about behavior belongs beside the behavior it protects,
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
Kill taste-only findings, rules nobody documented, already-guarded issues, and duplicates. After
grouping by cause, stop at `max_items` root causes — never before verifying the candidates.

Route each root cause to `now`, `ticket`, or `drop` by the rules in
[housekeeping/SWEEP.md](../housekeeping/SWEEP.md); `now` is only for small, reversible, bounded
work. Unless `tracker=none`, search the resolved tracker first for duplicates, then prepare a
falsifiable triage brief with acceptance criteria, scope boundaries, evidence, honest size/risk,
and an explicit null-result outcome for investigative work.

**ALWAYS ASK before filing.** Show, per ticket, the tracker and project, the title, the labels,
and the full body, and wait for the user's answer. File only the ones they accept; report the
ones they cut so a later run does not re-raise them. Never transition, close, comment on, or
label an existing ticket as a side effect — authoritative externals are read-only, even when
the audit proves one of them wrong.

## 5. Apply approved slices

The approval gate is explicit and recorded. `apply=approved` asserts that a plan was already
approved; it is not itself the approval, and it never widens one. Before applying anything,
restate the approval you are relying on — who gave it, when, and which finding ids it covered —
and apply only those ids. If you cannot quote it, remain in report mode and ask. This gate is
not waived by any calling skill or by whatever-mode: a skill that drives desloppify inherits the
gate, it does not absorb it.

Order work so safety precedes simplification: establish or strengthen tests for load-bearing
behavior; fix formatter/linter setup; remove stale prose and comments; simplify names, branches,
or duplication; remove orphaned paths, tests, and configuration; then consider an architectural
move. Keep each slice behavior-preserving unless the user approved a behavior change.

Never add a wrapper, interface, flag, helper, DDD layer, Clean Architecture layer, or document
just to make a hotspot appear tidy. Add structure only when it reduces total reader cost and the
repo's guidance or user intent supports it. Split dense code when names make the behavior easier
to hold, even if the diff gains lines.

After every slice, run the narrowest relevant tests, then the repository's build/test/lint checks,
and compare them against the step-1 baseline. For a material diff, invoke code-review-grill's
fresh review at every budget and resolve findings before declaring the slice done.

Show the diff. If the run is in an isolated branch or worktree, commit each approved slice there
as it is verified — the isolation is what makes committing safe, and an uncommitted slice in a
worktree the user did not choose is not recoverable work. The prohibition applies to the user's
own branch: never commit, push, merge, or post there as a side effect.

## 6. Close the run

Report in this order:

1. where the work is — for a campaign, the branch name and worktree path, and the exact command
   to bring it onto the user's branch or to discard it;
2. `uncovered` and failed or unavailable checks;
3. baseline and final signals (including comments/prose removed, if measured);
4. documentation truth decisions and preserved sole records;
5. applied changes, grouped by root cause, with tests;
6. `ticket` and `drop` items, including user decisions and duplicate checks;
7. remaining risks, assumptions, and the next smallest useful run.

Do not add a permanent report, summary index, or knowledge graph merely to preserve the run.
