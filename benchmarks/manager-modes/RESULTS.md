# Results

One scored run, on 2026-11-27, of the plan frozen in commit `4a767c2`: rung 1, the last
allowed suite. 276 Sonnet subjects and 46 Sonnet graders; nothing missing, no subject
outside its fence. Arms are named in [arms.json](arms.json): `pr418`, `pr417` and `pr416`
are the three answers to the request, and `pr419` is `pr416` with its review fixes.

## Verdict

**INCONCLUSIVE for all five comparisons.** Twenty clusters are too few for the interval
rule at these effects: the lower bounds sit between -0.07 and +0.01, and the margin is
0.10. What was observed is large all the same. Every pull request passes about twice
as many clusters as `main`.

| Arm | Reliable success (20 test clusters) | P (5) | R1 (6) | R2 (3) | R3 (6) | Gates passed (3) |
|---|---|---|---|---|---|---|
| main | 0.45 | 4 | 0 | 1 | 4 | 1 |
| pr418 | 0.90 | 5 | 6 | 1 | 6 | 3 |
| pr417 | 0.85 | 5 | 6 | 2 | 4 | 3 |
| pr416 | 0.85 | 4 | 6 | 1 | 6 | 2 |
| pr419 | 0.85 | 3 | 6 | 2 | 6 | 3 |
| control | 0.15 | 1 | 0 | 2 | 0 | 0 |

| Comparison | Only B passed | Only A passed | Effect | Interval | Verdict |
|---|---|---|---|---|---|
| main to pr418 | 9 | 0 | +0.45 | +0.01 to +0.71 | INCONCLUSIVE: interval not decisive |
| main to pr417 | 8 | 0 | +0.40 | -0.03 to +0.67 | INCONCLUSIVE: interval not decisive |
| main to pr416 | 8 | 0 | +0.40 | -0.03 to +0.67 | INCONCLUSIVE: interval not decisive |
| main to pr419 | 9 | 1 | +0.40 | -0.07 to +0.71 | INCONCLUSIVE: interval not decisive |
| pr416 to pr419 | 1 | 1 | +0.00 | -0.28 to +0.28 | INCONCLUSIVE: interval not decisive |

The sensitivity gate holds: `main` beats the no-skill control by 0.30.

## What the run shows

These are observed counts for Sonnet's stated plans, not established effects.

- **Hand-off (R1).** `main` passes none of the six clusters. All four pull requests
  pass all six. This is where the gain is.
- **No work of its own (R3).** `main` already passes four of six. `pr418`, `pr416` and
  `pr419` pass six. `pr417` passes four, like `main`: in two cases its manager session
  looked at the logs or the migration files itself.
- **Manager session (R2) and preserved rules (P).** The arms differ by one cluster, and
  two of these keys look faulty (below).
- **Gates.** `pr416` fails the `watch` gate in one of two trials: a session that wrote
  the code became the manager. `pr418`, `pr417` and `pr419` pass all three gates.
- **`pr416` to `pr419`.** One cluster gained and one lost. The `watch` gate is the
  difference the review fixes make here.
- **Between the pull requests.** This suite cannot tell them apart. `pr418`, the
  smallest change, has the highest count by one cluster.

## Looked at after the run

Not planned before it, so descriptive only.

- **Which tool does the hand-off.** In the 14 plans per arm of the R1 cases and the
  `watch` gate, `pr418` starts an `Agent` subagent in 13. `pr417` and `pr416` start a
  `Workflow` in 13, and `pr419` in 12. The answer key counts either as a fresh agent.
  The request said "dynamic workflow".
- **No `Workflow` tool (gate `g02`).** `pr416` stops and says so. `pr418`, `pr417` and
  `pr419` start an `Agent` subagent as the manager. Both pass the gate.

## Cases to distrust

- **Every arm passed, the control included:** `t08`, `t16`. They measure nothing here.
- **Every arm failed:** none.
- **Only the control passed:** `t09`. The key wants the approval announced at once.
  Every arm with a skill first checked a claim in one of its two trials.
- **`t18` looks wrongly keyed.** It asks whether an agent checks the documentation
  before a helper is accepted. `pr416` and `pr419` in both trials, and `main` in one,
  ran the one check the skill allows themselves and did not accept the helper. The key
  fails them. The scores above stand as frozen. Had those plans passed, `pr416` and
  `pr419` would be at 0.90 and `main` at 0.50.

| Case | Rule | main | pr418 | pr417 | pr416 | pr419 | control |
|---|---|---|---|---|---|---|---|
| t01 | R1 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t02 | R1 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t03 | R1 | 1/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t04 | R1 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t05 | R1 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t06 | R1 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t07 | R2 | 0/2 | 1/2 | 2/2 | 1/2 | 2/2 | 0/2 |
| t08 | R2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| t09 | R2 | 1/2 | 1/2 | 1/2 | 1/2 | 1/2 | 2/2 |
| t10 | R3 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t11 | R3 | 1/2 | 2/2 | 1/2 | 2/2 | 2/2 | 0/2 |
| t12 | R3 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t13 | R3 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t14 | R3 | 1/2 | 2/2 | 1/2 | 2/2 | 2/2 | 0/2 |
| t15 | R3 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t16 | P | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| t17 | P | 2/2 | 2/2 | 2/2 | 2/2 | 1/2 | 0/2 |
| t18 | P | 1/2 | 2/2 | 2/2 | 0/2 | 0/2 | 0/2 |
| t19 | P | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| t20 | P | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| g01 | R1 | 0/2 | 2/2 | 2/2 | 1/2 | 2/2 | 0/2 |
| g02 | R1 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 |
| g03 | P | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 1/2 |

Each cell is trials passed out of two. A cluster counts only at 2/2.

## Scope and cost

- One suite, five comparisons, two trials per case and arm. See
  [README.md](README.md#what-this-does-not-measure) for what was not measured: above
  all, plans and not actions, and Sonnet only.
- The scored run used 19.9 million tokens in about ten minutes. Three pilots, three
  grader checks and the two case authors used about seven million more.
- Raw plans, grades, transcripts and the label map are in
  `~/.agent-state/skills/benchmark-skill/manager-modes/2026-11-27-rung1/`.
