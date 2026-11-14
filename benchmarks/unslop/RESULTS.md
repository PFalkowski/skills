# unslop compaction: results, 2026-11-14

This file is the only addition to this folder after the run.

**Status: INVALID by the plan's own rule, so it decides nothing.** The frozen plan
([EXPERIMENT.md](EXPERIMENT.md)) says a subagent uses no tool except writing its files, and
that a run which breaks this is invalid. In this run each subagent was told to read its
prompt from a file, so each used a read tool. The numbers below are what that run observed.
Had the run been valid, the plan's verdict for these numbers would be **INCONCLUSIVE
(ceiling)**.

| Arm | Passages passed | Detected patterns left in, total |
|---|---:|---:|
| Control, no skill | 11/20 | 40 |
| A, skill before compaction (`eb514a4`) | 20/20 | 1 |
| B, compact skill (`1031c9a`) | 20/20 | 0 |

## Why the numbers are still reported

The rule exists so that a subagent cannot read the answer key or another arm's output. The
run transcripts show that it did not happen: each of the 12 subagents read exactly one file,
its own prompt, and ran one shell command that wrote its five rewrites. No transcript
mentions `passages.json`, this folder, either skill file or another arm's folder. The prompt
text was `prompt.py`'s output, unchanged, for all three arms. A valid rerun needs the
prompts passed to the subagents directly.

## What the observation suggests

- **The suite can see the skill.** The control passed 55 percent, 45 points below arm A; the
  sensitivity gate required 30. Without the skill the model left in mostly style patterns:
  inline-header lists, title-case headings, bold lead-ins and curly quotes, and the trailing
  contrast.
- **No regression was observed.** No passage passed under A and failed under B. B dropped no
  fact that A kept and left in no pattern that A removed.
- **The compaction was small.** `unslop/SKILL.md` went from 5,083 to 4,978 characters, 2.1
  percent (5,154 to 4,979 bytes). Most of the file is lists of trigger words, which define
  the patterns and stayed. A change this small leaves little for any suite to detect.

## What it does not show

- That the two versions are equivalent. Two perfect scores are a ceiling. With 20 passages,
  one disagreement would already make the interval too wide to decide.
- Anything about patterns 2, 10, 11 and 12, the "Adding soul" section, or whether the text
  sounds human. The grader does not measure them ([README.md](README.md)).
- Behaviour on real prose. The passages are synthetic and were written by one agent.
- The skill as it now stands. After the run, a review narrowed the wording of patterns 9,
  13, 15, 23 and 27 and restored one example. Arm B is commit `1031c9a`, not the current file.

## Run record

- Model under test: `claude-sonnet-5-5`, 12 fresh subagents, one per arm and batch, run one
  after another in the order the plan fixes. Some subagents used extended thinking; this
  was not controlled. All 60 outputs passed the grader's validity checks.
- Skill A SHA-256: `fd8609307c3473ec06aabf4822a2cf14ee0315931badc0b4b4d6bfa892201b9b`.
- Skill B SHA-256: `4ddeaa9ead89a0302bbc7785d0756fa8d97e5d52647aea1d6a062ef12d3fceac`.
- Benchmark folder at commit `a082fe4`, written by an agent that did not edit the skill and
  committed before the compaction. The compaction was done by another agent that was told
  not to read this folder.
- Raw prompts, rewrites, grades and the transcript audit scripts are kept outside the
  repository under `~/.agent-state/skills/compare-prompts/unslop-2026-11-14/`.
- To repeat: follow the Rerun section of [README.md](README.md) with arm A at `eb514a4` and
  arm B at the commit under test.
