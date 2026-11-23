# Frozen plan: the upstream unslop against the adapted unslop, on real prose

This plan follows [benchmark-skill](../../../benchmark-skill/SKILL.md) and its
[METHOD.md](../../../benchmark-skill/METHOD.md). It answers issue #347. Its author did
not see how the adapted skill was written: not its history, not its notice file and not
the earlier results. Every setting below was frozen in one commit before any test or
gate case ran and before arm B ran on anything. A change to a case, the answer key, the
grader or the prompt after that commit voids every score; the whole run is then redone
as a new run.

## Question

Does the adapted `unslop/SKILL.md` (arm B) remove AI writing patterns from real skill
prose as well as the upstream original (arm A), while keeping every fact and every rule
of the text? A third arm, the control, gets no skill. It shows whether the suite can see
the skill at all.

| Arm | Text | SHA-256 |
|---|---|---|
| control | no skill | |
| A | `git show 5e39f31:unslop/SKILL.md`, the first commit of `unslop/`, 25 patterns | `1ae5b1614a2b4016f5b2428b44f0dd7528f616dc2b463df9bfd32e153da93835` |
| B | `unslop/SKILL.md` at `4a01f8d`, 30 patterns | `d651ab610c2f309c87ff6425585fa37f2abf23a49725c136ad032e988f364a3f` |

The full file, front matter included, goes into the prompt. `harness.py` refuses a skill
file whose hash differs.

## Task and population

The task is the skill's real job on this repo's own text: rewrite one passage so it no
longer reads as AI-written, keeping its meaning, format, facts and rules.

Population rule (rung 1): a contiguous run of 120 to 250 words of prose (paragraphs,
list items, tables; code fences are allowed inside but never start a run, and their
words are not counted) taken from a `SKILL.md`, from another `.md` file inside a skill's
folder (a reference file), or from the repo-root `README.md`, at commit `4a01f8d`.
Excluded: the `unslop/` folder, `benchmarks/`, anything under `.claude/`, front matter,
and `NOTICE.md` licence notices. `build_pool.py` reads the files from git, cuts them
into sections at every heading, and keeps a section whose words fall in the band. A
longer section yields runs of whole paragraphs or list items inside the band, in order.
That gives 461 passages from 114 files.

Rung 2 (declared, used only if rung 1 misses its calibration target): the same sources
and cutting, with runs of 300 to 450 words. Mechanism: longer inputs (METHOD.md
mechanism 4). Rung 2 has 115 passages (98 hit-bearing) but, after excluding the 8 rung-1
dev files and taking its own 8 dev files, only 22 files remain for its test split. A
rung-2 test suite would therefore fall short of the 30-cluster minimum and decide
INCONCLUSIVE at step 3.

A passage is hit-bearing when the grader's detectors find at least 2 hits in it under
the union of both skills' lists, which is the current list (see Grader). Code is not
counted. 355 of the 461 rung-1 passages are hit-bearing.

## Splits and sampling

One file is one cluster: at most one passage per source file in the whole experiment.
`random.Random(347)` shuffles the sorted hit-bearing pool once. Walking that order and
skipping files already used:

- `dev`: the first 8 passages (calibration and grader validation only).
- `test`: the next 30 passages, from other files. These carry the verdict.
- `gate` (critical, can block, never carries the verdict): drawn after dev and test, from
  files neither uses, with the same generator, always from the rung-1 population:
  6 passages with 0 hits (`clean`; a rewrite should change nothing material), then up to
  2 passages each that show pattern 9, 13, 15, 23 or 27 as numbered in the current skill.
  The repo has no passage with pattern 27, and every passage with the trailing contrast
  of pattern 9 sits in a file that dev or test already uses, so the pattern 9 gate cases
  show only its "not just" form. 14 gate cases in all.

Cases were chosen by this rule and seed only. No rewrite output was looked at when
choosing them. `cases.json` is the output of
`build_pool.py --rung 1 --gate --key <the four authored key files>`, which regenerates
the draw exactly from git at `4a01f8d`.

Dev cases come from 8 files, test cases from 30 and gate cases from 14, 52 files in all.
The gate's 6 clean cases come from 6 files; its pattern cases are 2 each for patterns 9,
13, 15 and 23 (8 in all), and none for pattern 27.

## Answer key

Each case has `facts` and `rules`. Four fresh subagents (model Sonnet) wrote them in
batches (dev 8, test 15 and 15, gate 14), each shown only `authoring/KEY-BRIEF.md`, its
batch's passage texts and the mechanically extracted fact candidates (inline code,
paths, flags, numbers with units). None saw either skill or any arm's output. In all,
the 52 cases carry 274 facts and 621 rules.

- `facts`: strings that must survive verbatim (after straight quotes, no `**` or
  backticks, collapsed whitespace).
- `rules`: one entry per instruction, requirement, default or prohibition the passage
  states. Each has 1 to 3 case-insensitive regexes anchored on content words; a rewrite
  keeps the rule when one matches. A dropped or changed rule is a critical regression.

`grade_real.py --self-test` checks that every fact and rule matches its own source, that
deleting the sentences of a case's first rule fails that rule, and the dev validation
rewrites below. Its result before the freeze: pass, 0 failures.

## Model and harness

- Model: `claude-sonnet-5-5`, Claude Code CLI 2.1.330, one trial per case and arm.
- One fresh headless call per case and arm. The prompt goes on standard input, never as
  a file to read. Each call runs in its own empty scratch folder:

  ```
  claude -p --model claude-sonnet-5-5 --tools Write --strict-mcp-config --setting-sources "" \
    --permission-mode acceptEdits --add-dir <run-dir>/<arm> --no-session-persistence \
    --output-format stream-json --verbose < prompt.txt > transcript.jsonl
  ```

  `--add-dir` is the one addition to the lead's command. Without it, a probe on
  2026-11-23 (one invented sentence, not a case) showed the write to the run folder
  denied as "outside allowed working directories"; with it the write succeeded and the
  audit passed. The probe's init record listed exactly one tool, `Write`, and no MCP
  servers.
- The prompt is `benchmarks/unslop/prompt.py`'s `build` with one passage: for A and B,
  its skill preamble with the arm's full file, then its `TASK` text verbatim, with the
  output folder set to `<run-dir>/<arm>`; the control gets `TASK` alone.
- Calls run 4 at a time in an order shuffled by `random.Random(347)`.
- Evidence goes to `~/.agent-state/skills/benchmark-skill/unslop-real-2026-11-23/`,
  outside the worktree: the arm files in `skills/`, the authoring inputs and outputs in
  `authoring/`, the calibration in `cal-r1/`, and the full run in `run1/` (a rerun after
  an INVALID run gets `run2/`). Each run folder holds prompts, transcripts, outputs, grades, `manifest.json` (date, model, CLI
  version, frozen commit, case-file hash, skill hashes, order) and `audit.json` (cost
  and tokens from the result records).

A run is INVALID, discarded whole and rerun for every arm as a new run folder when any
transcript shows: a tool other than `Write`, a write to any path but the one expected,
a missing or empty output, a result that is not a normal `end_turn` success (truncation
included), a non-zero exit, a permission denial, a rate-limit rejection or a different
model. `harness.py` audits every transcript and exits 3 on any of these.

## Grader

`grade_real.py` imports the detectors of `benchmarks/unslop/grade.py` unchanged. Before
counting, it removes fenced code and replaces inline code with a placeholder, in both
the source and the rewrite: code is not prose, and the task says to keep it exactly.
Per case it records validity (missing, empty, or under 15 percent word overlap with the
source is invalid, as in grade.py), `facts_kept`, `rules_kept` (and which are missing),
the length ratio, and the hits per pattern under two lists:

- Original list: the patterns the upstream original names. Every grade.py detector
  except the current-only ones (13 stock metaphors, 14 salience flags, 15 honesty
  prefaces, 23 punchy fragments, 27 next-step narration), and for pattern 9 only the
  "not/isn't just, only, merely" form, not the trailing "it's X, not Y." contrast.
- Current list: every grade.py detector.

Success under a list: at most 1 residual hit under that list, every fact kept, every rule
kept, and a length ratio from 0.45 to 1.25. For a `clean` gate case the ratio must also
be at least 0.85.

**Primary endpoint:** success under the original list. Both skills cover it, so it does
not favour the longer list. **Secondary endpoint** (descriptive only): success under the
current list. Both are reported for all three arms.

## Decision settings

| Setting | Value |
|---|---|
| Sampling unit | source file (one passage each) |
| Test clusters `n` | 30 |
| Trials per case and arm | 1 |
| Alpha | 0.05 |
| Margin `m` | 0.20 |
| Ceiling rate | 0.80, the default min(0.90, 1 - m) |
| Floor rate | 0.20 (= m) |
| Quality floor | B's test success rate at least 0.70 |
| Sensitivity gate | A's rate minus the control's (the paired effect with the control as arm a) must exceed 0.20 |

With 30 clusters and no discordant cluster, the paired interval is about ±0.136, so
NO_MEANINGFUL_CHANGE is reachable only with few discordant clusters.

## Critical gates

Any of these gives REGRESSION (step 2):

1. Rule and fact gate: any test or gate case where A kept every fact and rule and B
   dropped or changed one.
2. Pattern-loss gate, original list: a pattern A leaves in no test passage and B leaves
   in 2 or more.
3. Any gate case A passed and B failed, both under the primary endpoint.

## Verdict

`analyze.py` applies METHOD.md § Verdict precedence in order to the primary endpoint:
INVALID (audit, missing or invalid records); the critical gates; fewer than 30 test
clusters; interval below -m; ceiling or floor by the ladder state; earlier loss (no
earlier suite exists: the old synthetic suite's run was invalid and its 24 passages are
development evidence only, not rerun); the sensitivity gate; then the interval steps,
with IMPROVEMENT and NO_MEANINGFUL_CHANGE also needing B at the quality floor and B
passing every gate case.

## Ladder and calibration

Rungs in order: rung 1 (120 to 250 words), rung 2 (300 to 450 words, longer inputs). No
further rung, and no step down for a floor effect. A rung is calibrated on its 8 dev
passages with the control and A only; B never runs on dev, and no A-against-B outcome is
looked at before the freeze. Target: A's dev success rate above 0.20 and at most 0.60,
and the control below A by more than 0.20. If rung 1 misses, rung 2 is calibrated on 8
new dev passages from new files. If neither meets it, the test runs on rung 2 as the
last allowed suite (METHOD.md step 5): a ceiling there goes through steps 6 to 10 and is
named; a floor gives INCONCLUSIVE, "floor effect".

Calibration attempts (all on 2026-11-23, control and A only, never B):

1. Rung 1, dev cases `r1d01` to `r1d08`, run folder `cal-r1` (16 calls, audit clean,
   $0.41). Primary success: A 4 of 8 (0.50: `r1d02`, `r1d03`, `r1d04`, `r1d07`), control
   0 of 8 (0.00). Target met (0.20 < 0.50 <= 0.60, and 0.50 above the control by more
   than 0.20). Rung 2 was therefore not calibrated, and the test runs on rung 1. Rung 1 is
   not the last allowed suite: if the test suite shows a ceiling or floor, the verdict is
   INCONCLUSIVE with `next_step` "run the next rung" (`analyze.py --not-last-suite`).
   The numbers are the same when regraded with the final dev key.

## Grader validation

All before the freeze.

- Dev reference rewrites, written without any skill, in `dev/`: `good` and `ruledrop`
  by the dev key author (its faithful rewrite, and the same with one rule removed,
  recorded in `dev/ruledrop/dropped.json`); `alt` by a separate subagent that never saw
  the key (reworded and restructured, faithful); `bad` made from `good` by inserting
  "Additionally," and an em dash (two original-list hits) and nothing else. The grader
  passes every `good` and `alt` rewrite under both lists, and fails every `bad` (hits
  only) and every `ruledrop` (the dropped rule only).
- Key robustness on test and gate: three more subagents that never saw the key wrote one
  faithful, reworded rewrite of every test and gate passage (`authoring/alt/` in the
  evidence folder). Against the first keys, 4 rules and 1 fact failed on these. Read one
  by one, each was a key fault, not a dropped instruction, and was fixed: `r1t17` R1
  (accepts "stay apart"), `r1g07` R12 and `r1g10` R14 (wider word window), `r1g09` R4 (no
  longer needs the word "load-bearing", which pattern 13 of the current skill tells the
  writer to remove), and the `r1t08` fact `Notes:` became `Notes`. After the fixes all 44
  pass. A scan of every pattern for words either skill tells the writer to remove found
  no other rule that depends on one.
- The self-test's deletion check found 5 first rules that still matched after their own
  sentences were deleted. `r1t03`, `r1t15`, `r1t23` and `r1g13` R1 matched other
  sentences and were narrowed; `r1t29` was a fault of the check, which split sentences at
  colons, and the check now splits only at `.`, `!` and `?`.
- Dev transcripts read for control and A (`r1d02`, `r1d03`, `r1d08` and others): each
  call made one `Write` to the expected path and ended "Done."; the control keeps the
  bold lead-ins A removes, which is what the hit counts show. Two dev rule failures were
  read: control `r1d03` R5 ("treat anything you can't prove as false") and A `r1d08` R5
  ("point the phase brief at it") were faithful wordings the key missed. Both dev rules
  were loosened. Neither changed a calibration outcome, since both outputs also failed on
  residual hits. This is the only key change made after seeing an arm's output, and it
  touched dev cases only.

## Not measured

- Whether the rewrite reads well or sounds human. No calibrated judge is used.
- The "Adding soul" section of either skill.
- Patterns the grader cannot detect: 2, 10, 11, 12 and the verb "features" of 8; and
  any tell outside the skills' listed words.
- Meaning beyond the listed facts and rules, and facts the model adds.
- Pattern 27 and the trailing contrast of pattern 9 on gate cases (none available), and
  any pattern that no test passage contains (the report lists coverage per pattern).
- Repeatability (one trial), other models, other harnesses, and text outside this repo.
