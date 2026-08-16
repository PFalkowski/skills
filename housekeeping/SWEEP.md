# SWEEP — the code half

Step 5. Runs **after** the documentation is true, because half of these lenses judge the code
against what the docs say it should be. Against drifted docs they measure a system nobody built.

## The lenses

One agent per lens, blind to the others — a single agent asked to cover nine concerns covers the two
it finds interesting and reports the set as complete.

| Lens | Hunts | Evidence it must bring |
|---|---|---|
| `warnings` | Compiler / analyzer / linter warnings, including suppressed and baselined ones | The real build output, not a prediction from reading code |
| `bugs` | Latent defects: unhandled failure modes, races, leaks, swallowed exceptions, unchecked input | A concrete failure scenario: inputs and state → wrong outcome |
| `tests-unit` | Untested logic that would cost money to get wrong | The specific untested *behaviour*, never a coverage percentage |
| `tests-integration` | Seams that only fail assembled — persistence, HTTP, messaging, migrations, auth | The seam, and the failure the suite would not catch |
| `duplication` | One rule implemented twice — especially where the copies have *already diverged* | Both sites, and what each produces differently |
| `library-consistency` | Two dependencies doing one job (two HTTP clients, two ways to publish a domain event) | Usage counts, which one the docs chose, what the stragglers cost |
| `architecture-drift` | Departures from the architecture this repo **documents** — layering, DDD, ports & adapters | The documented rule being broken. An unstated rule is a proposal, not drift |
| `smells` | Oversized units, deep nesting, primitive obsession, dead code, ancient TODOs | What it costs the next person to touch it |
| `formatting` | Files the repo's own formatter would change; style rules configured but unenforced | The *setup* gap and a file count — not a list of files |

Ordering inside a run is deliberate: `warnings` and `formatting` are cheap and load-bearing (they
bury every later diff in noise if left), `architecture-drift` and `library-consistency` are the ones
that pay for the whole exercise, and `smells` is the one most likely to produce taste dressed as a
finding — which is why every candidate is refute-verified before a human sees it.

## What gets a candidate killed

The verifier is trying to refute it, and defaults to refuted when the evidence does not hold. The
usual deaths:

- **Taste.** "Not how I would write it" is not a cost.
- **A rule nobody wrote down.** Architecture drift against an unstated convention is a proposal —
  make it as one, in a ticket, not as a finding.
- **Already guarded.** A caller, a config, a guard clause or an existing test upstream prevents it.
- **Already covered.** The "untested" path has a test somewhere the surveyor did not look.
- **Deliberate.** A baselined warning, a duplication that is two rules that merely look alike, a
  suppression with a comment explaining itself.
- **Effort fantasy.** An `L` reported as `S`. The verifier may correct the estimate, and does.

## From candidates to a plan

Grouping is by **underlying cause, not by lens**: one god-class shows up as a smell, a coverage gap,
a duplication and a layering violation, and four tickets for one afternoon's work is how a backlog
stops meaning anything. Each item carries effort, risk, dependencies and a recommendation.

Two dependencies are not negotiable:

1. **Formatting and lint config go first**, or every later diff arrives buried in unrelated churn.
2. **Coverage goes before the refactor it protects.** A refactor landing on untested code is how a
   cleanup causes the outage — and that outage is attributed to housekeeping, correctly.

## Routing — the user decides, every time

| Recommendation | Means | Hand it to |
|---|---|---|
| `now` | Small, low-risk, self-contained, worth this session | `go-go-go` for one thing; the current session for a genuine `S` |
| `ticket` | Real work needing its own review, or a judgement this run should not make alone | [FILING.md](FILING.md) — and `nights-watch` / `nightshift` if an agent will take it |
| `drop` | True, but not worth the churn | Say so out loud. A backlog full of nobody's-doing-that is worse than a short one |

Take the do-now items in dependency order and stop when the user's appetite runs out — a partial
sweep that landed cleanly beats a complete one nobody will review. Whatever is left unstarted goes
back to the board or is explicitly dropped; **nothing is left implied**.

## Reporting the sweep

Lead with `uncovered` — a lens that never ran, or a candidate whose verifier died, is a concern that
was *not examined*, and it reads exactly like a clean one unless you say otherwise. Then the plan,
then what was actually done, then the links to what was filed.
