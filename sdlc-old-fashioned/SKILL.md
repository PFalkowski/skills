---
name: sdlc-old-fashioned
description: 'Run a gated, delegated lifecycle for high-stakes work or "run this as a workflow" requests.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# sdlc-old-fashioned — software the way it used to be made

As **conductor**, delegate phases, hold gates and keep artifacts. Never skip a phase. Baseline checks before work, re-run them green before merge, and close with a retrospective. Default to a fresh Claude process per phase with a brief and captured transcript; see [The handover protocol](#the-handover-protocol--a-fresh-context-per-phase).

## Step 0 — Right-size first (don't over-process)

Confirm the work deserves this weight. A typo, a one-liner, a throwaway spike → **stop, say "this is a go-go-go job, not an old-fashioned one", and exit.** It is for changes where getting it wrong is costly: new features, subsystems, public APIs, data/schema, money, security, anything hard to reverse.

For a generic workflow request on load-bearing work, check whether [dynamic-workflow mode](references/workflow-mode.md), dispatching `workflows/sdlc-workhorse.js`, is intended before writing an ad-hoc workflow.

## Step 0.5 — Set two dials before Step 1

State both choices up front, then run accordingly:

**Dial 1 — Autonomy: attended or autonomous?**
- **Attended** *(default)* — you stop at every gate for the human; an unresolved question blocks until answered. Use for the highest-stakes, hardest-to-reverse work.
- **Autonomous** — runs the lifecycle unattended, **deferring questions to the backlog file** (nightshift-style) instead of stopping, and pausing only at genuinely irreversible gates (merge to a protected branch, schema/data migration, publish, spend). Drive it with `nightshift` over the Step-6 backlog. Pick this when the user says "run it overnight", "unattended", "autonomous", or hands off and walks away.

**Dial 2 — Execution model: how each phase runs.** Whichever you pick, state the **model tier and reasoning effort** per phase up front rather than leaving it to chance — cheap tiers for mechanical phases, the strongest tier for anything adversarial or hard to reverse.
- **Fresh process per phase** *(recommended default)* — each phase runs as its **own `claude` OS process** the conductor spawns, handed a written brief + the live `backlog.md`, with its **full transcript captured to disk**. The conductor reads back only the phase's short result and the backlog diff — never the whole transcript — so its context stays minimal and every step is independently auditable in its own console log. This is the model the rest of this skill assumes; mechanics in **`references/handover-protocol.md`**.
- **In-session subagents** — each phase a fresh subagent via the `Agent` tool. Lighter to launch, but transcripts aren't separate inspectable consoles and the orchestrator inherits more of each phase. Use when you don't need per-step process isolation or a standalone audit log.
- **Dynamic workflow** — the conductor dispatches `workflows/sdlc-workhorse.js`, never an ad-hoc script: this lifecycle with model tier and effort set per phase **in code**, the gates as control flow, independent slices pipelined. When, dispatch args, fallback and report fields: **`references/workflow-mode.md`**.
- **Single agent** — one context carries every phase. Simplest, but context bloats and phase independence is lost. Reserve it for the smaller end of old-fashioned work.

## Step 0.7 — Orient, then isolate on a worktree

**Orient first.** Before touching anything, run `pwd`, `git status`, and `git worktree list` — know exactly where you are, what's already dirty, and what worktrees already exist.

**Isolate by default.** Unless the user overrides, do the work on its **own git worktree + branch** (harness `EnterWorktree`, or `git worktree add`), named for the feature. The main checkout stays clean, and every spawned phase process (Dial 2) operates in that one isolated tree. Override on request — *"work in place" / "no worktree"* — and instead just branch inside the current checkout.

**Clean up on a go.** Once the PR is open and the branch is pushed, **propose removing the worktree** — confirm, never auto-delete; this is [`wrap-up`](../wrap-up/SKILL.md)'s sweep, run in Phase 13. Nothing has to be rescued first: the run's state root is `~/.agent-state/<repo-slug>/sdlc-old-fashioned/` (`<state>/` below), outside the tree, so the per-phase logs and the backlog outlive the worktree — see [agent-state.md](../docs/agent-state.md). What the PR must carry, it carries because it was published there, not because a file survived: the ADRs and the runbooks are committed, and the spec, plan, review notes, verdicts and retro are posted on the PR.

## The lifecycle — each phase has a GATE; do not advance until it's met

| # | Phase | Delegate to | Gate / artifact |
|---|---|---|---|
| 1 | **Guardrails & baseline** | read the repo's own docs; run its checks | Repo's known pitfalls catalogued from `LESSONS-LEARNED*` (**through its index**, not end to end), `docs/adr/`, README, CONTRIBUTING, `CLAUDE.md`. The guardrails the work needs (linter, formatter, unit **and** integration tests, CI that runs them) identified and confirmed present. A **green baseline** captured by running them once — re-run at the Merge gate. Missing guardrails **flagged to the user and evolved** (added as groundwork on a go / in autonomous mode, else filed as an issue). |
| 2 | **Specify** | `to-prd` (or a written spec doc) | A written spec/PRD: problem, goal, scope, **non-goals**, success criteria. **For bug work this phase is an RCA** — see below. |
| 3 | **Grill requirements** | `grill-with-docs` (fallback `grill-me`); record crystallised decisions via a `to-adr` subagent | Every load-bearing ambiguity resolved; acceptance criteria written; domain language + ADRs / `CONTEXT.md` updated as decisions crystallise. |
| 4 | **Plan (design)** | `Plan` agent, or a written `plan.md` / design doc | A written implementation plan: the approach, key components & interfaces, data / control flow, failure modes, **alternatives considered and why rejected**, and the test strategy. It **ends with its open questions**, each marked for the grill or for the first slice. Still **no code**. |
| 5 | **Adversarial plan review** | **fresh process** via `grill-with-docs` (fallback `grill-me`; or `code-review-grill` aimed at the plan doc) | A fresh agent that **didn't write the plan** grills it: hidden coupling, unhandled failure modes, wrong abstraction, a cheaper path, does it actually satisfy the spec? Every hole answered or folded into the plan; unresolved concerns → issues; plan **re-approved before any code**. Reopens a requirement → loop back to 3. |
| 6 | **Slice & pick up** | **internal backlog** via `prompt-backlog` *(default)*; `to-issues` for bigger teams / projects | Approved plan broken into tracer-bullet **vertical slices**, each independently shippable. **Board:** move each item to *In Progress* the moment you pick it up. |
| 7 | **Test-first (RED)** | `tdd` | Per slice: a **failing** test that encodes its acceptance criterion — written *before* any implementation. A guard or invariant test is RED only once it has been **watched to fail** on a known-bad input as well as pass on a known-good one — a test nobody has seen fail certifies nothing, and a green one stops anyone looking again. If it decides a semantic property by pattern-matching and keeps needing the pattern narrowed, split it: enumerate coverage statically, prove behaviour by running it. |
| 8 | **Implement → GREEN → refactor** | `tdd`, under `less-is-more` + `no-comment` | Minimal code to pass (GREEN), then refactor with tests green. Loop 7–8 per slice. Refactoring and behaviour changes go in **separate commits**, so each can be reviewed and reverted on its own. When the PR is opened, its author re-reads the description against the diff and adds **manual-testing notes**: what was tried by hand, and how a reviewer can repeat it. Every line is written to the **[standing quality standard](#the-quality-standard--always-on-for-every-line-of-code)**. |
| 9 | **Adversarial code review** | `code-review-grill`, grading against `less-is-more` + `no-comment` | Fresh-agent grill of the diff, judged for **correctness and for the quality standard alike**; an autonomous dial answers its Step 7, an attended one asks the human. Mechanical fixes on changed lines are applied by `fix-pr` headless. Other findings that meet the posting bar ([`code-review-grill` REFERENCE, § The bar](../code-review-grill/REFERENCE.md#the-bar--what-may-be-posted-inline-or-fixed-in-this-pr): in the diff **and** merge-relevant) are left as **unresolved PR comments** for Phase 10; everything else verified true becomes **one class issue per defect shape** and does not hold the PR. A security or data-loss issue is filed at blocker priority and named to the user. |
| 10 | **Refactor / deepen** | `improve-codebase-architecture`, `less-is-more` | The unresolved Phase-9 comments are addressed (a quality-standard finding on the diff is among them, see below); the class issues Phase 9 filed stay filed and do not hold the PR. If it reopens behaviour, loop back to 7. |
| 11 | **Document** | README / `docs/adr` / CHANGELOG / API docs | User-facing **and** architectural docs match the shipped behaviour: usage/README updated, an ADR for each load-bearing decision, a changelog entry. Docs ship **in the same PR** as the code, not "later". **An index row is a pointer, not a copy** — an ADR index, a lessons index, a process ledger gets title, status and the decision in one line; the argument stays in the record it points at. An index is read by every session that orients; one carrying the reasoning outgrows the records it indexes and is paid for on every read. **Production code also ships the signal needed to operate it** — a change is not done until its failure modes are observable: the new failure path logs, the job or worker reports success and failure, nothing is swallowed silently, and instrumentation removed with old code is replaced. Same standing as docs, and for the same reason: added "later" means never, and the cost lands on whoever is awake when it breaks. |
| 12 | **Merge** | `merge-stack` | Green CI + review resolved + docs updated + **Phase-1 baseline re-run green** (no new lint/format/test regressions). Land — **only on explicit human go** for protected/default branches. **Board:** move the item to *Done/Closed* on merge. The backlog is live run scaffolding, not a deliverable: it sits under the state root outside the tree, so it never reaches the merged tree and needs no deleting commit. Once the PR is up, the tracker/PR is the source of truth. |
| 13 | **Retrospective & close-out** | `wrap-up` (ship → sweep → account); the retro's own findings still go to `evolve-skill` / `write-a-skill` / `to-issues` / `prompt-backlog` | Mine the session for blockers, ambiguities, friction, and what the conductor's own briefs got wrong; commit the short retro note **first** so it ships with the branch. Then `wrap-up` closes: **evolve** what can be evolved (skills, docs), **file** what needs planning, **flag remaining blockers** for the user, and sweep the worktree. Output: **a few lines** — what was evolved, what was filed, what's still blocking. Not a narrative. |

**Guardrails & baseline (Phase 1).** Read relevant pitfalls from `LESSONS-LEARNED*`, `docs/adr/`, README, CONTRIBUTING and `CLAUDE.md`. Route through lessons/ADR indexes; never read archives end to end. If an index is absent, add one as groundwork using `postmortem`'s shape. Confirm required linter, formatter, unit/integration tests and CI; identify destructive modes before running. Scope auto-fixers to slice files, preferring check mode plus manual fixes. Run the baseline once; **stop and surface any red baseline**. Flag missing guardrails, add them with a go or autonomously, otherwise file the gaps. Re-run the same baseline at Phase 12.

Post spec, plan, review notes, verdicts and retro on the PR; commit ADRs, runbooks and lessons entries ([agent-state.md](../docs/agent-state.md)). A repo's `CLAUDE.md` may override the committed home for process records; link those from the PR. State the run root and the setting that moves it in-tree in one line. Briefs/logs are inspectable scaffolding, not PR content. Never ignore `.agents/` wholesale; it may contain committed team skills.

**Plan & its adversarial review (Phases 4–5).** Spawn a reviewer that did not author the written plan. Brief it to use [inversion](../invert/SKILL.md): name three failure conditions and check the plan against them. Slice only an approved plan; otherwise return to design or requirements. Stop paper review once remaining questions require execution: answer them in the first slice with a probe or guard test and no production change. Optional `reflect` focuses the review.

**The quality standard — always on for every line of code.** Two skills bind every code phase of this lifecycle.

- **[`less-is-more`](../less-is-more/SKILL.md)** — code is a liability, so inside the slice's blast radius make the smallest *architecturally honest* change. Modify code you understand instead of bolting a parallel path beside it, search the repo before writing a second implementation of something, add no interface for one implementation or flag for one caller, and delete what the change orphans. The measure is **cognitive load, not line count**: splitting dense cleverness into named parts is *less* even when it adds lines.
- **[`no-comment`](../no-comment/SKILL.md)** — a comment is usually a failure to say it in code. Try a better name, then an extracted function, then a type. A comment that survives all three states **why**, never what. Commented-out code and comments that have drifted from the code beneath them are deleted on sight.

Phases 8–10 use both skills; name them in every brief. Phase 9 grades the diff against them: unnecessary parallel paths, one-caller abstractions, replaceable comments and excess code fail even with green tests. This file's phase-table rows 7–9 document quality and test-first gates: cite them for `kind: gate` findings on the diff. Those meet the posting bar and must be addressed in Phase 10; off-diff instances go to class issues.

**Board housekeeping (throughout).** Move an item to **In Progress** the instant you pick it up (Phase 6) and to **Done/Closed** the instant it merges (Phase 12). And **guard the scope**: the moment you discover work outside the current slice, do **not** silently absorb it — **file it as an issue / backlog item on the spot** and carry on. Same discipline whether the board is GitHub Issues, Azure DevOps, or the local `<state>/backlog.md`.

**The backlog — live source of truth (Step 6).** Keep `<state>/backlog.md` discoverable for resumption and as the remote tracker's fallback. Its top **`Current` block** names active slice, phase, last run/transcript and timestamp; its slice table records `Todo`/`Doing`/`Done`, phase and last run. Each phase updates it before exiting as part of its gate; the conductor records each gate decision before the next dispatch. Use `to-issues` when a team needs shared pickup. This is run scaffolding under the state root, outside the tree: it survives worktree cleanup without entering the merged tree. File every still-open item to the tracker or PR before Phase 13 closes. Schema: `references/handover-protocol.md`.

**Retrospective & close-out (Phase 13).** Mine blockers, ambiguity, friction and each `RESULT`'s brief corrections. Hand the findings to [`wrap-up`](../wrap-up/SKILL.md)'s ship/sweep/account pass:

Commit a minimal retro before `wrap-up`: what evolved, what was filed, and remaining blockers. No narrative.

## Optional phases — the agent's call

All thirteen phases are mandatory; these six additions are optional at the phase agent's discretion, without permission. If a trigger clearly applies but is skipped, explain in `RESULT` for the conductor to review.

| Optional step | Slots | Take it when |
|---|---|---|
| [`triage`](../triage/SKILL.md) | before Phase 2 | The work arrived as a pile of tickets rather than a stated goal. Sorts them into lanes and applies one bar — specified well enough **and** actually wanted now — so Phase 2 specifies something real. |
| [`reflect`](../reflect/SKILL.md) | before Phases 3 and 5 | The spec or plan rests on more assumptions than you can afford to grill. Ledger them and rank by **load**: the high-load inferred ones set the grill's agenda and the `fact-check` list; the low-load ones are defaulted in one line and never grilled. Choosing where the adversarial passes go is what keeps them to a few. |
| [`fact-check`](../fact-check/SKILL.md) | during Phases 4–5 | The design rests on a claim that is expensive to be wrong about: a library's actual behaviour, a rate limit, a performance characteristic, a cost, a regex. Ground it by local experiment or two authoritative sources **before** the plan depends on it. Cheapest possible place to kill a wrong assumption. |
| [`housekeeping`](../housekeeping/SKILL.md) | around Phase 11 | Phase 11 finds the docs have drifted from the code more widely than this change touches. Audits doc-versus-code drift, bloat and gaps rather than patching only what you happened to notice. |
| [`context-reduction`](../context-reduction/SKILL.md) | after Phase 10 | Phase 9 keeps surfacing prose the code should have carried. This is `no-comment` at repository scale — a gated deletion campaign, not a per-comment decision — so suggest the human run `/context-reduction` (manual-only) as its own work, not inside a slice. |
| [`postmortem`](../postmortem/SKILL.md) | with Phase 13 | The run involved a production incident, or a bug that had already escaped to users. Appends the entry to `LESSONS-LEARNED.md` — which **Phase 1 reads on the next run**. That is the loop closing, and it is the only optional step that makes future runs better rather than this one. |

**Root-cause analysis — bug work only.** Phase 2 establishes the cause, not just the symptom; Phase 7's failing test encodes it. If RCA needs more than brief reasoning, dispatch a separate phase/brief to `diagnose` or the available debugging skill.

## The handover protocol — a fresh context per phase

Default execution uses a fresh Claude process per phase; the conductor holds gates/backlog, not phase context. Mechanics, commands and templates: `references/handover-protocol.md`.

1. **Brief** — use `handoff`: phase, gate, compact prior decisions, pointers (not pasted content) to `<state>/backlog.md` and artifacts. Save `<state>/runs/NN-<phase>.brief.md`. Name falsifiable assumptions; every count/inventory includes the filter or command that produced it (its **lens**) so the receiver can re-derive it.
2. **Spawn** — pipe the brief into a new `claude` process (`claude -p …`) at a model tier that fits the phase, capturing the whole run to `<state>/runs/NN-<phase>.log` **and** the harness's canonical session `.jsonl`. One process at a time — the gates keep phases sequential, so there is no working-tree contention.
3. **Work to the gate** — the phase uses its owning skill, meets the gate, updates `backlog.md` (state, phase, `Current`, timestamp), writes artifacts, files out-of-scope work, and prints a ≤10-line `RESULT`. Mandatory last line: what was wrong in its brief.
4. **Consume thin** — the conductor reads back **only** that `RESULT` and the backlog diff, checks the gate, records its decision in the backlog, and either advances or loops the phase. It never ingests the child's full transcript — that lives on disk for the human and the audit trail.

**Context discipline.** Compress early and often, and hand over to a fresh context whenever one would do the next step better than the current one. **The exception:** a conductor that is only writing briefs and consuming `RESULT`s accumulates almost nothing, so while it is orchestrating subagents, don't hand over merely because the session is long — measure the bloat, don't assume it.

**Irreversible gates are not delegated to an unattended child.** Phase 12 merge to a protected branch, publish, migration, or spend: the spawned agent stops *at* the gate and hands the action back for the human go (attended) or logs it for the conductor to run under the usual stop-and-confirm. Never let a `--dangerously-skip-permissions` child cross an irreversible line.

## Discipline

- Enforce the phase gates: grilled spec → reviewed plan → observed RED → GREEN → review → merge → retrospective/close-out. Loop back when review or refactoring reopens requirements or behaviour.
- Measure scope against the recorded branch point/merge base (`<base>...HEAD`), never tip-to-tip against a moving remote ref. File out-of-scope discoveries immediately; keep board state current.
- Every phase leaves its artifact (brief, checks, spec/ADR/plan, issue/test, PR comment/commit/docs, transcript or retro). The PR carries the durable set; run logs carry proof. Preserve the storage rules above.
- When a phase dies, change one retry variable at a time (resume, fresh process, model). If it repeatedly dies while writing, request incremental artifact writes. If its skill is missing or delegation keeps failing, perform it manually to the same standard and record that loss of independence in the backlog.
- Irreversible or outward-facing actions (shared-branch merge, publication, schema/data migration, spend) require explicit human go. In autonomous mode, decide reversible questions and log defaults in the backlog; irreversible gates still block. Attended runs retain their gate approvals.

## Choosing between this and go-go-go

| | **sdlc-old-fashioned** | **go-go-go** |
|---|---|---|
| Optimises for | correctness, design, paper trail | speed to a raised PR |
| Starts from | the repo's guardrails, then a problem to specify | whatever state the repo is in |
| Requirements | grilled until sharp; the plan grilled before code | inferred; ask only on hard ambiguity |
| Gates held by | attended: the conductor, with the human; autonomous: the conductor, deferring to the backlog; dynamic workflow: the script's control flow | nothing; four stop conditions |
| Questions | attended: block; autonomous: reversible → default + logged, irreversible → stop | decided and noted |
| Best for | features, subsystems, high-stakes change | fixes, chores, spikes, "just ship it" |

Running the lifecycle as one script is the dynamic-workflow mode ([references/workflow-mode.md](references/workflow-mode.md)).

When in doubt, ask the user one question: *"proper full lifecycle, or just ship it?"* — then, if it's the lifecycle: *"are you staying at the gates, or should it run itself?"*
