# Tier 2: blind side-by-side review

A judged score for a candidate, always measured against anchor X, and optionally also against
anchor Y. Six reviewers each look at one dimension. One judge then reads the six reports and
sets the final scores. All steps run one at a time (this matters on a machine that serves one
model request at a time, and it keeps reviewers from seeing each other's work).

Judged scores are not deterministic. Calibrate first (see "Check your judges"), and treat a
one-point gap as noise.

## Setup

1. Score every subject mechanically first (`score.py`). The scorecards are the shared
   evidence. Export each subject with `git archive` into a folder named by its label, and
   score that folder, so no scorecard shows a real name, path or ref:

   ```powershell
   python benchmarks/attention-rewrite/blind.py --candidate my-config --with-y --seed 7 --out D:/bench/review/mapping.json
   ```

   The command prints the labels (`A`, `B`, and `C` with Y) and the order in which each
   dimension lists them. It writes the label mapping to `mapping.json`. Do not show that file to
   a reviewer or the judge until the verdict is written.

2. Make four folders under one review root: `ref` (the start tag's tree, the behaviour
   baseline and the project docs), and one folder per label with that subject's tree. Use
   exports, not clones: there must be no git history, branch or tag to read.

3. Score each label folder: `score.py --private <private> --candidate <review>/A --out <review>/score-A --label A`.
   Put the three or four `scorecard.md` files and their logs where the reviewers can read them.

## Reviewer brief (shared by all six)

You are a fresh reviewer. You wrote none of the subjects. Each is a first submission of the
same task: a C# modular-monolith backend that replaces a small Python backend behind an
unchanged web board. They are labelled only with letters. Judge them as submitted, side by
side, on ONE dimension (named at the end).

Where things are:

- `ref/`: the Python reference at the start snapshot, plus the project docs (the manifesto,
  the design notes, the architecture decision records, the handoff and the agent rules).
- `A/`, `B/` (and `C/`): the subjects. To see what a subject changed, compare it with `ref/`
  using a plain diff of the two folders.
- `score-A/scorecard.md` and the other scorecards: shared mechanical evidence (tests, HTTP
  parity with the reference, database compatibility, lifecycle). Read it first. The
  task's acceptance criteria are in `ref/` docs and the task text the coordinator gives you.

Hard rules:

- Blind review. Do not look for the origin of a subject. Do not read git history, refs or
  commit messages (there are none in the exports), do not search the web for the project, and
  do not guess the author from style. If you think you know which subject is which, say
  nothing about it.
- Never open any `.data/inbox.db`. Every server you start gets `--database <temporary path>`,
  listens on 127.0.0.1, port 0. Stop only processes you started. Leave none running.
- Do not edit the review folders. For a mutation or "does this test fail?" experiment, copy a
  subject to your scratch folder and change the copy.
- Do not start another agent or session. Post nothing anywhere.

Evidence standard. Every finding needs one of:

1. a command you ran and its real output (quote the relevant lines);
2. a `path:line` citation into a subject folder;
3. two authoritative sources (for example vendor documentation).

The scorecards count as (1); cite them by section. Anything you believe but did not verify goes
in a "Not run" list, not in the findings.

Scoring. Give each subject 0 to 5 on your dimension. 5 means nothing material to fix. 3
means usable with clear fixes. 1 means fundamentally wrong for this dimension. 0 means
absent. Name the findings that decided each score and give each a severity: blocker, major,
minor or nit.

Report, in the label order given for your dimension:

1. A scores table (label, score, one-line reason).
2. Findings per label, each with severity, claim and evidence.
3. Side by side: what each does better, and anything one should take from the other (with
   `path:line`).
4. Not run.

Write in plain English and short sentences. Reply with only the scores, the top three
deciding findings per label and the report path, in under 250 words.

## The six dimensions

Each reviewer gets the shared brief plus one block below. The order of labels alternates by
dimension (the helper prints it) so that no label is always read first.

1. **Correctness and parity.** Does the subject behave like the Python reference for every
   action and state change the board can trigger? Use the parity table, the stale-guard repro,
   the database-compatibility table and the lifecycle table, then probe beyond them: re-run or
   extend the harness (`harness/parity.py`). Weigh differences by whether the board can hit
   them. A defect that breaks later writes, loses data or cannot be stopped is a blocker.
   Transport-level differences the board never sends are minor.

2. **ADR-0007 boundaries and architecture test.** The project's architecture decision 0007
   (in `ref/docs/adr/`) fixes the module boundaries: one repository, one project per module,
   only public contracts shared between modules, tables owned by their module, reuse by
   copying in with a source note. Check how well the subject follows it, and whether an
   architecture test fails the build on a wrong-direction or internal-type dependency. Test
   that claim by mutation: in a copy, add a wrong-direction project reference, an
   `InternalsVisibleTo`, or make an internal type public, and see whether any test fails. Also
   check that domain logic sits in the module that owns it, not in the host.

3. **Security.** The service is local-only. Check that it binds to loopback only (confirm with
   a socket listing), checks Host and Origin before it reads a body, limits body size and
   time, answers bad input without leaking internals, and sets the same security headers as the
   reference. Try slow and stalled connections: does one stalled client delay others? Check
   dependency advisories with `dotnet list package --vulnerable --include-transitive`. Weigh
   findings by exposure: a loopback-only service has a smaller attack surface than a public one.

4. **Tests.** Do the tests catch real faults? Run them, then mutate: in a copy, introduce
   several realistic faults (skip a rollback, break shutdown, change a status code, drop a
   guard) and count how many the suite catches. Check that the tests use public contracts,
   do not depend on a stale build output, clean up after themselves, and do not flake over
   repeated runs. Report mutants caught and missed as numbers.

5. **Simplicity and maintainability.** Following the project's own order (works, then secure,
   then simple and the least context to load), judge the shortest path from a request to the
   stored data, the length and shape of the longest methods, the split of rules between
   modules, central versus repeated build settings, and test volume as a cost. Prefer what a
   new reader can follow fastest. Count lines and public types to support the claims.

6. **Docs and running the app.** Can a new developer build, test and start the app, from the
   repository root and from a few other working folders, and from an IDE launch profile? Do
   the README, the handoff, the agent rules, the roadmap and the decision records name the new
   commands and no longer name the removed Python ones? Does CI run the same commands? Run the
   documented steps. Search the docs for stale mentions of the old backend.

## Judge brief

You are the judge. You did not write any subject and you did not review any. Read the six
reports and the scorecards only. Do not open the subjects unless a report's claim cannot be
checked any other way, and then say so.

For each dimension, say whether you confirm each reviewer score or move it, and why. Move a
score only for a stated reason (for example a claim without evidence, a finding that is
really a nit, or a difference the board cannot hit). A reviewer who ran something outranks one
who inferred it. Weigh the dimensions in the project's own order: software that works and is
worth having, then security by design, then simplicity and the least context to load.

Output:

1. A score table: dimension, reviewer score and judge score per label.
2. A short verdict per dimension.
3. An overall verdict that names the best subject, and for the candidate says whether it is
   better than, equal to or worse than anchor X.
4. Residual risks: what nobody ran, and whether it could change the verdict.

The final judged scores are the judge's scores. Only now open `mapping.json` and attach the
real names.

## Check your judges

Before trusting a setup, run it once on the two anchors with anchor X and anchor Y as the two
subjects. The known judged scores are in `RESULTS.md`. Expect:

- Y has a blocker on dimension 1 (a stale click leaves a transaction open, so every later
  write fails, and the server does not stop on interrupt) and scores 1 there.
- X scores at least as high as Y on every dimension and 4 on most.
- Every judged score within one point of the table. A larger gap means the briefs or the
  judge differ from the calibration setup; fix that before scoring candidates.

Record the reviewer and judge models and effort next to the results. Run each reviewer and the
judge at a tier at least as strong as the models being compared.
