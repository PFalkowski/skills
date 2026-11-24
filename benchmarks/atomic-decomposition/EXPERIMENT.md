# Frozen plan: atomic-decomposition against no skill, on the real task

## Pilot 2: real-repository claims

The first pilot put the no-skill baseline at 6 of 6, because each invented repository
was small enough to read whole. Pilot 2 asks whether claims about this repository, with
about 480 files, get the baseline off that ceiling.

- A fixture with no `repo/` folder and a `repo_ref` in `case.json` gets
  `git archive <repo_ref>` of this repository as its scratch directory. The pin is
  `dc6a0af7b309c77d8aef164208595abbe6c506f8`.
- The export leaves out `atomic-decomposition/`,
  `benchmarks/skill-context/RESULTS-atomic-decomposition.md`,
  `benchmarks/skill-context/cases-atomic-decomposition.json` and `.claude/`. It has no
  `.git`, so the agent sees no history.
- Both arms get the same tools: Read, Grep, Glob, Write and a shell limited to
  `python3`, `node`, `ls`, `cat`, `grep`, `head`, `tail`, `find` and `wc`.
- `r-01` to `r-06` are development cases. Only the baseline arm (arm A) may run on them.

## Redesign v2

### Why v1 failed

The v1 fixtures were too easy. They had 3 to 8 files each, and the no-skill baseline
passed 10 of 10 dev fixtures by reading the relevant file and running the obvious
command, so the suite could not tell the arms apart.

The v1 answer keys graded wording. They used regular expressions on atom text, both to
find a deciding atom and to catch false confirmations, and they marked correct answers
wrong when an agent phrased a finding in words the pattern did not expect.

### What changed

Every v1 fixture is gone. A v2 fixture is a repository of 12 to 20 files and 500 to
900 lines, Python standard library only, deterministic, with its own README and a test
suite that passes. Each one is built so that the obvious check (run the tests, try the
README example, read the salient file) gives a wrong or incomplete answer. Four kinds:

| Kind | Root | How the obvious check misleads |
|---|---|---|
| `universal` | refuted | A claim over every member of a set; the one member that fails is reached only through a registry, dynamic dispatch, config or an edge input the README and tests never use. |
| `any-ways` | confirmed or refuted | The obvious way fails but another works, or several plausible ways each fail for a different reason, one of them looking like success. |
| `unsettled` | unsettled | The deciding fact lives outside the sandbox, while the in-repo default makes one answer look right. |
| `looks-false` | confirmed | A scary code path or a document suggests the claim is false, but the path is guarded elsewhere. |

### Fixture format

`fixtures/<id>/repo/` is what the agent sees. `fixtures/<id>/case.json` is never shown
to it and holds:

- `id`, `kind`, `split` (`dev`, `test` or `gate`);
- `claim`: one or two plain sentences, as a colleague would say them;
- `root`: the correct verdict for the claim as asked (`confirmed`, `refuted` or `unsettled`);
- `why`: why that verdict is right, what the obvious check shows, and why it misleads;
- `evidence_tokens`: 1 to 3 groups, each a list of lowercase literal strings (not
  regular expressions) that any correct investigation must mention;
- `must_run` (optional): lowercase literal substrings of a shell command, used only
  when the truth must be executed rather than read;
- `exemplar`: a complete correct report.

### Grade rule v2

A run succeeds only if all of these hold:

1. `report.json` parses and has the required shape.
2. `root.verdict` equals the key's `root`.
3. Every `evidence_tokens` group is found: at least one of its strings is a substring of
   the lowercased text of the report (the root claim plus every atom claim and evidence).
4. Recomputing every parent bottom up by the propagation rule gives the reported verdict
   at every atom with children and at the root. An all-parent is refuted if any child is
   refuted, confirmed if every child is confirmed, else unsettled; an any-parent is
   confirmed if any child is confirmed, refuted if every child is refuted, else
   unsettled; `not_checked` children are ignored.
5. `must_run`, when given, matches some shell command the agent ran.

Nothing else is graded: no pattern on wording, and no check of an atom verdict against
its text. `grade.py --self-test` checks every key and that every exemplar passes.

### Pilot fixtures

Six pilot fixtures, `p-01` to `p-06`, are in the `dev` split: two `universal`, two
`any-ways` (one confirmed, one refuted), one `unsettled` and one `looks-false`. They are
development cases for checking difficulty. Only the baseline arm (A) may run on them;
arm B never does.

The sections below are the v1 plan, superseded by this section and due for a rewrite.

This plan follows [METHOD.md](../../benchmark-skill/METHOD.md). Its author built the
harness, grader and analysis without reading the skill under test, the skills it names,
or their history. Every setting below is frozen in one commit before arm B runs on
anything and before any A-against-B result exists. After that commit, a change to a
fixture, the answer key, the grader or the prompt voids every score. The whole run is
then redone as a new run in a new folder.

## Question

Does the atomic-decomposition skill beat the same agent without it, on the real task?

| Arm | Text | SHA-256 |
|---|---|---|
| A (the baseline) | no skill | |
| B (the skill) | `atomic-decomposition/SKILL.md` at worktree HEAD `dc6a0af` (last changed in `434d641`), the full file, front matter included | `c38164d4432ee2a49b612c3f0cdfd3463b56f06416ed2dd56bdbb304664653b9` |

The hash was taken over the file's bytes. `harness.py` refuses a skill file whose hash
differs.

## Task

The real task is to decide whether a claim about a small code base is true, by
evidence, and to write the answer as a tree of checkable atoms. Each fixture is one
small Python repository and one claim. The agent sees only the repository and the task
text. The task text is frozen; `{claim}` is replaced by the fixture's claim:

```
Decide whether the claim below is true of the code in the current directory. Use only the files here and commands you run here, with no network. Settle it by evidence, not by what a comment or a document says.

Claim: {claim}

Write your answer as JSON to report.json in the current directory, and nothing else in that file. Shape:
{"root": {"claim": "<the claim, restated so it can be checked>", "verdict": "confirmed|refuted|unsettled", "op": "all|any"},
 "atoms": [{"id": "A1", "parent": "root", "op": "all|any", "claim": "<one checkable statement>", "verdict": "confirmed|refuted|unsettled|not_checked", "evidence": "<the command and its real output, or the quoted lines>"}]}
"parent" is "root" or the id of another atom. "op" says how the children of that node combine; give it on the root and on every atom that has children, and leave it out on a leaf. A parent verdict must follow from its children: an all-parent is refuted if any child is refuted, confirmed if every child is confirmed, otherwise unsettled; an any-parent is confirmed if any child is confirmed, refuted if every child is refuted, otherwise unsettled; children marked not_checked are ignored. Use unsettled when the evidence needed is not available here.
```

Arm A gets that text alone. Arm B gets this preamble and then the same text:

```
The following skill applies to this task. Follow it.

<skill>
{full skill file}
</skill>

```

## Fixtures and splits

`fixtures/<id>/` holds `case.json` (the claim and the answer key) and `repo/` (the code
the agent sees). There are 5 kinds with 8 fixtures each:

- `lying-doc`: a README or comment says something the code does not do.
- `any-ways`: the claim holds if any of several routes holds.
- `compound`: the claim joins several parts, and one may fail.
- `executable`: the answer shows only when the program is run.
- `unsettled`: the evidence needed is not in the repository.

| Split | Fixtures | Use |
|---|---|---|
| `dev` | ids 01 and 02 of each kind, 10 fixtures | grader validation and calibration, arm A only |
| `test` | ids 03 to 08 of `lying-doc`, `any-ways`, `compound` and `executable`, 24 fixtures | carries the verdict |
| `gate` | ids 03 to 08 of `unsettled`, 6 fixtures | critical; can block, never carries the verdict |

The sampling unit is the fixture: each fixture is one cluster, so n = 24 test clusters.
All 40 fixtures are kept. Every case file has the same keys and every exemplar passes
the grader (`grade.py --self-test`). One key was fixed before the freeze:
`executable-07` listed four `must_run` regexes meant as alternatives, which the grade
rule would have read as four commands all required. They are now one regex joined by
`|`.

Calibration attempt 1 (`cal1/dev-a-1`, arm A on dev, audit clean) scored 7 of 10. A
reading by hand found all three failures correct answers marked wrong by the key, so
these keys were fixed before the freeze, each with a unit test on the agent's own text:

- `any-ways-01`: the agent confirmed "validate.check does not catch it", the same fact
  as the key's refuted "the validator rejects it". The `deciding` entry gained an `or`
  alternative for the negated statement, and the grader learned `or`.
- `compound-02`: the `false_confirms` regex caught the true atom "counts, class
  counters, buckets and slowest merge exactly"; it now exempts claims about those
  fields that do not name the mean. `must_run` required `main.py`, but the agent ran
  the merge through `python3 -c` on `Summary` and got real numbers; that now counts.
- `unsettled-01`: an entry required a confirmed atom stating the code default of 30.
  The root does not depend on it, since the cron line always sets the variable, so the
  entry was removed.

Calibration attempt 2 (`cal1/dev-a-2`, audit clean) scored 8 of 10. Both failures were
again correct answers that the key's wording missed, so both were fixed with a test:

- `any-ways-01`: the `false_confirms` regex caught the true atom "check() passes the
  booking ... but save() rejects it"; "passes" now exempts a claim, as "lets" did.
- `executable-02`: the `deciding` pattern knew "no argument" but not "no-arg".

Calibration attempt 3 (`cal1/dev-a-3`, audit clean) scored 9 of 10. In `executable-01`
the agent ran the program as `python3 -I -c "...import main"`, and the output it quoted
is in the transcript, but `must_run` knew only `python3 ... main.py` and a one-line
`python3 -c`. Every key whose `must_run` names `main.py` (`compound-02`, `executable-01`
to `-06` and `-08`) now also accepts a `python3` command that imports `main`, and the
`-c` alternatives (`executable-01`, `-04`, `-07`) accept flags before `-c` and code on
later lines. A test checks this for every key with `must_run`. Under the final keys,
all 30 dev reports from attempts 1 to 3 pass.

Calibration was rerun into `cal1/dev-a-4`.

Arm B never runs on dev. No A-against-B result is looked at before the freeze.

## Model and harness

- Model `claude-sonnet-5-5`, Claude Code CLI 2.1.330. One trial per arm and fixture.
- One fresh headless call per fixture and arm. `harness.py` copies `repo/` (without
  `__pycache__`) into a new empty folder under the system temp folder, passes the prompt
  on standard input and runs there:

  ```
  claude -p --model claude-sonnet-5-5 --tools Read,Grep,Glob,Write,Bash \
    --allowedTools "Read" "Grep" "Glob" "Write" "Bash(python3:*)" "Bash(ls:*)" \
    "Bash(cat:*)" "Bash(grep:*)" "Bash(head:*)" --strict-mcp-config --setting-sources "" \
    --permission-mode acceptEdits --no-session-persistence --output-format stream-json \
    --verbose < prompt.txt > transcript.jsonl
  ```

- The allow list is the same for both arms and was not changed. Three probes on
  2026-11-23, each on the `executable-06` repository with a setup prompt that is not the
  task, showed: the init record lists exactly `Bash`, `Glob`, `Grep`, `Read` and `Write`
  and no MCP servers; the only skills listed are the CLI's built-in ones, the `Skill`
  tool is absent, and the agent reported no instruction files, so no user skills or
  global rules leak; `python3 -c` and `python3 main.py` run without a prompt;
  `report.json` lands in the scratch folder. The permission mode also lets plain file
  commands such as `touch` run inside the folder. A command outside the list, such as
  `node`, is refused and recorded as a `permission_denied` record; the run goes on.
- Calls run 4 at a time, in an order shuffled by `random.Random(5309)`. Arms A and B on
  test and gate run in one run folder, in one shuffled order.
- After each call, the harness copies `report.json` to `reports/<arm>/<id>.json` and the
  whole scratch folder to `scratch/<arm>/<id>/`, then deletes the temp folder. A
  rate-limit rejection stops the harness from starting further calls.
- Evidence goes to `~/.agent-state/skills/benchmark-skill/atomic-real-2026-11-23/`:
  `probe-1` to `probe-3` (the probes), `dev-a-1` (calibration) and `run-1` (the full
  run; a rerun after an INVALID run gets `run-2`). Each run folder holds `manifest.json`
  (date, model, CLI version, commit, skill, grader and fixture hashes, seed, order,
  exit codes), the prompts, transcripts, reports, scratch copies, `audit.json` and
  `grades/<arm>.jsonl`.

A run is INVALID, discarded whole, fixed and rerun in a new folder when any call shows:
a tool other than Read, Grep, Glob, Write and Bash; a missing or empty `report.json`
(an invalid run, not a wrong answer); a truncation or a result that is not a normal
`end_turn` success; a rate-limit rejection; a prompt that differs from the builder's
output. The harness also treats these as INVALID: a non-zero exit, no transcript (a
call skipped after a rate limit), a different model, tool list or MCP server set in the
init record, a tool input that names `case.json` or the fixtures folder, and fixtures
that changed after the run. `harness.py audit` exits 3 on any of these.

## Grade rule

`grade.py` grades one report. A fixture run succeeds only when all six checks hold.

1. `shape`: `report.json` parses as JSON and has a `root` object and an `atoms` list.
   The root has a string `claim`, a `verdict` of confirmed, refuted or unsettled and an
   `op` of all or any. Every atom is an object with a unique string `id` (not `root`), a
   string `claim`, a string `evidence` when present, a `verdict` of confirmed, refuted,
   unsettled or not_checked, and a `parent` that is `root` or another atom's id. Every
   atom that has children has an `op` of all or any. Every atom is reachable from the
   root, so a parent cycle fails. Extra keys, and an `op` on a leaf, are allowed.
2. `root`: the root verdict equals the key's `root`.
3. `deciding`: for every entry of the key's `deciding`, some atom has the entry's
   verdict and its claim and evidence, joined by a space, match the entry's pattern.
   An entry may list alternatives under `or`, each with its own verdict and pattern, for
   the same fact stated the other way round; any one of them satisfies the entry.
4. `no_false_confirm`: no atom whose claim matches a regex in `false_confirms` has the
   verdict confirmed. Only the claim is read, not the evidence.
5. `consistent`: at the root and at every atom that has children, the propagation rule
   of the task text, applied to the children's reported verdicts with that node's
   `op`, gives the node's reported verdict. Children marked not_checked are ignored. A
   node with no counted children computes to unsettled. This fails when `shape` fails.
6. `ran`: every regex in the key's `must_run` matches at least one Bash command in the
   transcript, so the program was really run. A command the permission check refused
   does not count. A command that ran and failed does count.

Regexes in checks 3 and 4 are case-insensitive, and the text is matched after every run
of whitespace, newlines included, becomes one space. Check 6 matches each raw command
with `^` and `$` at line ends. The brief that set this plan called the endpoint "all
five checks"; the grade rule it froze lists six, and this plan requires all six.

`grade.py --self-test` checks every key: ids, kinds and splits as above, every regex
compiles, every repository exists and holds no `report.json`, a fixture with `must_run`
has a `main.py`, and every exemplar passes with the command `python3 main.py`.
`tests/test_atomic_decomposition_benchmark.py` also checks, for every fixture, that four
mutants of its exemplar fail: a wrong root; the atoms that satisfy the first deciding
entry given the other verdict; a confirmed atom whose claim is a natural wrong
statement (one per fixture, written by the plan's author) that a `false_confirms` regex
catches, skipped for the two fixtures with no `false_confirms`; and a root verdict that
contradicts propagation. Both pass before the freeze.

## Decision settings

| Setting | Value |
|---|---|
| Primary endpoint | fixture success: all six checks pass |
| Sampling unit | fixture, one cluster each; n = 24 test clusters |
| Margin m | 0.20 |
| Alpha | 0.05 |
| Ceiling rate | min(0.90, 1 - m) = 0.80 |
| Floor rate | 0.20 |
| Quality floor | B success rate at least 0.60 |
| Calibration target | arm A dev success rate above 0.20 and at most 0.60 |
| Ladder | one rung only; this suite is the last allowed suite |
| Minimum clusters | 24 |

Critical gates:

1. METHOD step 2: any gate fixture that A passed and B failed.
2. False-confirm gate: any test or gate fixture where A had no false confirm and B
   marked a `false_confirms` atom confirmed.

Because A is the no-skill baseline, there is no separate sensitivity gate: B beating A
by more than m is the effect asked about. There is no earlier suite, so step 6 cannot
match.

`analyze.py` takes `paired_interval` from `benchmark-skill/scripts/score.py` and applies
METHOD.md § Verdict precedence in order. The first step that matches decides.

1. INVALID: the audit failed; an arm's grades do not cover each test and gate fixture
   exactly once; a grade record is marked invalid; or the ceiling rate is at or below
   2m.
2. REGRESSION: either critical gate fires.
3. INCONCLUSIVE: fewer than 24 test clusters.
4. REGRESSION: the paired interval lies entirely below -m.
5. INCONCLUSIVE, reason "floor effect": A's test success rate is at or below 0.20, or
   both arms fail every test fixture. A ceiling (A's rate at or above 0.80) goes on to
   the next steps and is named in the report; IMPROVEMENT is out of reach there.
6. Does not apply: no earlier suite.
7. Does not apply: no sensitivity gate.
8. IMPROVEMENT: the interval lies entirely above +m, B's success rate is at least 0.60,
   and B passes every gate fixture.
9. NO_MEANINGFUL_CHANGE: the interval lies inside [-m, +m], with the same two
   conditions.
10. Otherwise INCONCLUSIVE, with reason "ceiling" when A is at the ceiling.

Steps 8 and 9 follow METHOD: B must pass every critical case, not only avoid a critical
regression. The report also gives descriptive numbers, none of which decide anything:
success rates per arm and kind, the fixtures only B or only A passed, the fixtures both
passed and both failed, the pass rate of each check, the mean number of atoms per
report, cost, tokens and refused commands.

## Procedure

1. Commit this plan, the harness, grader, analysis and tests.
2. Calibrate: run arm A on dev into `dev-a-1`, grade it and run
   `analyze.py dev-a-1 --calibrate`. Read every dev transcript and report and compare
   the grader's six checks with a reading by hand. A grader or key fault found here is
   fixed before the freeze, and calibration is rerun into a new folder. Every attempt is
   recorded.
3. If A misses the calibration target, there is no other rung to move to. The test run
   still goes ahead once, as the last allowed suite, and the miss is reported with the
   verdict.
4. Freeze: commit the final plan, fixtures, grader and harness. Record the commit.
5. Run arms A and B on test and gate into `run-1`, grade, and run `analyze.py run-1`.
6. Write `RESULTS.md` with the verdict, the report and the frozen commit.

If any call fails with a usage-limit or rate-limit error, the run stops and is INVALID.
It is rerun whole, both arms, into a new folder.
