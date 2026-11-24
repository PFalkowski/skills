# atomic-decomposition on the real task

A `benchmark-skill` comparison of the same agent with the `atomic-decomposition` skill
(arm B) and without it (arm A), on claims about code bases. It ended with no verdict:
the no-skill baseline was at the ceiling, so arm B never ran. See
[RESULTS.md](RESULTS.md).

| File | What it is |
|---|---|
| `EXPERIMENT.md` | Design and calibration record: task text, harness, fixture formats, grade rule, settings and the three attempts. |
| `RESULTS.md` | The outcome and what a future attempt would need. |
| `fixtures/<id>/` | `case.json` (claim and answer key) and, for invented fixtures, `repo/` (the code the agent sees). |
| `harness.py` | Runs one headless Claude Code call per fixture and arm, audits every transcript and grades the reports. |
| `grade.py` | Grade rule v2. `--self-test` checks every key and exemplar. |
| `analyze.py` | The decision rule. `--calibrate` scores a dev run of arm A. |

All fixtures are development cases: `p-01` to `p-06` are invented repositories, and
`r-01` to `r-06` are claims about an export of this repository. Arm B never runs on them.

Self-test and tests, offline and with no model calls (from the repository root):

```
python3 benchmarks/atomic-decomposition/grade.py --self-test
python3 -m unittest discover -s tests -p 'test_atomic_decomposition_benchmark.py'
```

A calibration of arm A on the dev fixtures makes paid model calls, into a new folder:

```
python3 harness.py run --arms a --splits dev --run-dir DEV
python3 harness.py grade --run-dir DEV
python3 analyze.py DEV --calibrate
```
