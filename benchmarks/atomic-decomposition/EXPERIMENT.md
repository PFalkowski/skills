# atomic-decomposition on the real task: design and calibration record

This is a design and calibration record, not a frozen plan. No run was frozen, because
the no-skill baseline never left the ceiling. The outcome is in [RESULTS.md](RESULTS.md).
The method is [METHOD.md](../../benchmark-skill/METHOD.md).

## Question

Does the `atomic-decomposition` skill beat the same agent without it, on the real task?
Arm A is the baseline, with no skill. Arm B gets the full `atomic-decomposition/SKILL.md`
file, checked by its SHA-256 hash (`SKILL_SHA` in `harness.py`).

The real task: decide whether a claim about a code base is true, by evidence, and write
the answer as a tree of checkable atoms. The agent sees only the code and the task text.

## Task text

`{claim}` is replaced by the fixture's claim. Arm B gets the preamble
`The following skill applies to this task. Follow it.`, then the skill inside
`<skill>` tags, then this same text.

```
Decide whether the claim below is true of the code in the current directory. Use only the files here and commands you run here, with no network. Settle it by evidence, not by what a comment or a document says.

Claim: {claim}

Write your answer as JSON to report.json in the current directory, and nothing else in that file. Shape:
{"root": {"claim": "<the claim, restated so it can be checked>", "verdict": "confirmed|refuted|unsettled", "op": "all|any"},
 "atoms": [{"id": "A1", "parent": "root", "op": "all|any", "claim": "<one checkable statement>", "verdict": "confirmed|refuted|unsettled|not_checked", "evidence": "<the command and its real output, or the quoted lines>"}]}
"parent" is "root" or the id of another atom. "op" says how the children of that node combine; give it on the root and on every atom that has children, and leave it out on a leaf. A parent verdict must follow from its children: an all-parent is refuted if any child is refuted, confirmed if every child is confirmed, otherwise unsettled; an any-parent is confirmed if any child is confirmed, refuted if every child is refuted, otherwise unsettled; children marked not_checked are ignored. Use unsettled when the evidence needed is not available here.
```

## Harness

`harness.py` makes one fresh headless call per fixture and arm, in a new empty folder
under the system temp folder, with the prompt on standard input:

```
claude -p --model claude-sonnet-5-5 --tools Read,Grep,Glob,Write,Bash \
  --allowedTools Read Grep Glob Write "Bash(python3:*)" "Bash(node:*)" "Bash(ls:*)" \
  "Bash(cat:*)" "Bash(grep:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(find:*)" "Bash(wc:*)" \
  --strict-mcp-config --setting-sources "" --permission-mode acceptEdits \
  --no-session-persistence --output-format stream-json --verbose
```

Both arms get the same allow list. A command outside it is refused and the run goes on.
After each call the harness keeps the prompt, transcript, report and scratch folder.
`harness.py audit` marks a run INVALID on a non-zero exit, a missing report, a
truncation, a rate limit, a different model or tool set, a prompt that differs from the
builder, a tool input that names the answer key, or fixtures changed after the run.
Arm B never runs on the `dev` split.

## Fixture formats

`fixtures/<id>/case.json` is never shown to the agent. It holds `id`, `kind`, `split`,
`claim`, `root` (the correct verdict), `why`, `evidence_tokens`, an optional `must_run`
and `exemplar` (a complete correct report). Kinds:

| Kind | Root | How the obvious check misleads |
|---|---|---|
| `universal` | refuted | One member of a set fails, reached only through a registry, config or an edge input. |
| `any-ways` | either | The obvious route fails but another works, or several routes each fail differently. |
| `unsettled` | unsettled | The deciding fact is outside the sandbox; the in-repo default suggests an answer. |
| `looks-false` | confirmed | A scary code path or a document suggests the claim is false, but it is guarded. |

Two formats exist:

- Invented repository (`p-01` to `p-06`): `fixtures/<id>/repo/` is copied into the
  scratch folder. Each is 15 to 20 files and about 500 lines of standard-library Python,
  with a README and a passing test suite that agree with the claim.
- Real-repository export (`r-01` to `r-06`): no `repo/` folder, and `case.json` has a
  `repo_ref`. The scratch folder is `git archive <repo_ref>` of this repository, pinned
  at `dc6a0af7b309c77d8aef164208595abbe6c506f8`, without `atomic-decomposition/`, the two
  `benchmarks/skill-context/` files named after it, `.claude/` or any git history. The
  export still names the skill in `README.md` (a summary of its method) and four other
  files; see RESULTS.md. A run with both arms must redact or audit those first.

All twelve fixtures are in the `dev` split. They are development cases for checking
difficulty, not held-out cases.

## Grade rule v2

A run succeeds only if all five checks hold:

1. `shape`: `report.json` parses and has the shape the task text asks for, with every
   atom reachable from the root.
2. `root`: the root verdict equals the key's `root`.
3. `evidence`: for every group in `evidence_tokens`, at least one of its lowercase
   literal strings appears in the lowercased report text (root claim, atom claims and
   evidence).
4. `consistent`: the propagation rule of the task text, applied bottom up, gives the
   reported verdict at the root and at every atom with children.
5. `ran`: when the key has `must_run`, some Bash command that was not refused contains
   one of its strings. Use it only when reading cannot settle the truth.

Nothing else is graded. `grade.py --self-test` checks every key and that every exemplar
passes. `tests/test_atomic_decomposition_benchmark.py` tests the grader, harness and
analysis.

## Settings a real run would freeze

| Setting | Value |
|---|---|
| Primary endpoint | fixture success: all five checks pass |
| Sampling unit | fixture, one cluster each |
| Margin m | 0.20 |
| Alpha | 0.05 |
| Ceiling rate | 0.80 |
| Floor rate | 0.20 |
| Quality floor | arm B success rate at least 0.60 |
| Calibration target | arm A dev success rate above 0.20 and at most 0.60 |

`analyze.py` holds these values and applies METHOD.md § Verdict precedence.
`analyze.py RUN --calibrate` scores a dev run of arm A against the calibration target.
A real run would freeze the plan, fixtures, grader and harness in one commit before arm
B runs on anything.

## Calibration attempts

All runs used model `claude-sonnet-5-5`, Claude Code 2.1.330 or 2.1.331, arm A only. Evidence is
under `~/.agent-state/skills/benchmark-skill/atomic-real-2026-11-23/`.

### Attempt 1: v1 keys on small invented fixtures (`cal1/`)

Forty invented fixtures of 3 to 8 files, ten of them dev. On dev, arm A scored 7, 8, 9
and then 10 of 10 over four passes (`dev-a-1` to `dev-a-4`). Every failure was a key or
grader fault, fixed before the next pass, never an agent fault. The v1 keys matched
regular expressions against atom wording, so a correct answer phrased in other words
failed. A harder re-authoring round then failed independent key validation: regexes too
broad or too narrow, and cases still shallow. The run stopped on a usage limit after
about 13 million subagent tokens, as the workflow run reported. The v1 fixtures were deleted.

### Attempt 2: v2 keys on larger invented repositories (`pilot-v2/`)

Six fixtures, `p-01` to `p-06`: two `universal`, two `any-ways`, one `unsettled`, one
`looks-false`. An independent validator checked every key and repaired three ambiguous
claims. Arm A passed 6 of 6, and every grade was fair. Three passes rested on reading
alone, with no program run. The allow list refused 16 commands. Cost: about 0.4 million
tokens for the three authoring agents and $0.38 of headless calls (about 0.5 million
tokens).

### Attempt 3: claims about this repository (`pilot-real/`)

Six fixtures, `r-01` to `r-06`, on the export described above. Arm A reached the right
root verdict on 6 of 6, but the grader scored 4 of 6. Both failures were key faults:

- `r-03` required a `node` run for a fact that reading the code settles. `must_run` was
  dropped.
- `r-05` lacked the wording the agent used, "not in this directory". The token group
  gained "not in this directory" and "outside this directory".

Re-graded without any model call under the corrected keys, the recorded reports score 6
of 6. Three of the six passes rested on reading alone. The allow list refused 6 commands.
Cost: about 0.4 million tokens for the three authoring agents and $0.33 of headless calls
(about 0.4 million tokens).
