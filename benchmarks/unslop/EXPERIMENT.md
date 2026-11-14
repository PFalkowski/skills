# Frozen plan: does a compact unslop still do the job?

This plan was written and frozen before the compact version of `unslop/SKILL.md` existed.
Its author did not see the compact version and did not edit the skill. It follows the
decision contract of [compare-prompts](../../compare-prompts/SKILL.md) and its
[METHOD.md](../../compare-prompts/METHOD.md). Change nothing in this folder after the
compact version is written. A change after that point is a new experiment version with a
new held-out set.

## Question

Does the compact rewrite of `unslop/SKILL.md` (arm B) remove AI writing patterns from prose
as well as the current version (arm A, git commit `eb514a4`, SHA-256 of the file
`fd8609307c3473ec06aabf4822a2cf14ee0315931badc0b4b4d6bfa892201b9b`), while keeping the
facts? A third arm, the control, runs the same task with no skill text. It shows whether
the suite can detect the loss of the skill at all.

## Task and population

The task is the skill's real job: take a passage of unedited AI-style prose and return an
edited passage with the AI writing patterns removed, the meaning and format kept, and every
number, version, name, identifier and date unchanged.

The population is short non-code prose of the kinds the skill names: README sections, docs
pages, pull-request descriptions, blog posts, release notes and status reports, each 120 to
200 words, written the way a current AI model writes when nobody edits it.

`passages.json` holds 20 held-out test passages (`t01` to `t20`) and 4 development
passages (`d01` to `d04`). Every one of the 30 patterns is seeded in 4 to 6 test
passages, so no pattern family carries more weight than another. The passages were
written before the compact version existed and without any guess at what it would drop.
All names, products and numbers are invented.

## Model and harness

- Model under test: Claude Sonnet 5.5, run as subagents by the lead session.
- One subagent per batch of 5 passages, per arm. Batches are fixed: test passages in file
  order, `t01-t05`, `t06-t10`, `t11-t15`, `t16-t20`.
- Each subagent receives the prompt below as its instruction and writes one file per
  passage, `<out_dir>/<id>.md`. It uses no tools other than writing those files.
- Arm order is counterbalanced per batch: batch 1 runs A, B, control; batch 2 B, control,
  A; batch 3 control, A, B; batch 4 A, B, control. Each subagent starts fresh.
- Record for each run: the model ID, the date, the SHA-256 of both skill files, the commit
  of this folder, and the output directory.

## The three arms and their exact prompts

`prompt.py` builds every prompt. Use its output verbatim; do not retype it.

```
python3 benchmarks/unslop/prompt.py --batch K --out-dir DIR --skill SKILL_A.md   # arm A
python3 benchmarks/unslop/prompt.py --batch K --out-dir DIR --skill SKILL_B.md   # arm B
python3 benchmarks/unslop/prompt.py --batch K --out-dir DIR                      # control
```

`SKILL_A.md` is `git show eb514a4:unslop/SKILL.md`, saved to a file. `SKILL_B.md` is the
compact version, saved the same way from its commit. The full file, front matter included,
goes in.

Skill arms (A and B) get:

```
The following skill applies to this task. Follow it.

<skill>
{full text of the arm's SKILL.md}
</skill>

{TASK}

{PASSAGES}
```

The control gets:

```
{TASK}

{PASSAGES}
```

`{TASK}` is identical in all three arms:

```
Remove AI writing patterns from each passage below so it sounds human. Keep the meaning, the intended tone and the format of each passage (Markdown stays Markdown). Keep every number, unit, version, name, identifier, path and date exactly as written. Do not add facts.

Write each edited passage, and nothing else, to its own file: {out_dir}/<id>.md, where <id> is the passage's id. Write no other files. Do not put a preface, notes or a summary in the files.
```

`{PASSAGES}` is each passage of the batch as `<passage id="tNN">` text `</passage>`. Only
`id` and `text` reach the model. `facts` and `seeded` stay with the grader.

Each output directory holds one arm only, for example
`~/.agent-state/skills/compare-prompts/unslop-<run>/a/`. Keep all outputs outside the
worktree.

## Primary outcome

Per-passage binary `success`, computed by `grade.py` (frozen in its constants):

- the rewrite has **at most 1 residual detected pattern hit**, summed over the 26
  mechanically detected patterns (see the README table), and
- **every fact** of the passage appears verbatim in the rewrite, after straight-quote and
  whitespace normalisation (and with `**` and backticks removed), and
- the **length ratio** (rewrite words / original words) is **between 0.45 and 1.25**.

### How the thresholds were chosen (development split only)

- Hand-written known-good and valid-alternative rewrites of the 4 dev passages score 0
  residual hits, with length ratios 0.74 to 0.90. Known-bad rewrites score 4 to 11 hits.
- A pilot on the 4 dev passages only, with the same model and prompts: arm A (the current
  skill) scored 0 residual hits on all 4 (ratios 0.80 to 0.87). The control scored 4, 2, 3
  and 0 (ratios 0.83 to 0.94). Every control hit was checked by hand and is a true
  pattern: bold lead-in list items, a title-case heading, curly quotes, a kept "The fix:"
  colon and a four-word paragraph.
- N = 1 allows one stray hit, as a margin for a detector false positive on wording the
  dev set did not show, and still fails every control output that kept 2 or more.
- The band 0.45 to 1.25 is the observed dev range (0.74 to 0.94) widened by about 0.3 on
  each side. The lower bound fails a rewrite that summarises away about half the passage;
  the upper bound fails one that pads it. No dev output came near either bound.

The test split was not run or looked at when these were set.

## Decision settings

| Setting | Value |
|---|---|
| Sampling unit | passage (one cluster each) |
| Test units | 20 |
| Trials per arm and passage | 1 |
| Alpha | 0.05 |
| Practical difference margin `m` | 0.20 (20 percentage points of passage success) |
| Quality floor | arm B success rate at least 0.70 (14 of 20) |
| Sensitivity gate | control success rate at least 30 percentage points below arm A's |
| Ceiling rule | A and B both at 100 percent: report ceiling, not equivalence |

The margin is 0.20 because 20 units cannot support a smaller one: with zero discordant
passages the interval below is already ±0.197. A smaller margin would make
NO_MEANINGFUL_CHANGE impossible at this sample size.

## Critical regression gates

Either of these gives **REGRESSION** regardless of the interval:

1. **Fact gate.** Any test passage where arm A kept all facts and arm B dropped or changed one.
2. **Pattern-loss gate.** Any detected pattern that arm A left in no test passage while
   arm B left it in 2 or more. This is the direct sign that the compact text lost a rule.

Shared failures (passages both A and B fail) are reported, not gated.

## Analysis

`compare-prompts/scripts/score.py` cannot take these results: it validates a local Ollama
text-run manifest with request hashes, and RUNNING.md forbids faking one. So the paired
analysis is done by `analyze.py`, which imports the same `paired_interval` function from
score.py and applies the same verdict order:

1. **INVALID** if any arm lacks one valid record for each of the 20 test passages.
2. **REGRESSION** if a critical gate fails.
3. **INCONCLUSIVE** if arm A's success rate minus the control's is below 0.30 (the suite
   cannot detect losing the skill).
4. **INCONCLUSIVE (ceiling)** if A and B are both at 100 percent.
5. With `w` = passages only B passes, `l` = passages only A passes, `n` = 20: the paired
   effect is `(w - l) / n`, with the conservative interval `[Lw - Ul, Uw - Ll]` built from
   exact Clopper-Pearson limits for `w/n` and `l/n` at confidence `1 - alpha/2` each.
   - Interval entirely above `+0.20` and B at or above the floor: **IMPROVEMENT**.
   - Interval entirely below `-0.20`: **REGRESSION**.
   - Interval entirely inside `[-0.20, +0.20]` and B at or above the floor:
     **NO_MEANINGFUL_CHANGE**.
   - Otherwise: **INCONCLUSIVE**.

Exit codes match score.py: 0 improvement or no meaningful change, 1 regression,
2 inconclusive, 3 invalid.

### Power, stated plainly

With 20 passages this design detects only large differences:

- NO_MEANINGFUL_CHANGE needs A and B to agree on **every** passage. One discordant passage
  widens the interval to about [-0.28, +0.20], which crosses the margin.
- REGRESSION by the interval needs **14 losses and no wins** out of 20 (15 losses with one
  win). A loss of 3 or 4 passages is invisible to the interval.
- The critical gates are therefore the sensitive part of the design: they catch a single
  dropped fact or a pattern that arm B stops handling.
- To fit an all-tied interval inside ±0.10 would need 42 passages; inside ±0.05, 86.

The likely honest outcomes are NO_MEANINGFUL_CHANGE (all passages agree), REGRESSION
through a gate, or INCONCLUSIVE with descriptive evidence. Report the descriptive numbers
in every case: success rates, residual hit totals per arm, and residual passages per
pattern for all three arms.

## Repeats and stopping

One trial per arm and passage, one complete run, no extension. Repeatability of the model
is not measured. Do not add passages or trials after seeing results. Do not rerun single
passages or single arms.

## What invalidates a run

- A missing output file, an empty file, or an output that is not a rewrite (`grade.py`
  marks it invalid when fewer than 15 percent of the original's words of 5 or more letters
  appear in it).
- A subagent that saw a different prompt than `prompt.py` produced, ran with tools beyond
  writing its files, or wrote into another arm's directory.
- A changed file in this folder, or a skill file whose hash does not match the record.

An invalid run is discarded whole. Fix the cause and run all three arms on all 20 passages
again into new directories. If a second complete run is invalid for the same arm, stop and
report INVALID with the cause.

## Commands

```
python3 benchmarks/unslop/grade.py --self-test
python3 benchmarks/unslop/grade.py benchmarks/unslop/passages.json RUN/a > RUN/a.jsonl
python3 benchmarks/unslop/grade.py benchmarks/unslop/passages.json RUN/b > RUN/b.jsonl
python3 benchmarks/unslop/grade.py benchmarks/unslop/passages.json RUN/control > RUN/control.jsonl
python3 benchmarks/unslop/analyze.py RUN/a.jsonl RUN/b.jsonl RUN/control.jsonl
```

## Not measured

- Whether the text sounds human, reads well or has voice. That needs a calibrated judge
  (JUDGING.md) and none is available, so subjective quality is out of scope.
- The "Adding soul" section of the skill: opinions, varied rhythm, first person.
- Patterns 2 (name-dropping), 10 (rule of three), 11 (synonym cycling) and 12 (false
  ranges), and the verb "features" from pattern 8. The grader cannot detect them reliably.
  A three-item-list count is reported but plays no part in success.
- Pattern variants outside the skill's listed examples. The detectors match the listed
  words and phrases, so a rewrite that swaps "pivotal moment" for "key turning point"
  passes.
- Meaning preservation beyond the listed facts, and facts the model adds.
- Repeatability: one trial per passage.
- Longer documents, code comments, other models and other harnesses.
