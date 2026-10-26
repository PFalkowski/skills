# Calibration results

These are the two anchors, scored on 2026-10-26. They fix the scale: X is the strong
implementation and Y the weak one. They were not produced under the canonical prompt, so they
are not same-condition runs (see README, "Limits"). No candidate is scored here.

Pins: start `67821d4`, anchor X `33780fa`, anchor Y `d1e66ca`, all from the
`benchmark/issue-25-v1/*` tags.

## Judged scores (tier 2)

Blind comparison of X against Y by six fresh reviewers and one judge, run one at a time. The
numbers are the judge's scores (0 to 5). The reviewers' own scores are in brackets where the
judge moved them.

| Dimension | X | Y |
|---|---|---|
| 1. Correctness and parity | 4 (reviewer 5) | 1 |
| 2. ADR-0007 boundaries | 4 | 2 |
| 3. Security | 4 | 3 |
| 4. Tests | 4 | 2 |
| 5. Simplicity and maintainability | 4 | 2 |
| 6. Docs and running | 4 (reviewer 5) | 2 |

X: 4 / 4 / 4 / 4 / 4 / 4. Y: 1 / 2 / 3 / 2 / 2 / 2. Verdict: continue X.

## Mechanical scores (tier 1), reproduced by `score.py`

Each anchor was exported with `git archive` to a clean folder outside both repositories and
scored with `score.py` (commands below). "Target" is the number in the original report; "Run"
is what `score.py` produced. Every number matches except the Windows parity counts, which are
one lower in each group because the scorer now leaves out one case (see below). Windows was
scored three times for each anchor and the counts did not change between runs.

### Windows 11

Environment: Windows 11 (10.0.26200), .NET SDK 11.0.100-rc.2.26504.105 building net10.0 (the
SDK the muxer picks here, and the one the original run used; the only 10.x SDK installed is a release candidate), Python 3.13.1 (the
reference's `Server` header reads `BaseHTTP/0.6 Python/3.13.1`), Node v22.13.1.

| Check | X target | X run | Y target | Y run |
|---|---|---|---|---|
| `dotnet test` pass / fail / skip | 98 / 0 / 1 | 98 / 0 / 1 | 28 / 0 / 0 | 28 / 0 / 0 |
| Build warnings | 0 | 0 | 0 | 0 |
| `node --check app.js` | pass | pass | pass | pass |
| Parity diffs: status / body / security headers | 5 / 17 / 11 | 4 / 16 / 10 (3 runs) | 53 / 57 / 17 | 52 / 56 / 16 (3 runs) |
| Database compatibility (both directions, six checks) | all yes | all yes | all yes | all yes |
| Stale-guard repro, statuses of the five later steps | 200 x5 | 200 x5 | 200, 200, 500, 500, 200 | 200, 200, 500, 500, 200 |
| Stops on Ctrl+C when idle | yes, exit 0 | yes, exit 0 | no | no, still running after 15 s |
| Request in flight at Ctrl+C | 200, exits after, item saved | 200, exits after, item saved | 200, does not exit, item saved | 200, does not exit, item saved |
| `Server` header | none | none | `Microsoft-HTTPAPI/2.0` | `Microsoft-HTTPAPI/2.0` |

The Python reference stopped on Ctrl+C in both runs (exit code 0xC000013A, the Windows
Ctrl+C status), reset the in-flight connection and did not save the item. This matches the
original lifecycle table.

### Linux

Environment: Docker `mcr.microsoft.com/dotnet/sdk:10.0` (Linux 5.15 on WSL 2), SDK 10.0.401,
Python 3.12.3 and Node v18.19.1 installed from the image's package manager. The scorer ran
inside the container on `git archive` exports.

| Check | X target | X run | Y target | Y run |
|---|---|---|---|---|
| `dotnet test` pass / fail / skip | 99 / 0 / 0 | 99 / 0 / 0 | 28 / 0 / 0 | 28 / 0 / 0 |
| Parity diffs: status / body / security headers | 4 / 16 / 10 | 4 / 16 / 10 | 53 / 55 / 17 | 53 / 55 / 17 |
| Database compatibility | all yes | all yes | all yes | all yes |
| Stops on SIGINT when idle | yes, exit 0 | yes, exit 0 | no | no, still running after 15 s |
| Request in flight at SIGINT | exits after, item saved | exits after, item saved | does not exit | does not exit, item saved |
| `Server` header | none | none | `Microsoft-NetCore/2.0` | `Microsoft-NetCore/2.0` |

The same Docker image also ran the tests from the Windows host with `score.py --docker`:
X 99 / 0 / 0 and Y 28 / 0 / 0, zero build warnings, and `node --check` passing in `node:22`.

### The 1 MB parity case

The original counts included `POST 1MB`. On Windows the Python reference answers that request
400 on some runs and aborts the connection (WinError 10053) on others, so a count that includes
it flips by one in every group. A first set of three Y runs gave 52 / 56 / 16 once and
53 / 57 / 17 twice. The scorer now leaves that case out of the status, body and header counts and
prints it on its own line (128 of the 129 requests are counted). With it left out, the three
re-scored runs of each anchor on Windows were identical: X 4 / 16 / 10 and Y 52 / 56 / 16. The
original report's 5 / 17 / 11 and 53 / 57 / 17 are exactly one higher in every group, which is
the 1 MB case counted as a difference. On Linux the reference answers it 400 every time and the
case was not a difference for either anchor, so the Linux numbers did not move.

## Differences from the original method, and why they do not change the numbers

- **1 MB case left out of the counts.** See the section above.
- **Edge case reported separately.** The original compatibility runs left out the request that
  stores an item with a lone-surrogate escape, because such a row breaks `GET /api/state`
  for every reader. `score.py` does the same for the writer databases and reports the edge case
  on its own: on the reference's database, `GET /api/state` answers 500 in both X and Y and
  200 in Python.
- **No detached worktrees.** The first attempt placed the anchors as worktrees under the
  private checkout. Y then failed to restore: its tree has no central package file, but a
  parent folder did, and NuGet read it. X was unaffected. `score.py` now refuses a candidate
  that has MSBuild or `global.json` files in a parent folder, and the anchors were scored from
  `git archive` exports in a temporary folder instead.
- **Node on Linux** was v18 here and v22 in the original. Only `node --check` uses it, and it
  passed.
- **Reference Python** was 3.13.1 on Windows (same as the original, judging by the `Server`
  header) and 3.12.3 on Linux. The reference's answers to the 1 MB upload depend on the
  platform, which is the known one-point shift in X's Linux numbers.
- **SDK.** Windows used the 11.0 release-candidate SDK that the original run also used. The
  Linux and Docker runs used 10.0.401.

## Commands run

From the skills worktree, with `<private>` a clone of the private repository:

```powershell
python benchmarks/attention-rewrite/score.py --private <private> --candidate <private> --ref benchmark/issue-25-v1/anchor-x --out <tmp>/sc-x --label anchor-x
python benchmarks/attention-rewrite/score.py --private <private> --candidate <private> --ref benchmark/issue-25-v1/anchor-y --out <tmp>/sc-y --label anchor-y
```

Each Windows command was run three times into a new folder. The earlier `--docker` run from
Windows (X 99 / 0 / 0, Y 28 / 0 / 0) used the same command with `--docker` added. Linux: the
recipe in the README, once per anchor.
