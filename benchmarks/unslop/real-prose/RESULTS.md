# Results: the upstream unslop against the adapted unslop, on real prose

## Verdict

**REGRESSION**, by step 2 of `benchmark-skill/METHOD.md` § Verdict precedence: a critical
gate failed. On gate case `r1g13`, arm A (the upstream original) kept every fact and rule,
and arm B (the adapted skill) dropped one. This is an observed release-gate failure on one
curated case, not a population claim. On the representative test suite, B passed more
passages than A, but the interval is too wide to call that an improvement.

| Item | Value |
|---|---|
| Comparison | A: `5e39f31:unslop/SKILL.md` (SHA-256 `1ae5b161…3835`, 25 patterns). B: `unslop/SKILL.md`, unchanged since `4a01f8d` (SHA-256 `d651ab61…364a3f`, 30 patterns). Control: no skill. |
| Model and harness | `claude-sonnet-5-5`, Claude Code CLI 2.1.330, one fresh headless call per passage and arm, prompt on standard input, tools limited to `Write`. |
| Frozen plan | [EXPERIMENT.md](EXPERIMENT.md), commit `5b9dccf`, `cases.json` SHA-256 `8b13c72c…070661`. |
| Run | 2026-11-23, 132 calls (44 cases by 3 arms), audit clean: no other tool, one write path per call, no truncation, no error. |
| Sample | 30 test clusters (one passage per source file), 14 gate cases, 1 trial each. |
| Primary endpoint | Success under the original pattern list. |
| Paired effect, B minus A | +0.167 (B alone passed 6, A alone passed 1), 95% interval [-0.129, +0.411]. Margin 0.20. |
| Success rates (primary) | control 0.233, A 0.533, B 0.700. |
| Sensitivity gate | Control against A: +0.30, above the 0.20 margin. The suite sees the skill. |
| Ceiling and floor | Neither: A's rate 0.533 is between 0.20 and 0.80. |
| Critical regressions | 1: the rule and fact gate on `r1g13`. Pattern-loss gate: none. Gate cases A passed and B failed: none. |
| Suites run | 1 (rung 1, sections of 120 to 250 words). Rung 2 was declared but not needed: rung 1 met its calibration target. Rung 2 could have supplied only 22 test clusters of the 30 planned. |
| Cost | $3.34 for the run, $0.41 for calibration. Authoring subagents not counted. |
| Evidence | `~/.agent-state/skills/benchmark-skill/unslop-real-2026-11-23/` (`run1/`, `cal-r1/`, `authoring/`, `skills/`). |

Had the gate not fired, the verdict would still not be IMPROVEMENT: the interval crosses
+0.20, so step 10 would give INCONCLUSIVE. B met the quality floor exactly (0.70).

## The critical case

`r1g13` is a gate case for pattern 23 (punchy fragments), from `formal-check/SKILL.md`.
It lists seven numbered guards, each opening with a bold name such as "**Able to fail.**"
or "**Readable without the tool.**". B removed all seven names and kept each body as
prose. For six guards the body restates the name's point. For guard 5 it does not: the
body says to give "the property and the harm in one plain sentence each", and only the
name says the check must be readable without the tool. B's rewrite loses that
requirement. I read B's output and transcript against the source: the key holds, and
the rule is not a grader artifact. A kept the names (and failed the case on residual
bold), so A kept the rule. A kept it by barely editing the passage, not by understanding
it, and A also failed the case. The verdict rests on this one case and one trial: a rerun
of B on it could pass. The key accepts one word order of the requirement; six of eight
faithful paraphrases fail it (carried to a ticket, not changed after the freeze).

## Primary and secondary results

| Arm | Original list (primary) | Current list (secondary) |
|---|---|---|
| control | 7 of 30 (0.233) | 7 of 30 (0.233) |
| A | 16 of 30 (0.533) | 16 of 30 (0.533) |
| B | 21 of 30 (0.700) | 21 of 30 (0.700) |

The two lists give the same outcomes on every test case. The test passages contain few
current-only patterns, so the longer list did not change who passed.

Residual hits over all 30 test outputs: original list control 103, A 53, B 34; current
list control 104, A 54, B 35.

## Per pattern

Test sources is the number of the 30 test passages whose source contains the pattern.
Residual is total hits in the outputs, with the number of passages in brackets. Only
patterns seen in a source or an output are listed; the rest had 0 everywhere.

| Pattern | Test sources | Control | A | B |
|---|---|---|---|---|
| 9 Negative parallelisms ("not just" form) | 2 | 4 (4) | 3 (3) | 2 (2) |
| 13 Stock metaphors (current only) | 1 | 1 (1) | 1 (1) | 0 (0) |
| 14 Salience flags (current only) | 0 | 0 | 0 | 1 (1) |
| 15 Honesty prefaces (current only) | 1 | 0 | 0 | 0 |
| 16 Em dashes | 22 | 7 (5) | 0 (0) | 1 (1) |
| 17 Colon overuse | 1 | 1 (1) | 0 | 0 |
| 18 Boldface | 26 | 79 (26) | 41 (15) | 26 (12) |
| 19 Inline-header lists | 3 | 10 (4) | 7 (2) | 3 (1) |
| 21 Emojis | 1 | 2 (1) | 2 (1) | 2 (1) |

The real prose of this repo is dominated by two patterns: em dashes (22 of 30 sources)
and bold (26 of 30). Most of the difference between A and B is bold: B removes more of
it. A leaves no em dash and B leaves one (`r1t03`). No test source contains patterns 1, 3 to 8, 20, 22 to
30, so the suite says nothing about them.

## Patterns 9, 13, 15, 23 and 27

The wordings changed after review in the current skill. What this run shows for each:

- **9, negative parallelisms.** Two test passages and two gate passages hold the "not
  just" form; B left it in 2 test outputs, A in 3. No drawn passage, test or gate,
  contains the trailing contrast ("it's X, not Y."), the part whose wording changed. The
  only such passages in the repo sit in files already used by dev or test. The new
  wording is untested.
- **13, stock metaphors.** One test passage (1 hit) and two gate passages (5 hits) hold
  "load-bearing". B removed all 6; A and the control left all 6. The
  gate-case rule that once depended on the word "load-bearing" was fixed before the
  freeze, so removing it costs nothing under the key.
- **15, honesty prefaces.** One test passage (all arms removed it) and two gate passages:
  B removed it in one and left it in the other; A left it in both.
- **23, punchy fragments.** Unmeasured. No test passage has one, and both gate passages
  were drawn on false hits of the detector: `r1g13` hits on "Every check keeps all seven.",
  a complete sentence, and `r1g14` on the rule line `---`. Every arm "left" the same
  string. B's run on `r1g13` is still the critical case above, for a different reason.
- **27, next-step narration.** No passage in the repo contains it. Untested.

## Gate cases

All three arms passed the clean cases `r1g01` to `r1g05`; on `r1g06` the control failed
(length ratio 1.27 and a key fault, below) while A and B passed. So neither skill
over-applied its rules where there was nothing to fix. On the pattern cases B passed
`r1g08`, `r1g11`, `r1g12` and `r1g14`; A passed `r1g08`, `r1g11` and `r1g14`.

## Shared failures and other case lists

- Every arm passed (non-discriminating): `r1t06`, `r1t08`, `r1t11`, `r1t14`, `r1t21`,
  `r1t24`, `r1t25`.
- Every arm failed: `r1t01`, `r1t02`, `r1t03`, `r1t05`, `r1t07`, `r1t12`, `r1t17`,
  `r1t20`. All failed on residual hits, never on a fact or rule. In most of them
  every arm kept bold labels or bold terms (`3. **Fits one change.**`, `**Groom**`), which
  the grader counts as boldface; the key holds in all eight. `r1t01` is a grader fault: the source uses the
  emoji ⛏️ as a functional marker for a "nit" comment, every arm rightly kept it, and the
  emoji detector counts it twice (the symbol and its variation selector). No faithful
  rewrite can pass `r1t01`. A and B fail it for this fault alone (the control also fails on bold), so it does
  not move the paired effect (B alone 6, A alone 1 either way). With the emoji fault removed, the
  rates would be control 7 (it still fails `r1t01` on bold), A 17 and B 22 of 30. METHOD.md says a grader fault found after
  the run means fixing it and running anew. That was not done here, because the fault
  changes no outcome and no verdict; this is a deviation from that rule.
- Only one arm passed: B alone on `r1t09`, `r1t10`, `r1t18`, `r1t22`, `r1t28`, `r1t29`;
  A alone on `r1t13`.

## Rule failures read after the run

Facts and rules were dropped in three outputs: B on `r1g13` (above), and the control on
`r1t15` R7 and `r1g06` R3. I read both control outputs. Each kept the instruction in a
wording the key missed ("Stick with the key restriction"; "point to it rather than
arguing the case again"), so both are key faults. Neither changes an outcome: `r1t15`
also failed on residual hits and `r1g06` on its length ratio. Per the plan, nothing was
changed after the freeze. The key's false negatives mean a dropped rule can be a key
fault, which is why the one that decides the verdict was read by hand.

## Not measured

- Whether the rewrites read well or sound human; no judge was used.
- Patterns the grader cannot detect (2, 10, 11, 12 and the verb "features") and every
  pattern no test source contains (listed above).
- The trailing contrast of pattern 9 and pattern 27: no case contains them.
- Meaning beyond the listed facts and rules, and facts a rewrite adds.
- Repeatability (one trial), other models, other harnesses, and prose outside this repo.

## Addendum: r1g13 key (#397), 2026-11-26

Everything above this section is the published result of the frozen run. It is unchanged.
This addendum reports one key change, a regrade and a small rerun on `r1g13` only.

**Key change.** The key for `r1g13` rule R13 ("the check can be read without the tool")
was one regex. It needed a reading word, then "without", then "tool", in that order. It
accepted 2 of 8 faithful paraphrases written for the test, such as "Readable without the
tool." It rejected the other 6, such as "Without the tool, anyone can read it." and "A
reader needs no tool to understand it." A rerun could therefore fire the critical gate on
a correct rewrite. The new key has two regexes: a reading word ("read", "understand",
"follow", "legible", "make sense") within 8 words of a negation ("without", "no", "not",
"never", "lack", "-n't") followed within 4 words by "tool" or "checker", in either order.
`tests/test_unslop_real_prose.py` shows it accepts all 8 paraphrases and fails 4 rewrites
that drop the rule: B's actual output from the frozen run, "Readable with the tool.", "Run
the tool to read the result." and "Only readable with the tool installed." No other
case's source matches the new regexes. `grade_real.py --self-test` still passes.

**New freeze.** The key change is commit `1c49610`, made before the regrade and the rerun.
`cases.json` SHA-256 is now `3f75e445…fcb766` (it was `8b13c72c…070661`). Only R13 of
`r1g13` changed. The rerun used a one-case copy of it (`cases-r1g13.json`).

**Regrade of the frozen outputs.** Under the new key, no outcome on `r1g13` changes. B's
frozen output still misses R13: it removed the bold name "Readable without the tool." and
no other sentence says it, so the new key rightly fails it. A and the control still keep
R13, and every arm still fails the case (A and the control on 7 residual bold hits, B on
R13). The independent faithful rewrite in `authoring/alt/` still passes. The published
gate failure is not a key artifact.

**Rerun.** Arms A and B on `r1g13` only, 5 trials each, with `harness.py` unchanged
(`claude-sonnet-5-5`, same flags, same skill files by hash, prompts byte-identical to the
frozen run apart from the output folder). Audit clean on all 10 calls. Cost $0.32. One
deviation: the CLI was 2.1.332, not 2.1.330.

| | A | B |
|---|---|---|
| Kept R13 | 5 of 5 | 5 of 5 |
| Kept the bold guard names | 5 of 5 | 5 of 5 |
| Success, primary endpoint | 0 of 5 (7 residual bold hits each) | 0 of 5 (7 residual bold hits each) |
| Rule and fact gate fired | | 0 of 5 |
| Gate-case gate (A passed, B failed) fired | | 0 of 5 |

In all 5 trials B behaved like A: it kept the seven bold names, edited lightly, and kept
the requirement. The frozen run's B output, which removed every name, did not recur. So B
dropped R13 in 1 of 6 trials in all.

Every rerun output also missed R10 ("a pass covers the model or the bound, nothing
more"). Each one wrote "A pass covers only the model or the bound." That is a faithful
rewrite, and the key misses it because it wants "only" after "model". It is a second
word-order key fault of the same kind. It hits A and B alike, so it cannot fire the rule
and fact gate, and it was left as is: only R13 was in scope. A t3 output missed R5 the
same way ("A check nobody has seen fail proves nothing."). With both faults ignored, A and
B keep every rule in every trial, and the gate still fires 0 times.

**Does the verdict stand?** Weakened. Under the frozen rule the published REGRESSION
stands as recorded: the gate failure was real, not a key artifact, and the plan fires on
one observed case. But it does not reproduce. In 5 more trials of the same case, B never
dropped the rule and neither gate fired. The regression is a rare outcome on this case (1
of 6 trials), not a stable property of B. A firmer verdict needs a new run with several
trials per gate case.

Evidence: `~/.agent-state/skills/benchmark-skill/unslop-real-2026-11-23/r1g13-rerun/`
(`t1/` to `t5/`, each with prompts, transcripts, outputs, `manifest.json` and
`audit.json`; grades in `summary.json`).
