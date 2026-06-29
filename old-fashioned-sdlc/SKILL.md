---
name: old-fashioned-sdlc
description: "The rigorous, by-the-book SDLC process — software the way it used to be made: spec → grilled requirements → tests-first (TDD) → implement → adversarial review → refactor → merge. Pick it up whenever BAU and quality matter like in the old days. Use when the user wants it done 'by the book' / properly / the right way / rigorously / formally / disciplined; asks for the 'full / whole / end-to-end lifecycle' or 'full SDLC'; 'production-grade' / production-ready / enterprise-grade / hardened / robust; 'spec it first' / spec-first / design-first / requirements-first / plan it out; 'no shortcuts' / no cutting corners / no hacks / no quick-and-dirty / thorough; or is building a real feature, epic, subsystem, public API, module, or any load-bearing / high-stakes / hard-to-reverse change. Do NOT use for quick fixes, hotfixes, throwaway scripts, spikes, prototypes/POCs, one-liners, or 'just ship it' — that's the go-go-go skill."
---

# old-fashioned-sdlc — software the way it used to be made

*"Measure twice, cut once. No shortcuts."* The patient, quality-first counterpart to **go-go-go**. You are the **conductor**: each phase is delegated to the focused skill that owns it; you sequence them, hold the gates, and keep the paper trail. Never skip a phase to save time — skipping is what go-go-go is for.

## Step 0 — Right-size first (don't over-process)

Confirm the work deserves this weight. A typo, a one-liner, a throwaway spike → **stop, say "this is a go-go-go job, not an old-fashioned one", and exit.** It is for changes where getting it wrong is costly: new features, subsystems, public APIs, data/schema, money, security, anything hard to reverse.

## Step 0.5 — Set two dials before Step 1

Old-fashioned doesn't mean one fixed shape. State both choices up front, then run accordingly:

**Dial 1 — Autonomy: attended or autonomous?**
- **Attended** *(default)* — you stop at every gate for the human; an unresolved question blocks until answered. Use for the highest-stakes, hardest-to-reverse work.
- **Autonomous** — runs the lifecycle unattended, **deferring questions to the backlog file** (nightshift-style) instead of stopping, and pausing only at genuinely irreversible gates (merge to a protected branch, schema/data migration, publish, spend). Drive it with `nightshift` over the Step-3 backlog. Pick this when the user says "run it overnight", "unattended", "autonomous", or hands off and walks away.

**Dial 2 — Topology: separate sub-agents or one agent?**
- **Separate sub-agent per phase** *(recommended default)* — each phase runs as a fresh subagent with a sharp brief; you are the conductor sequencing them and holding the gates. Keeps each context small and each phase honest — the reviewer never inherits the implementer's rationale, the grill never sees the spec author's blind spots.
- **Single agent** — one context carries every phase. Simpler to run, but context bloats and phase independence is lost. Reserve it for the smaller end of old-fashioned work.

## The lifecycle — each phase has a GATE; do not advance until it's met

| # | Phase | Delegate to | Gate / artifact |
|---|---|---|---|
| 1 | **Specify** | `to-prd` (or a written spec doc) | A written spec/PRD: problem, goal, scope, **non-goals**, success criteria. |
| 2 | **Grill requirements** | `grill-with-docs` (fallback `grill-me`); record crystallised decisions via a `to-adr` subagent | Every load-bearing ambiguity resolved; acceptance criteria written; domain language + ADRs / `CONTEXT.md` updated as decisions crystallise. |
| 3 | **Slice** | **internal backlog** via `prompt-backlog` *(default)*; `to-issues` for bigger teams / projects | Spec broken into tracer-bullet **vertical slices** — as backlog items or on the tracker — each independently shippable. |
| 4 | **Test-first (RED)** | `tdd` | Per slice: a **failing** test that encodes its acceptance criterion — written *before* any implementation. |
| 5 | **Implement → GREEN → refactor** | `tdd` | Minimal code to pass (GREEN), then refactor with tests green. Loop 4–5 per slice. |
| 6 | **Adversarial review** | `code-review-grill` | Fresh-agent grill of the diff. Auto-apply mechanical fixes; non-mechanical findings → **unresolved PR comments**; new work → issues. |
| 7 | **Refactor / deepen** | `improve-codebase-architecture` | Design debt the review surfaced is addressed — or consciously deferred as an issue. If it reopens behaviour, loop back to 4. |
| 8 | **Merge** | `merge-stack` | Green CI + review resolved, then land — **only on explicit human go** for protected/default branches. |

**Backlog persistence (Step 3).** The default slice artifact is a **locally persisted backlog** — and it's also the fallback whenever a remote tracker (GitHub Issues, Azure DevOps) isn't available or configured. Write it to a stable, self-describing path that survives a cleared session: `prompts/sdlc-backlog.md` at the repo root (follows the `prompt-backlog` convention). Name it so anyone — or a fresh agent after `/clear` — can find and resume it; never park slices only in conversation memory. Promote to `to-issues` only when a real team needs to grab work off a shared tracker.

## Discipline

- **Gates are real.** No code before the spec is grilled and a test is red. No review before it's green. No merge before it's reviewed.
- **Every phase leaves an artifact** — spec, ADR, issue, test, PR comment, commit. The auditable trail *is* the deliverable, not a side effect.
- **Conduct, don't solo.** Use the owning skill for each phase; this skill only sequences and holds the gates. If a phase's skill isn't installed, do that phase by hand to the same standard and say so.
- **Iterate, don't waterfall blindly.** The arrows go forward, but a review or refactor that reopens a requirement sends you back a phase — that's the process working, not failing.
- **Stop-and-confirm** keeps the usual bar: irreversible or outward-facing actions (merge to a shared branch, publishing, schema/data migration, spend) need an explicit human go. Everything reversible: decide and proceed. In **autonomous** mode, reversible questions defer to the backlog (with the chosen answer logged) rather than stopping; irreversible ones still block for a human go.

## Choosing between this and go-go-go

| | **old-fashioned-sdlc** | **go-go-go** |
|---|---|---|
| Optimises for | correctness, design, paper trail | speed to a raised PR |
| Starts from | a problem to specify | whatever state the repo is in |
| Requirements | grilled until sharp | inferred; ask only on hard ambiguity |
| Best for | features, subsystems, high-stakes change | fixes, chores, spikes, "just ship it" |

When in doubt about which to use, ask the user one question: *"proper full lifecycle, or just ship it?"*
