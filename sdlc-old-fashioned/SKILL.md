---
name: sdlc-old-fashioned
description: "The rigorous, by-the-book SDLC process — software the way it used to be made: orient & isolate on a worktree → baseline the guardrails → spec → grilled requirements → design & adversarially review the plan → tests-first (TDD) → implement → adversarial review → refactor → document → merge → retrospective, keeping the board honest throughout. Pick it up whenever BAU and quality matter like in the old days. Use when the user wants it done 'by the book' / properly / the right way / rigorously / formally / disciplined; asks for the 'full / whole / end-to-end lifecycle' or 'full SDLC'; 'production-grade' / production-ready / enterprise-grade / hardened / robust; 'spec it first' / spec-first / design-first / requirements-first / plan it out; 'no shortcuts' / no cutting corners / no hacks / no quick-and-dirty / thorough; or is building a real feature, epic, subsystem, public API, module, or any load-bearing / high-stakes / hard-to-reverse change. Do NOT use for quick fixes, hotfixes, throwaway scripts, spikes, prototypes/POCs, one-liners, or 'just ship it' — that's the go-go-go skill."
---

# sdlc-old-fashioned — software the way it used to be made

*"Measure twice, cut once. No shortcuts."* The patient, quality-first counterpart to **go-go-go**. You are the **conductor**: each phase is delegated to the focused skill that owns it; you sequence them, hold the gates, and keep the paper trail. The work is **bracketed by guardrails** — you baseline the repo's checks before touching anything and re-run them green before you merge — and **closed by a retrospective** that makes the next run better. Never skip a phase to save time — skipping is what go-go-go is for.

By default you don't *do* the phases — you **hand each one to a fresh Claude process**, briefed with the step and a summary of what came before, its full transcript captured to disk. Your own context stays minimal (you hold the gates and the backlog, not the work), and every step is independently inspectable in its own console log. See **[The handover protocol](#the-handover-protocol--a-fresh-context-per-phase)**.

## Step 0 — Right-size first (don't over-process)

Confirm the work deserves this weight. A typo, a one-liner, a throwaway spike → **stop, say "this is a go-go-go job, not an old-fashioned one", and exit.** It is for changes where getting it wrong is costly: new features, subsystems, public APIs, data/schema, money, security, anything hard to reverse.

## Step 0.5 — Set two dials before Step 1

Old-fashioned doesn't mean one fixed shape. State both choices up front, then run accordingly:

**Dial 1 — Autonomy: attended or autonomous?**
- **Attended** *(default)* — you stop at every gate for the human; an unresolved question blocks until answered. Use for the highest-stakes, hardest-to-reverse work.
- **Autonomous** — runs the lifecycle unattended, **deferring questions to the backlog file** (nightshift-style) instead of stopping, and pausing only at genuinely irreversible gates (merge to a protected branch, schema/data migration, publish, spend). Drive it with `nightshift` over the Step-6 backlog. Pick this when the user says "run it overnight", "unattended", "autonomous", or hands off and walks away.

**Dial 2 — Execution model: how each phase runs.** All three keep phases honest by isolating context; they differ in how hard the isolation is and how inspectable each step is.
- **Fresh process per phase** *(recommended default)* — each phase runs as its **own `claude` OS process** the conductor spawns, handed a written brief + the live `backlog.md`, with its **full transcript captured to disk**. The conductor reads back only the phase's short result and the backlog diff — never the whole transcript — so its context stays minimal and every step is independently auditable in its own console log. This is the model the rest of this skill assumes; mechanics in **`references/handover-protocol.md`**.
- **In-session subagents** — each phase a fresh subagent via the `Agent` tool. Lighter to launch, but transcripts aren't separate inspectable consoles and the orchestrator inherits more of each phase. Use when you don't need per-step process isolation or a standalone audit log.
- **Single agent** — one context carries every phase. Simplest, but context bloats and phase independence is lost. Reserve it for the smaller end of old-fashioned work.

## Step 0.7 — Orient, then isolate on a worktree

**Orient first.** Before touching anything, run `pwd`, `git status`, and `git worktree list` — know exactly where you are, what's already dirty, and what worktrees already exist.

**Isolate by default.** Unless the user overrides, do the work on its **own git worktree + branch** (harness `EnterWorktree`, or `git worktree add`), named for the feature. The main checkout stays clean, and every spawned phase process (Dial 2) operates in that one isolated tree. Override on request — *"work in place" / "no worktree"* — and instead just branch inside the current checkout.

**Clean up on a go.** Once the PR is open and the branch is pushed, **propose removing the worktree** — confirm, never auto-delete. The audit trail (briefs, run logs, plan, reflections) is committed in-repo and travels with the PR, so removing the disposable tree loses nothing.

## The lifecycle — each phase has a GATE; do not advance until it's met

| # | Phase | Delegate to | Gate / artifact |
|---|---|---|---|
| 1 | **Guardrails & baseline** | read the repo's own docs; run its checks | Repo's known pitfalls catalogued from `LESSONS-LEARNED*`, `docs/adr/`, README, CONTRIBUTING, `CLAUDE.md`. The guardrails the work needs (linter, formatter, unit **and** integration tests, CI that runs them) identified and confirmed present. A **green baseline** captured by running them once — re-run at the Merge gate. Missing guardrails **flagged to the user and evolved** (added as groundwork on a go / in autonomous mode, else filed as an issue). |
| 2 | **Specify** | `to-prd` (or a written spec doc) | A written spec/PRD: problem, goal, scope, **non-goals**, success criteria. |
| 3 | **Grill requirements** | `grill-with-docs` (fallback `grill-me`); record crystallised decisions via a `to-adr` subagent | Every load-bearing ambiguity resolved; acceptance criteria written; domain language + ADRs / `CONTEXT.md` updated as decisions crystallise. |
| 4 | **Plan (design)** | `Plan` agent, or a written `plan.md` / design doc | A written implementation plan: the approach, key components & interfaces, data / control flow, failure modes, **alternatives considered and why rejected**, and the test strategy. Still **no code**. |
| 5 | **Adversarial plan review** | **fresh process** via `grill-with-docs` (fallback `grill-me`; or `code-review-grill` aimed at the plan doc) | A fresh agent that **didn't write the plan** grills it: hidden coupling, unhandled failure modes, wrong abstraction, a cheaper path, does it actually satisfy the spec? Every hole answered or folded into the plan; unresolved concerns → issues; plan **re-approved before any code**. Reopens a requirement → loop back to 3. |
| 6 | **Slice & pick up** | **internal backlog** via `prompt-backlog` *(default)*; `to-issues` for bigger teams / projects | Approved plan broken into tracer-bullet **vertical slices**, each independently shippable. **Board:** move each item to *In Progress* the moment you pick it up. |
| 7 | **Test-first (RED)** | `tdd` | Per slice: a **failing** test that encodes its acceptance criterion — written *before* any implementation. |
| 8 | **Implement → GREEN → refactor** | `tdd` | Minimal code to pass (GREEN), then refactor with tests green. Loop 7–8 per slice. |
| 9 | **Adversarial code review** | `code-review-grill` | Fresh-agent grill of the diff. Auto-apply mechanical fixes; non-mechanical findings → **unresolved PR comments**; new work → issues. |
| 10 | **Refactor / deepen** | `improve-codebase-architecture` | Design debt the review surfaced is addressed — or consciously deferred as an issue. If it reopens behaviour, loop back to 7. |
| 11 | **Document** | README / `docs/adr` / CHANGELOG / API docs | User-facing **and** architectural docs match the shipped behaviour: usage/README updated, an ADR for each load-bearing decision, a changelog entry. Docs ship **in the same PR** as the code, not "later". |
| 12 | **Merge** | `merge-stack` | Green CI + review resolved + docs updated + **Phase-1 baseline re-run green** (no new lint/format/test regressions). Land — **only on explicit human go** for protected/default branches. **Board:** move the item to *Done/Closed* on merge. Once the PR is open and pushed, **propose removing the worktree** (Step 0.7) — confirm, never auto-delete. |
| 13 | **Retrospective** | `evolve-skill` / `write-a-skill`; `to-issues` / `prompt-backlog` | Mine the session for blockers, ambiguities, and friction. **Evolve autonomously** what can be evolved (skills, docs); **file issues** for what needs planning or can't be done now; **flag remaining blockers** for the user. Output: a short written reflection. |

**Guardrails & baseline (Phase 1).** The lifecycle *starts* by learning the repo's own hard-won rules, not the spec. Read `LESSONS-LEARNED*` / `docs/adr/` / README / CONTRIBUTING / `CLAUDE.md` and catalogue the pitfalls they warn about — those become checks you actively guard against. Then confirm the guardrails the change needs are in place (linter, formatter, unit + integration tests, and a CI that actually runs them) and **run them once now** to capture a green baseline. If the baseline is red before you start, **stop and surface it** — you don't build on a broken baseline. Any guardrail that's simply missing (no linter, no CI test run, no integration tests) is **flagged to the user**; with a go — or automatically in autonomous mode — add it as groundwork, otherwise file it as an issue so the gap is tracked. This exact baseline is **re-run at the Merge gate (Phase 12)** as the objective proof the change didn't regress the repo.

**Plan & its adversarial review (Phases 4–5).** The cheapest place to kill a design mistake is *before the first line of code*. So the approach gets written down (Phase 4) and then **grilled by a fresh context that didn't author it** (Phase 5) — the planner can't grade their own homework; a reviewer who inherits the planner's rationale inherits their blind spots too. Run the review as its own spawned process like every other phase. Only an approved plan gets sliced; a plan that fails review loops back to design or to requirements.

**Board housekeeping (throughout).** The tracker is a live mirror of reality, not an afterthought. Move an item to **In Progress** the instant you pick it up (Phase 6) and to **Done/Closed** the instant it merges (Phase 12). And **guard the scope**: the moment you discover work outside the current slice, do **not** silently absorb it — **file it as an issue / backlog item on the spot** and carry on. That single habit is what keeps feature creep out and each slice shippable. Same discipline whether the board is GitHub Issues, Azure DevOps, or the local `prompts/sdlc-backlog.md`.

**The backlog — live source of truth (Step 6).** One file, `prompts/sdlc-backlog.md` at the repo root, is the single place that always answers *"what's current?"* — it survives a cleared session and is the fallback whenever a remote tracker (GitHub Issues, Azure DevOps) isn't available. It carries a **`Current` block** at the top (active slice + phase + the run/transcript that last touched it + timestamp) and a per-slice table of state (`Todo`/`Doing`/`Done`) → phase → last run. **Every spawned phase updates it before exiting — that update is part of the gate**, so at any instant a fresh reader (human or the next spawned agent) learns the live state in one glance without replaying anything. Name it so anyone — or a fresh agent after `/clear` — can find and resume it; never park slices only in conversation memory. Promote to `to-issues` only when a real team needs to grab work off a shared tracker. Schema and template in `references/handover-protocol.md`.

**Retrospective (Phase 13).** Before you call it done, turn the lens on the session itself: what slowed you down, what was ambiguous, what broke, what you'd want to already know next time. Split the findings by what you can act on **now**:
- **Evolve now** — anything you can improve this session, you improve: sharpen a skill (`evolve-skill`), write a missing one (`write-a-skill`), or fix the docs/ADR/lessons file. Do it, don't just note it.
- **Plan it** — anything that needs a human decision or a future session → file as an issue / backlog item so it isn't lost.
- **Flag it** — anything blocking that's neither evolvable nor plannable → surface it plainly for the user.

The retrospective's own output is an artifact: a short written reflection, not just a feeling that it went fine.

## The handover protocol — a fresh context per phase

The conductor holds the gates and the backlog; it does **not** carry the work. Every phase in the table is executed by a **fresh Claude process** so no phase inherits another's context and each leaves a standalone, inspectable transcript. The loop is the same for all phases (full mechanics, commands, and templates in `references/handover-protocol.md`):

1. **Brief** — the conductor writes a short handover brief (using the `handoff` skill): *which* phase, its **gate**, a compact summary of what prior phases decided/produced, and **pointers** to `prompts/sdlc-backlog.md` and the artifacts (point, never paste). Save it to `docs/sdlc/runs/NN-<phase>.brief.md` — that file *is* the record of what the agent received.
2. **Spawn** — pipe the brief into a new `claude` process (`claude -p …`) at a model tier that fits the phase, capturing the whole run to `docs/sdlc/runs/NN-<phase>.log` **and** the harness's canonical session `.jsonl`. One process at a time — the gates keep phases sequential, so there is no working-tree contention.
3. **Work to the gate** — the phase agent delegates to its owning skill, meets the gate, **updates `backlog.md`** (state, phase, `Current` block, timestamp), writes its artifacts, files any out-of-scope find as an issue, and prints a ≤10-line `RESULT` summary.
4. **Consume thin** — the conductor reads back **only** that `RESULT` and the backlog diff, checks the gate, and either advances or loops the phase. It never ingests the child's full transcript — that lives on disk for the human and the audit trail.

**Golden rule:** what crosses back into the conductor is a summary and a backlog diff, never a transcript. That is what keeps the working context minimal while every step stays fully inspectable in its own console log.

**Irreversible gates are not delegated to an unattended child.** Phase 12 merge to a protected branch, publish, migration, or spend: the spawned agent stops *at* the gate and hands the action back for the human go (attended) or logs it for the conductor to run under the usual stop-and-confirm. Never let a `--dangerously-skip-permissions` child cross an irreversible line.

## Discipline

- **Gates are real.** No plan before the spec is grilled. No code before the plan is reviewed and a test is red. No review before it's green. No merge before it's reviewed.
- **Bracket the work with guardrails.** Never build on a red baseline (Phase 1); never merge without re-running it green (Phase 12). The baseline is the objective, repeatable proof the change didn't regress the repo — a missing linter/CI/integration-test guardrail is itself a finding to flag and evolve, not a step to skip.
- **Keep the board honest, guard the scope.** The tracker mirrors reality in real time — *In Progress* on pickup, *Done* on merge — and every out-of-scope discovery becomes a filed issue, never an unplanned detour.
- **Isolate the work.** Default to a dedicated worktree (Step 0.7) so the main checkout stays clean; orient with `pwd` / `git status` / `git worktree list` before you start, and propose removing the worktree once the PR is open — never auto-delete. The committed audit trail survives it.
- **Context stays minimal.** The conductor holds the gates and the backlog, not the work: it reads phase `RESULT` summaries and backlog diffs, never a child's full transcript. Inspection happens by opening the captured run log on disk, not by carrying it in context.
- **Every phase leaves an artifact** — phase brief, baseline result, spec, ADR, plan, issue, test, PR comment, commit, docs, run transcript, retro note. The auditable trail *is* the deliverable, not a side effect.
- **Conduct, don't solo.** Use the owning skill for each phase; this skill only sequences and holds the gates. If a phase's skill isn't installed, do that phase by hand to the same standard and say so.
- **Iterate, don't waterfall blindly.** The arrows go forward, but a review or refactor that reopens a requirement sends you back a phase — that's the process working, not failing.
- **Close with reflection.** The run isn't finished at merge; it's finished after the retrospective has evolved what it can and filed what it can't.
- **Stop-and-confirm** keeps the usual bar: irreversible or outward-facing actions (merge to a shared branch, publishing, schema/data migration, spend) need an explicit human go. Everything reversible: decide and proceed. In **autonomous** mode, reversible questions defer to the backlog (with the chosen answer logged) rather than stopping; irreversible ones still block for a human go.

## Choosing between this, sdlc-workhorse, and go-go-go

| | **sdlc-old-fashioned** | **sdlc-workhorse** | **go-go-go** |
|---|---|---|---|
| Optimises for | correctness, design, paper trail | the same, unattended | speed to a raised PR |
| Starts from | the repo's guardrails, then a problem to specify | the same (a red baseline aborts the run) | whatever state the repo is in |
| Requirements | grilled until sharp; the plan grilled before code | the same, by agents the script keeps fresh | inferred; ask only on hard ambiguity |
| Gates held by | **you**, at every phase | **the script** — a failed gate is a code path | nothing; four stop conditions |
| Questions | block until answered | reversible → default + logged; irreversible → stop | decided and noted |
| Best for | features, subsystems, high-stakes change | the same work when you won't be at the gates | fixes, chores, spikes, "just ship it" |

**[`sdlc-workhorse`](../sdlc-workhorse/SKILL.md) is this skill's autonomous counterpart** — the same lifecycle compiled into a Workflow. Reach for it when the work deserves this weight but you're handing it off and walking away; it ends at a merge-ready report rather than a merge, because it has no code path that can cross an irreversible line. Stay here when you want to stand at the gates yourself.

When in doubt, ask the user one question: *"proper full lifecycle, or just ship it?"* — then, if it's the lifecycle: *"are you staying at the gates, or should it run itself?"*
