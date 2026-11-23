# unslop on real prose

A `benchmark-skill` comparison of the upstream `unslop` skill (arm A) with the adapted one
(arm B) and a no-skill control, on sections of this repo's own skills and README. The
plan is [EXPERIMENT.md](EXPERIMENT.md); the outcome is [RESULTS.md](RESULTS.md).

| File | What it is |
|---|---|
| `EXPERIMENT.md` | The frozen plan: population, splits, answer key, harness, grader, decision settings, calibration and grader validation. |
| `RESULTS.md` | The verdict and the numbers behind it. |
| `build_pool.py` | Cuts the sources at commit `4a01f8d` into passages and draws the seeded splits; with `--key` it merges an authored answer key. |
| `cases.json` | The frozen cases: dev, test and gate passages with their facts and rules. |
| `authoring/` | The briefs given to the subagents that wrote the answer key and the reference rewrites. |
| `harness.py` | Runs one headless Claude Code call per case and arm and audits every transcript. |
| `grade_real.py` | Grades rewrites under the original and the current pattern list. `--self-test` checks the key and the dev rewrites. |
| `analyze.py` | Applies the frozen decision rule. `--calibrate` scores a dev calibration run. |
| `dev/` | Reference rewrites of the dev passages: `good`, `alt`, `bad` (patterns left in) and `ruledrop` (one rule removed). |

To rerun into a new folder (`A.md` and `B.md` are the two skill files, checked by hash):

```
python3 harness.py run --cases cases.json --splits test gate --arms control a b \
  --skill-a A.md --skill-b B.md --run-dir RUN
for arm in control a b; do
  (python3 grade_real.py cases.json RUN/$arm --split test
   python3 grade_real.py cases.json RUN/$arm --split gate) > RUN/$arm.jsonl
done
python3 analyze.py RUN --not-last-suite
```
