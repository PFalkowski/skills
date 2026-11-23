# atomic-decomposition on the real task

A `benchmark-skill` comparison of the same agent with the `atomic-decomposition` skill
(arm B) and without it (arm A), on 40 small code bases with one claim each. The plan is
[EXPERIMENT.md](EXPERIMENT.md).

| File | What it is |
|---|---|
| `EXPERIMENT.md` | The frozen plan: question, task text, fixtures, harness, grade rule and decision settings. |
| `fixtures/<id>/` | `case.json` (claim and answer key) and `repo/` (the code the agent sees). |
| `harness.py` | Runs one headless Claude Code call per fixture and arm, audits every transcript and grades the reports. |
| `grade.py` | The grade rule. `--self-test` checks every key and exemplar. |
| `analyze.py` | Applies the frozen decision rule. `--calibrate` scores a dev run of arm A. |

To rerun into new folders (`SKILL.md` is checked by hash; arm B never runs on dev):

```
python3 harness.py run --arms a --splits dev --run-dir DEV
python3 harness.py grade --run-dir DEV
python3 analyze.py DEV --calibrate

python3 harness.py run --arms a b --splits test gate --skill SKILL.md --run-dir RUN
python3 harness.py grade --run-dir RUN --skill SKILL.md
python3 analyze.py RUN
```
