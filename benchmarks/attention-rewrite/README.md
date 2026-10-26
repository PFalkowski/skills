# Attention rewrite: an end-to-end agent benchmark

Compare models, harnesses and skill sets on one real task. The task is to rewrite a small
Python HTTP and SQLite backend as a C# modular monolith behind an unchanged HTML board. The
task text, the starting code and two calibration solutions live in a private repository.
This folder holds the public half: the protocol, the sandbox builder, the mechanical scorer
and the review rubric.

Nothing from the private repository is copied here. The task text stays behind a tag. The
scorer takes its expected answers by running the Python reference live.

## What one run is

One run is one attempt by one configuration. Record all of these before it starts:

- the harness and its version (for example Claude Code 2.x, or a plain API loop),
- the model ID,
- the effort or reasoning setting,
- the skills commit (the git commit of this repository that the harness could load, or
  "none"),
- any extra instructions beyond the canonical prompt (normally none).

Two runs with any difference in that list are different configurations.

## Pins

The private repository carries four annotated tags. A scorecard must name the tag commits it
used. `setup.py` and `score.py` refuse a tag that has moved.

| Tag | Commit | Meaning |
|---|---|---|
| `benchmark/issue-25-v1/start` | `67821d4` | Starting snapshot. Every run begins here. Its `server.py` is the Python reference. |
| `benchmark/issue-25-v1/anchor-x` | `33780fa` | Calibration anchor X, the strong one. |
| `benchmark/issue-25-v1/anchor-y` | `d1e66ca` | Calibration anchor Y, the weak one. |
| `benchmark/issue-25-v1/fixtures` | orphan commit | The canonical `PROMPT.md` and `ISSUE.md`, provenance notes and the original calibration material. |

A change to any pin is a new benchmark version (`v2`), not an edit. Read the task files from
the fixtures tag only. Never copy them into this repository.

## Sandbox rules

The candidate sees only the start snapshot.

- Build the sandbox with `setup.py`. It makes a fresh repository from the start tag's
  history alone, on branch `main`, with no remote. It then checks that no ref, remote or
  object from after the start tag is reachable.
- The task files go beside the repository (`<out>/task/`), not inside it.
- Give the run no GitHub credentials, and do not log the harness in to the private account.
  The candidate must not be able to fetch the answer. NuGet restore may use the network.
- The private clone must not be readable by the candidate. Run the candidate as another OS
  user, in a container that does not mount the clone, or on another machine. `setup.py`
  removes git's record of where the objects came from (`FETCH_HEAD`, reflogs) and fails if the
  clone's path appears anywhere under the sandbox's `.git`, but it cannot stop a candidate
  that knows the path from opening it.
- The skills tree the harness runs with must not contain `benchmarks/attention-rewrite/`. Give
  the harness a skills checkout or export without that folder, and record which one in the run
  details. The scorer and rubric describe the app's HTTP and database contract.
- Do not place the sandbox, or any candidate, under another checkout that has MSBuild files
  in a parent folder (`Directory.Build.props`, `Directory.Packages.props`, `global.json`).
  They change the build. `score.py` refuses such a folder.
- No human help during the run. Count every intervention; the goal is zero.

## The scored artifact

The candidate's final commit on branch `candidate`. Uncommitted files, other branches and
chat output are not scored.

## What to record

| Item | Notes |
|---|---|
| Harness name and version | |
| Model ID and effort | Exact ID, not a family name. |
| Skills commit | Or "none". |
| Wall-clock time | Start of the prompt to the final commit. |
| Tokens or cost | If the harness reports them. Say "not available" otherwise. |
| Human interventions | Count and describe. Expect 0. |
| Machine | OS, .NET SDK, Python, Node (the scorer records these itself). |

## Scoring

There are two tiers. Report both; do not merge them into one number.

**Tier 1, mechanical** (`score.py`). Deterministic checks of what the candidate built:

- build, `dotnet test` and `node --check app.js`, with pass, fail, skip and warning counts;
  optionally the same in Docker `mcr.microsoft.com/dotnet/sdk:10.0` (flag `--docker`);
- HTTP parity: the same 129 scripted requests go to the Python reference and to the
  candidate, each on 127.0.0.1 with its own temporary database. The script covers every
  route, bad Host and Origin headers, content types, empty, oversized and chunked bodies,
  malformed JSON and encodings, the 2,000-character limit, the stale `expectedState` guard,
  every action, and unknown routes and methods. Differences are counted in three groups:
  status, body and security headers;
- a stale-guard repro: submit, advance, a stale primary, advance, submit, configure;
- database compatibility: each server writes a database, the other opens a copy of it, and
  six checks must hold (same items and order, agent binding kept, same key gives same id,
  an action works, old ids survive a new submit, schema unchanged). One edge case is
  reported on its own: a database that holds a lone-surrogate item;
- lifecycle: a real Ctrl+C (Windows console event) or SIGINT (Linux) must stop an idle
  server, and a request that is in flight must finish and be saved.

**Tier 2, judged** (`rubric.md`). A blind side-by-side review of the candidate against
anchor X, on six dimensions, scored 0 to 5 by a judge.

## Calibration anchors

The two anchors fix the scale. `RESULTS.md` holds the six judged scores and the mechanical
numbers for each, and says which environment produced them. A run of the scorer or of the
judges should be checked against them first: if your setup does not reproduce the anchors,
do not trust its numbers for a candidate.

## Limits

- The anchors were not produced under the canonical prompt. Their sessions differed in
  tooling and in what they could see (see the provenance notes behind the fixtures tag).
  They calibrate the scale. They are not same-condition runs.
- Judged scores are not deterministic. The same reviewers may score the same code one point
  apart on another day. Treat a one-point gap as noise.
- N=1 per configuration is weak evidence. Repeat a configuration before ranking it.
- The mechanical tier checks the HTTP behaviour the board uses, not every behaviour. No
  browser check is included.
- Windows and Linux differ slightly (Python itself answers the 1 MB upload differently, and
  one parity group shifts by one). Compare candidates only within one platform.
- The public harness reveals the app's HTTP and database contract (route, field and table
  names, and which requests the scorer sends), though never the expected outputs. A candidate
  that read it would learn what is checked. Keep it out of the candidate's reach (see Sandbox
  rules).
- The scorer does not prove that the Host binds only to loopback. The security reviewer in
  `rubric.md` checks that with a socket listing.
- One parity case (the 1 MB upload) is left out of the three difference counts and reported on
  its own line, because the Python reference answers it differently from run to run (400, or an
  aborted connection). The counts are therefore not comparable with the original report's.
- Anchors can be recognised from their mechanical scorecards (test counts, parity numbers,
  lifecycle results). Tier 2 is blind to names and paths, not to what the evidence shows.
- The Python reference runs under whatever Python is on the machine. Its `Server` header
  therefore changes with the version; this is not counted as a difference.

## Run it

Replace the folders with your own. `<private>` is a local clone of the private repository.

```powershell
# 1. Build the sandbox. The output folder must be new or empty.
python benchmarks/attention-rewrite/setup.py <private> D:/bench/run1

# 2. Run the harness under test in D:/bench/run1/repo, with the prompt in
#    D:/bench/run1/task/PROMPT.md. No credentials. Record the details above.

# 3. Score the final commit of branch `candidate`. The scorer exports it to a clean folder.
python benchmarks/attention-rewrite/score.py --private <private> --candidate D:/bench/run1/repo --ref candidate --out D:/bench/run1-score --label my-config

# 4. Read D:/bench/run1-score/scorecard.md (and scorecard.json).
```

The scorer deletes every `bin` and `obj` folder in the candidate folder before it builds, and
it does not score a Host when the build fails or when the dll is older than the build. Use
`--meta key=value` (repeatable) to store run details such as harness, model, effort and skills
commit in the scorecard; it also stores the resolved commit of every pin. With
`--reference-dir`, no pin is verified and the scorecard says so.

Options: `--docker` adds the container test run; `--candidate-cmd "<command with {db}>"`
overrides Host discovery (a Host is an executable project under `src/`); `--skip-lifecycle`
skips the Ctrl+C checks; `--reference-dir` replaces `--private` with an already extracted
start tree. The output folder must be empty and outside both repositories.

To score an anchor, use the tag as the ref:

```powershell
python benchmarks/attention-rewrite/score.py --private <private> --candidate <private> --ref benchmark/issue-25-v1/anchor-x --out D:/bench/anchor-x --label anchor-x
```

### Linux

Export the trees with `git archive`, then run the scorer inside the SDK image. The image
has no Python, so install it first (it needs the network once).

```bash
docker run --rm -v <this repo>/benchmarks/attention-rewrite:/bench:ro -v <work>:/w mcr.microsoft.com/dotnet/sdk:10.0 bash -c '
  apt-get update -qq && apt-get install -y -qq python3 nodejs
  python3 -B /bench/score.py --reference-dir /w/ref --candidate /w/cand --out /w/out --label linux'
```

`/w/ref` is the extracted start tag and `/w/cand` is the extracted candidate commit.

### Safety

The scorer starts servers only on 127.0.0.1 port 0 with databases in temporary folders. It
refuses any path under a `.data` folder or named `inbox.db`. It kills every process it
starts, including after a failure. On Windows it opens one hidden console per lifecycle
server so that Ctrl+C reaches that server only. It is stdlib-only Python.

## Files

| File | Purpose |
|---|---|
| `setup.py` | Build the sandbox and check its isolation. |
| `score.py` | Tier 1 scorer. |
| `harness/` | Scorer modules: `parity`, `dbcompat`, `lifecycle`, `buildtest`, `scorecard`, `gitutil`, `common`; `launch.py` and `ctrlc.py` for Windows Ctrl+C. |
| `rubric.md` | Tier 2 protocol and reviewer briefs. |
| `RESULTS.md` | Calibration table. |

Tests: `python -m unittest discover -s tests -p 'test_attention_rewrite_benchmark.py'`.
