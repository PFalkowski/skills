# atomic-decomposition on the real task: results

**Status: no verdict. The no-skill baseline is at the ceiling, the skill arm did not run,
and `fact-check` and `code-review-grill` do not link to `atomic-decomposition`.**

The design and the calibration details are in [EXPERIMENT.md](EXPERIMENT.md). Every run
used `claude-sonnet-5-5` through headless `claude -p`, arm A (no skill) only.

## The three attempts

| Attempt | Fixtures | Keys | Baseline result | Faults found | Cost |
|---|---|---|---|---|---|
| 1 | 10 dev of 40 small invented ones, 3 to 8 files | v1, regexes on wording | 7, 8, 9, then 10 of 10 over four passes | key and grader faults only; the harder re-authoring failed validation | about 13 million subagent tokens (as the workflow run reported; not in the evidence folder) |
| 2 | `p-01` to `p-06`, invented, 15 to 20 files, about 500 lines | v2 | 6 of 6 | none; three claims repaired before the run | about 0.4 million tokens for the three authoring agents, plus $0.38 of headless calls (about 0.5 million tokens) |
| 3 | `r-01` to `r-06`, claims about this repository | v2 | right root verdict on 6 of 6; graded 4 of 6 as run, 6 of 6 under the corrected keys | two key faults (`r-03`, `r-05`) | about 0.4 million tokens for the three authoring agents, plus $0.33 of headless calls (about 0.4 million tokens) |

Across the three designs, the unaided model reached the right root verdict on 22 of 22
development fixtures. METHOD.md calls a baseline at that rate a ceiling: arm B has no
room to show a gain.

## What the baseline did that made the traps fail

- It enumerated every member of a set, so the one hidden failing member was found.
- It kept looking after the obvious route failed, so a second working route was found.
- It marked a fact outside the sandbox unsettled instead of trusting the in-repo default
  or the documents.
- It often settled the claim by reading: three of six passes in attempt 2 and three of six
  in attempt 3 ran no program.

## What this shows and does not show

It shows that on single-session claims about code bases of this size, this model already
does without the skill what the skill asks for, at the level the grade can see. A
benchmark at this difficulty cannot tell the arms apart.

It is not evidence for or against the skill. A suite at the ceiling cannot show a gain.
It could still show a regression, but the skill arm did not run.

## What was not measured

- The skill arm, on any fixture.
- Other models, in particular weaker ones.
- Larger or longer tasks, such as claims that span sessions or need many files at once.
- Repeat trials of the same fixture.
- Whether the skill improves the tree or the evidence when the root verdict is already
  right. The grade checks only the root, evidence tokens, propagation and a required run.

## What a future attempt would need

A population where the baseline fails for its own fault, not a key fault, on at least 40
percent of development cases, so its dev rate sits at or below 0.60. Candidates are a
weaker production model or tasks beyond single-session claims about one code base. Until
such a population exists, another run of this suite would only repeat the ceiling.

The harness also needs two fixes before it is used again, for both arms:

- The allow list refused 16 commands in attempt 2 and 6 in attempt 3, among them `cd`,
  `cp`, heredocs and `$(...)`. It should be loosened.
- The agent sometimes ran `python3 -I`, which drops the current folder from the import
  path, so local imports broke.
- The real-repository export still names the skill: `README.md` summarises its method, and
  `sdlc-old-fashioned/references/workflow-mode.md`, `docs/adr/0006-*`,
  `.claude-plugin/plugin.json` and `workflows/sdlc-workhorse.js` mention it. None of the six
  recorded runs read those passages, so attempt 3 stands. A run with both arms must redact
  them or audit for reads of them, or the no-skill arm is not blind.
- `must_run` matches a substring of any command. In `r-02` it passed on a hand-copied
  function, not the repository's own file.
