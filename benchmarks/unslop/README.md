# unslop A-B suite

A frozen test of whether a rewrite of [`unslop/SKILL.md`](../../unslop/SKILL.md) still
does the skill's job: removing AI writing patterns from prose while keeping the facts.
It compares two versions of the skill (arm A and arm B) and a no-skill control, on 20
held-out passages, with a mechanical grader. The plan, thresholds and verdict rules are in
[EXPERIMENT.md](EXPERIMENT.md); the method is
[compare-prompts](../../compare-prompts/SKILL.md).

## Files

| File | What it is |
|---|---|
| `passages.json` | 20 test and 4 dev passages. Each has `id`, `split`, `kind`, `text`, `facts` (strings a rewrite must keep verbatim) and `seeded` (pattern numbers put in, for grader validation only). |
| `prompt.py` | Builds the exact prompt for one batch of 5 passages, per arm. Passes only `id` and `text`. |
| `grade.py` | Grades a directory of rewrites. One JSON record per passage, then a summary. `--self-test` validates passages and grader. |
| `analyze.py` | Applies the frozen decision rule to the graded A, B and control results. |
| `dev/` | Hand-written rewrites of the dev passages: `good`, `alt` (valid alternative), `bad` (patterns left in), `factdrop` (one fact lost or reformatted). |

## Rerun

```
python3 benchmarks/unslop/grade.py --self-test

# per arm X in a, b, control and batch K in 1..4 (see EXPERIMENT.md for arm order):
python3 benchmarks/unslop/prompt.py --batch K --out-dir RUN/X [--skill SKILL_X.md] > prompt-X-K.txt
# give prompt-X-K.txt verbatim to a fresh Sonnet 5.5 subagent; it writes RUN/X/<id>.md

python3 benchmarks/unslop/grade.py benchmarks/unslop/passages.json RUN/a > RUN/a.jsonl
python3 benchmarks/unslop/grade.py benchmarks/unslop/passages.json RUN/b > RUN/b.jsonl
python3 benchmarks/unslop/grade.py benchmarks/unslop/passages.json RUN/control > RUN/control.jsonl
python3 benchmarks/unslop/analyze.py RUN/a.jsonl RUN/b.jsonl RUN/control.jsonl
```

`RUN` is a directory outside the worktree, for example
`~/.agent-state/skills/compare-prompts/unslop-<date>/`. `grade.py` exits 3 when any
output is missing, empty or not a rewrite; `analyze.py` exits 0, 1, 2 or 3 like
compare-prompts' score.py. Python 3 standard library only.

## Success rule (frozen)

A passage succeeds when the rewrite has at most 1 residual detected pattern hit, keeps
every fact verbatim, and has a word-count ratio between 0.45 and 1.25. EXPERIMENT.md shows
how these were chosen on the dev passages.

## Pattern detection

Detection runs on the rewrite after curly quotes are straightened (except for pattern 22,
which counts them). "Listed" means the words and phrases the skill itself lists, with
simple inflections. A word can count under two patterns (for example "pivotal" under 1 and
7); that applies to every arm alike.

| # | Pattern | Detected | How |
|---|---|---|---|
| 1 | Significance inflation | yes | listed phrases: pivotal moment, testament to, evolving landscape, set the stage for, indelible mark, deeply rooted |
| 2 | Notability name-dropping | no | needs knowing which names are media outlets |
| 3 | Superficial -ing phrases | yes | comma then highlighting, ensuring, reflecting, showcasing or fostering |
| 4 | Promotional language | yes | listed words |
| 5 | Vague attributions | yes | experts / industry reports / some critics + believe, suggest, argue, say, agree |
| 6 | Formulaic challenges | yes | "despite ... challenges" (up to 3 words between), "continue(s) to thrive" |
| 7 | AI vocabulary | yes | the 16 listed words and inflections |
| 8 | Copula avoidance | partly | serves as, stands as, boasts; the verb "features" is not detected (cannot tell it from the noun) |
| 9 | Negative parallelisms, trailing contrast | yes | not/isn't just, only, merely; "it's / this is X, not Y." |
| 10 | Rule of three | no | a three-item-list count is reported (`triads_*`) but not used: natural lists of three are fine |
| 11 | Synonym cycling | no | needs meaning |
| 12 | False ranges | no | "from X to Y" is also used for real ranges and migrations |
| 13 | Stock metaphors | yes | load-bearing, earns its keep, carries the argument |
| 14 | Salience flags and signposts | yes | worth noting, this matters, here's the part/thing, the trap is, full stop |
| 15 | Honesty prefaces | yes | honest answer, honestly, frankly, to be honest/frank |
| 16 | Em dashes | yes | each em dash, and spaced en dash or double hyphen |
| 17 | Mid-sentence colons | partly | colon then a lowercase word after a framing opener (If, When, Because, In short, The fix, Here's what ...); other mid-sentence colons are missed |
| 18 | Boldface overuse | yes | each bold span outside a list item's lead-in |
| 19 | Inline-header lists | yes | list item starting with a bold label and colon |
| 20 | Title-case headings | yes | heading whose words after the first, ignoring small words, acronyms and proper nouns (from the facts and from capitalised words mid-sentence in the body), are all capitalised |
| 21 | Decorative emojis | yes | emoji code-point ranges |
| 22 | Curly quotes | yes | count of curly single and double quotes |
| 23 | Punchy fragments | yes | a prose paragraph of fewer than 8 words (not a heading, list item or list intro ending in a colon) |
| 24 | Chatbot phrases | yes | hope this helps, let me know if, Of course!, Certainly! |
| 25 | Cutoff disclaimers | yes | while (specific/exact) details are limited, as of my last/knowledge, based on available information |
| 26 | Sycophantic tone | yes | great question, you're absolutely right, excellent question/point |
| 27 | Next-step narration | yes | I'll now, I will now, Next, I'll, Let me (but not "let me know") |
| 28 | Filler phrases | yes | in order to, due to the fact that, it is important to note that |
| 29 | Excessive hedging | yes | could/may/might/can potentially or possibly; could/might/may be argued |
| 30 | Generic conclusions | yes | future looks bright, exciting times ahead, just/only the beginning, the best is yet to come |

`--self-test` checks the detectors against `seeded` on all 24 passages: every seeded
detected pattern fires on the original, and no unseeded one does.

## Limits

- **No quality judge.** Whether the result sounds human is not measured. A rewrite can
  pass by deleting phrases and still read badly.
- **Listed examples only.** The detectors know the skill's own examples. A version of the
  skill that drops example lists is tested on exactly those examples, and a model that
  replaces a listed phrase with an unlisted cliché passes.
- **Detector precision was checked only on the dev outputs** (hand-written rewrites and a
  4-passage pilot). Unusual wording in test outputs may trigger a false hit; N = 1 allows
  one.
- **Small sample.** 20 passages detect only large differences; see EXPERIMENT.md for the
  exact limits. The critical gates do most of the work.
- **Batches of 5.** A subagent sees 5 passages in one context, so outputs within a batch
  are not fully independent: the model may learn the task from the first passage.
- **Inherited writing rules.** Subagents on the machine that runs this inherit the owner's
  general writing rules (plain English, short sentences). They apply to all three arms
  equally, but they narrow the gap between the control and the skill arms and may differ
  from what other users see.
- **One author.** The passages, facts and grader come from one author, who also seeded the
  patterns. The passages are synthetic and may be easier or more uniform than real AI
  prose.
- **One trial.** Model output varies between runs; repeatability is not measured, and a
  single noisy fact drop can trip the fact gate.
