# unslop compaction: results, 2026-11-14

**Verdict: INCONCLUSIVE (ceiling).** The current skill and the compact skill both passed
all 20 passages. The frozen plan ([EXPERIMENT.md](EXPERIMENT.md)) says two perfect scores
are a ceiling, not evidence that the versions are equal. No critical gate tripped.

| Arm | Passages passed | Detected patterns left in, total |
|---|---:|---:|
| Control, no skill | 11/20 | 40 |
| A, skill before compaction (`eb514a4`) | 20/20 | 1 |
| B, compact skill (`1031c9a`) | 20/20 | 0 |

## What the run shows

- **The suite can see the skill.** The control passed 55 percent, 45 points below arm A; the
  sensitivity gate required 30. Without the skill the model left in mostly style patterns:
  inline-header lists, title-case headings, bold lead-ins and curly quotes, and the trailing
  contrast.
- **No regression was detected.** No passage passed under A and failed under B. B dropped no
  fact that A kept and left in no pattern that A removed.
- **The compaction was small.** `unslop/SKILL.md` went from 5,154 to 4,979 characters, 3.4
  percent. Most of the file is lists of trigger words, which define the patterns and stayed.
  A change this small leaves little for any suite to detect.

## What it does not show

- That the two versions are equivalent. With 20 passages, one disagreement would already
  make the interval too wide to decide; the suite detects only large losses and the two
  critical gates.
- Anything about patterns 2, 10, 11 and 12, the "Adding soul" section, or whether the text
  sounds human. The grader does not measure them ([README.md](README.md)).
- Behaviour on real prose. The passages are synthetic and were written by one agent.

## Deviation from the plan

The plan says each prompt is pasted to its subagent verbatim. In this run each subagent
was told to read its prompt file and follow it exactly. The text was `prompt.py`'s output,
unchanged, for all three arms. The development pilot that set the thresholds was delivered
the same way.

## Run record

- Model under test: Claude Sonnet 5.5, 12 fresh subagents, one per arm and batch, run one
  after another in the order the plan fixes. All 60 outputs were valid.
- The passages, grader and plan were written by an agent that did not edit the skill and
  were committed (`a082fe4`) before the compaction. The compaction was done by another agent
  that was told not to read this folder.
- Raw prompts, rewrites and grades are kept outside the repository under
  `~/.agent-state/skills/compare-prompts/unslop-2026-11-14/`.
- To repeat: follow the Rerun section of [README.md](README.md) with arm A at `eb514a4` and
  arm B at the commit under test.
