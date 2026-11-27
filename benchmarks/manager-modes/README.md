# Manager modes benchmark

Does a version of the `manager` skill make an agent act as its owner asked? The request
was: a session that did the work hands the manager role to a fresh agent, and a session
the human starts as the manager decides but never does the work itself.

The method is [benchmark-skill](../../benchmark-skill/SKILL.md)'s
([METHOD.md](../../benchmark-skill/METHOD.md)). This folder is the adapter that method
asks for when the subject is not a local text model.

## Frozen plan

Everything in this section was fixed before the scored run, except the two rules named
under [Departures from the method](#departures-from-the-method). Changing anything else
voids every earlier score.

- **Arms.** Six versions of the skill, pinned in [arms.json](arms.json): `main` (arm A
  of every comparison), four pull requests, and a control whose `SKILL.md` holds only
  the frontmatter.
- **Comparisons.** Each pull request against `main`, and `pr419` against `pr416`. Five
  comparisons, so the chance of one false REGRESSION is at most about five times alpha.
- **Subject.** A Sonnet subagent inside a Workflow, standing in for a Claude Code
  session. It reads one version of the skill and one situation, and returns the
  session's next actions as a list of tool uses plus its message to the human. Nothing
  is executed. Sonnet is a stand-in for whichever model runs the skill, so every result
  is a claim about Sonnet.
- **Grader.** A Sonnet subagent answers each case's yes/no criteria from the plan's own
  words. It sees the plans of one case under neutral names, in rotated order, and never
  the expected answers. [score.py](score.py) applies the answer key.
- **Primary outcome.** Reliable success: a cluster passes for an arm only when every
  case and every trial in it passes. Two trials per case and arm.
- **Decision.** Margin 0.10 (one situation in ten handled differently), alpha 0.05,
  at least 20 test clusters, quality floor 0.60, ceiling rate 0.90.
- **Splits.** `dev` cases tune the harness and validate the grader. `test` cases are
  the held-out sample. `gate` cases are critical and chosen on purpose: two rebuilt from
  review findings recorded before this experiment, one for a costly rule that must not
  change. They can block a verdict but do not count in the estimate.
- **Population and authors.** Rung 1: situations in which a session holding the skill
  must choose its next actions, written to [AUTHORING.md](AUTHORING.md) by an agent
  that saw the original request and `main`'s skill and no pull request. The test
  author is a different agent from the dev author. The gate cases are hand-picked.
- **Ladder.** Rung 2 would combine several rules in one case; rung 3 would use longer,
  messier situations. This run stops at rung 1 whatever it shows, to bound its cost,
  so rung 1 is the last allowed suite.
- **Missing results.** A subject or grader that returns nothing, or a plan with no
  action, message or next step, makes the run INVALID. Fix the cause and run the whole
  frozen experiment again.
- **Contamination.** A subject may use only `Read`, on its own skill folder and its
  case file. A grader may read only its own grader file. Anything else makes the run
  INVALID.

## Calibration record

Made on the development cases, with the control and `main` only, before the test
cases were written. No pull request's version ran on them.

- **Grader check.** The graders scored 18 of 18 example plans (good, bad, and good by
  another route) as keyed, after each change to the contract.
- **Pilot 1.** Two keys could not tell a session that starts a reviewer and still
  decides from one that hands over the deciding. Plans gained `then`, and keys `d01`
  and `d02` were rewritten.
- **Pilot 2.** One key counted the manager's own bookkeeping as work, and subjects
  listed reading the skill as an action. Key `d03` was narrowed and subjects were told
  to leave their reading out.
- **Pilot 3.** `main` passed 4 of 6 clusters and the control 1 of 6: below the ceiling
  by more than the margin, above the floor, and the control below `main` by more than
  the margin.
- **After pilot 3, not piloted again.** Subjects are told which files their copy
  holds, and the contamination rule allows a subject to list its own folder, which one
  pilot subject did.
- The control passed two development P cases in one pilot, so the specification now
  asks P cases for rules an agent would not follow unprompted. The test author wrote
  to that text.
- The test author read only [AUTHORING.md](AUTHORING.md) and `main`'s `manager`
  folder. The person who ran the benchmark wrote one of the arms and did not read the
  test cases before the scored run.

## Departures from the method

- **Sonnet subjects carry the launching session's house rules.** Every subject, the
  control included, had that session's `CLAUDE.md` files in its context, among them
  rules about when to use a manager and a workflow, and the live `manager` skill's
  description. It is the same for every arm, and the prompt says to set it aside.
- **An arm is the skill's own folder and its workflow script.** Edits a pull request
  makes elsewhere, such as to `save-tokens` or the shared rule templates, are not in
  the arm.
- **The grader attestation is thin.** `grader_validated` rests on 18 example plans
  written and keyed by the agent that wrote the development cases, not on outputs a
  person rated. No test key was checked before the run, and two look faulty
  ([RESULTS.md](RESULTS.md)).
- **The last prompt change was not piloted.** The calibration figures come from pilot
  3, before subjects were told which files their copy holds.
- **Two rules were changed after the first run, on review.** The plan was frozen
  with a rule to resume a run once when an agent returned nothing, which the method
  does not allow; nothing was missing, so it was never used. The contamination rule
  let a subject list its own folder; it is now `Read` only and covers graders. The
  first run passes both rules as they now read.

## What this does not measure

- What a session does, as opposed to what it plans. A workflow agent cannot spawn, so
  a hand-off can be stated but not carried out.
- Whether the skill loads for the right requests.
- Any model but Sonnet.
- Anything decisive. With 20 clusters and a margin of 0.10, the interval rule calls
  IMPROVEMENT only at twelve clusters gained and none lost, REGRESSION only at twelve
  lost, and never NO_MEANINGFUL_CHANGE. An arm A that passes nine of twenty, as `main`
  did, leaves eleven to gain, so INCONCLUSIVE was the only verdict the first run could
  reach against it. A gain of four clusters in ten with none lost needs 34 clusters; a
  gain of three in ten needs 59; agreement on every cluster needs 42.

## Run it

```bash
python3 benchmarks/manager-modes/prepare.py --state <state>      # snapshots the arms, writes the subject and grader views
# launch benchmarks/manager-modes/workflow.js with args from <state>/args-<split>.json
python3 benchmarks/manager-modes/score.py --state <state> --run <workflow output>.json --journal <transcript dir>/journal.jsonl
```

`<state>` is `~/.agent-state/<repo-slug>/benchmark-skill/manager-modes/<run>/`
([agent-state](../../docs/agent-state.md)). Raw plans, grades and the arm labels stay
there, outside the tree. Results are in [RESULTS.md](RESULTS.md).
