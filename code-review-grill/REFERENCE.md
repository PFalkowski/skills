# code-review-grill — reference

## Severity legend

| Emoji | Severity | Meaning |
|---|---|---|
| 🔥 | Blocker | Meets [the bar](#the-bar--what-may-be-posted-inline-or-fixed-in-this-pr) and is kind `data` or `rollback`, or kind `behaviour` reproduced by a snippet. Must be resolved before merge. Posted inline by this skill; fixed in this PR by whichever skill owns the fix (`fix-pr`, or a lifecycle phase). |
| ⚠️ | Major | Meets the bar otherwise: kind `behaviour` proven in-repo or by source, or kind `gate`. Posted inline by this skill; fixed in this PR by the fixing skill. |
| 📦 | Carried | Verified true, fails the bar. One class ticket per defect shape plus a count in the summary thread; no inline thread, no fix in this PR. |
| ⛏️ | Minor | Style or readability finding on a changed line. A count in the summary thread, never ticketed; inline only when the user names its ID, at most five per round. A *mechanical* one (typo, import, lint, formatting) is also fixed in this PR by the fixing skill. |
| ✅ | Reviewed-clean | Agent examined this area and found nothing. |
| ❓ | Uncertain | Needs author input or more info to judge. Listed in the summary thread as an open question. |

Use `–` in an agent's cell when that agent did not flag the row.

## The bar — what may be posted inline or fixed in this PR

The bar sits between "verified true" and "post it inline / fix it in this PR". It runs after verification, never instead of it, and it never changes what a reviewer reports. This skill posts and never edits code; "fixed in this PR" names what the bar permits the fixing skill to do. A verified finding is 🔥 or ⚠️ only if both prongs hold, tested in order:

1. **In the diff** (`scope: diff`). The finding's line is in `git diff <base>...HEAD`, or it is a caller or dependent in the Step-3 dependent set (code the change newly reaches or whose contract it changes). Otherwise it is `scope: sibling` (the same defect shape as a fix in the diff, at a site the PR did not touch) or, for anything else at all, `scope: pre-existing`.
2. **Merge-relevant kind.** `behaviour` (breaks behaviour), `data` (loses, corrupts or leaks data, including any security defect), `rollback` (reverting the commit would not undo it: a migration, a rewritten record, a changed wire format), `gate` (breaches a documented gate). `perf`, `observability`, `tests`, `docs`, `architecture` and `style` are not merge-relevant by default. A finding is `gate` only when a named file or the dispatching mandate states the rule and states that it gates review or merge: a file in the repo under review, the rules of the process that dispatched this review (`sdlc-old-fashioned`'s phase table, `nights-watch`'s Oath), or the `manager` mandate attached to the brief. Cite the `path:line`, or quote the mandate line, in the finding; otherwise the kind stands as the reviewer reported it.

No likelihood or value judgment re-scores a finding. A `behaviour` finding names in `expected` the contract the code breaks; a snippet shows what the code does, the contract is what says that is wrong, and a `behaviour` finding with no cited contract is ❓. A `data` finding needs none: its artifact shows the breach. A finding that fails prong 2 on a changed line is still ⛏️ in two cases: mechanical (typo, import, lint, formatting), fixed in this PR; any other `style` finding, counted in the summary thread, neither fixed nor carried. Neither case demotes a finding that passes prong 2.

Before a 🔥/⚠️ whose artifact is `in-repo` or `source` is offered, the lead re-runs the grep or opens the link itself. One that does not reproduce downgrades to ❓.

A bar-passing finding whose line is not in the PR diff (a dependent outside the changed hunks) cannot anchor an inline thread; it goes in the summary thread under **Off-diff blockers** with its real `path:line` and artifact, and is fixed in this PR like any other.

Everything else verified true is 📦 Carried: one class ticket per defect shape (reuse an existing ticket for the same shape), the count in one summary thread, no inline thread, no commit and no test in this PR. A *defect shape* is the class a defect belongs to (swallowed exit code, unbounded read, missing guard, unvalidated boundary; Step 3). A *class ticket* is one ticket for that shape listing every site as `path:line`, not one ticket per site. Dependents a fix would break are `scope: diff` by prong 1 and are always fixed; only sibling sites are carried. A Carried finding of kind `data` is drafted at blocker priority and named first in the report whatever the posting answer; it is filed on the same yes as the other tickets.

**The summary thread** is one PR-level comment per review round, in this order: `Reviewed at <head sha>`; the **size line** when the three-dot diff exceeds 400 changed lines or 20 files (the counts and the suggestion to split); inline threads posted this round (ID and kind each); Off-diff blockers; on a re-review, new ⚠️ findings with their artifacts, the fix scores, and the won't-fix rate; Carried findings grouped by shape with their ticket links; the Minor count; the ❓ open questions; the Not run list.

## Re-review

When the PR was grilled before, one fresh single reviewer scores each previous fix as fixed / partial / regressed and grills only the delta since the head the newest summary thread names. With no summary thread on the PR, re-review the whole three-dot diff and say so. The brief carries what survives of the previous round: every summary thread on the PR, and the findings table when this session still holds it.

The same bar decides what posts, and the round converges: only 🔥 is offered inline; a new ⚠️ goes to the summary thread; no ⛏️ posts. Before offering anything, read the threads already on the PR: a finding on the same path and defect shape as an open thread is a reply on that thread, not a new one, and one whose thread was resolved with a fix is dropped.

Score every earlier inline thread a summary thread recorded as *resolved* (a fix commit or a resolved thread) or *won't-fix* (declined in a reply, or unresolved with the line unchanged), by the kind its summary thread recorded. The won't-fix rate per kind is won't-fix threads over all inline threads of that kind across this PR's summary threads. A kind with five or more threads and a rate above 10% is named in the report with the proposal to add it to the repo's skip list (§ Brief templates); the reviewer never drops it on its own.

### The nit marker

A ⛏️ finding is not posted inline by default. The `nights-watch` Grill is the standing exception: by its own rules ([GRILL.md](../nights-watch/GRILL.md)) it posts every verified finding, ⛏️ and 📦 included, anchored as that file says, and takes only the `scope` and `kind` columns from the bar. When a ⛏️ is posted, its body opens with this line, verbatim, above the finding text:

```markdown
![Ackchyually](https://raw.githubusercontent.com/PFalkowski/skills/main/code-review-grill/assets/ackchyually.png)
```

It marks the comment as optional at a glance, so a reader scrolling a thread tells a nit from a bug without reading either. Only ⛏️ carries it: a marker on a 🔥 or ⚠️ finding undercuts the finding, and one on every comment marks nothing. The URL is absolute because the skill posts into repositories that do not contain the image.

## Concern menu

| Emoji | Concern | Scope |
|---|---|---|
| 🔒 | security | Injection, authz/authn, secrets, unsafe deserialization, SSRF, crypto misuse, dependency risk. |
| 🏛 | architecture | Boundaries, coupling, layering, abstraction fit, ripple/blast radius, backward compatibility, rollback safety (migrations, rewritten records, wire formats). |
| 🧹 | code-quality | Correctness bugs, error handling, naming, dead code, duplication, readability, idiom. |
| 📚 | documentation & conventions | **Conformance to the project's house rules** (Step 4): ADRs, coding guidelines, patterns/practices, and the documented architectural style (DDD vs n-tier vs hexagonal vs vertical-slice — layering and dependency direction). Plus doc/comment accuracy, public-API docs, README/changelog drift; **fact-checks claims against authoritative sources** (web). |
| ⚡ | performance | Hot paths, allocations, N+1 / unbounded queries, sync-over-async, complexity regressions. |
| 🔭 | observability | Can this be operated once it breaks? A new failure path that logs nothing, a job or worker with no success/failure signal, an exception swallowed into silence, instrumentation deleted with the code it measured, a health check that cannot fail, an alert routed nowhere. |
| 🧪 | tests | Coverage of the change, missing edge/negative cases, flakiness, assertion strength. |

**Auto-pick heuristic** (when the user picks quorum but names no concerns) — **always include 🧹 code-quality and 📚 documentation & conventions**; add the rest when the diff shows their trigger:
- 🔒 if it touches auth, SQL/query building, crypto, file/network I/O, deserialization, secrets, or dependencies.
- 🏛 if it changes public signatures, module boundaries, a migration, a stored data shape or a wire format, or has a wide Step-3 ripple set.
- ⚡ if it touches loops over data, queries, caching, concurrency, or known hot paths.
- 🔭 if it adds or changes a production code path — a failure mode, a background/scheduled job, an integration point, error handling — or removes instrumentation.
- 🧪 if it adds/changes behaviour but no tests, or weakens existing tests.

📚 may only be dropped when the orchestrator has confirmed the repo carries **no** README/ADRs/guidelines at all — note that absence in the output. Keep it lean otherwise — one worker per included concern, no more.

## Standard finding payload (every agent returns this)

```
- location:    path/to/file.ext:LINE   (the line in the diff, RIGHT side unless noted)
- scope:       diff | sibling | pre-existing   (bar prong 1)
- kind:        behaviour | data | rollback | gate | perf | observability | tests | docs | architecture | style   (bar prong 2)
- severity:    🔥 | ⚠️ | ⛏️ | ❓   (the reviewer's read; the lead sets the final severity by the bar)
- finding:     one-sentence statement of the problem
- expected:    the contract the code breaks, cited: a test, doc, caller or spec at path:line, or a
               deep link (behaviour findings; one with no cited contract is ❓)
- suggested:   the fix in one line (the guard to add, the call to make, the name to use); never a patch,
               the author writes the code
- verification:
    method:    snippet | in-repo | source      (fixed by the claim's type, not chosen)
    detail:    the actual proof, copy-paste-ready (see below) — NOT "I checked" with no artifact
```

**`verification` is mandatory on every finding** (per [fact-check](../fact-check/SKILL.md)). A finding without a verification artifact is not a finding. The claim's type fixes which row below grounds it — it is not a menu to pick from; when a claim fits more than one row, the **snippet** row wins, and the other rows cover only what no run could settle. A finding is a chain of claims: split it before choosing a row, and report the atoms grounded rather than withholding the whole finding for the one atom that could not be. The `detail` must let the user replicate in one step:

| method | when | what `detail` must contain |
|---|---|---|
| **snippet** | executable claim — what the code does at runtime (logic/off-by-one/regex/boundary/encoding/null/overflow/async/perf) | the minimal runnable snippet **or failing test** *verbatim*, the command to run it, and its **actual captured output** — user reproduces by copy-paste |
| **in-repo** | broken invariant / ripple / dependent that no run could settle | the exact `path:line` of the relying caller, the relevant lines quoted, and the `grep`/command that found them |
| **source** | doc / API / version / standards claim | a working **deep link** to the authoritative section (≥2 for consequential claims), with the relevant text quoted |

An executable claim is grounded only by running it and showing the real output, never by an in-repo citation or a source link in its place. When a snippet cannot be made to reproduce an executable claim, that claim is withheld from the findings and listed under **Not run** — naming why and the command that would settle it — never downgraded to ❓. A non-executable claim that fails to ground downgrades to ❓, unchanged.

**Not run** (listed separately, never as a row in the findings table): one line per withheld executable claim — the claim, why it could not be run, and the exact command that would settle it.

## Brief templates

Pass these to the `Agent` tool verbatim, filling the brackets. Always attach: the standard finding payload (§ above), the diff, the changed files at full context, the Step-3 ripple set, the `manager` mandate when one dispatched the review, the **Step-4 house rules** (the project's documented patterns/ADRs/architectural style) so every reviewer judges the diff against them, and the **skip list**: generated code, lockfiles, vendored and build-output directories, whatever CI already enforces (lint, format, spellcheck, the analyzers in Step 4's linter config), and the entries under a `Review skip` heading in the repo's `CLAUDE.md` or `REVIEW.md` when one exists (read in Step 4). Nothing on the skip list is reported; a tool or the team already decides it.

All briefs use the **grilling stance**: interrogate the diff one hunk at a time to a verified conclusion (what must be true for this to be correct? what input breaks it? what caller relied on the old behavior?); settle every doubt by running code or grepping the repo, never by speculating.

**Single adversarial reviewer**
```
Objective: Grill this diff hunk-by-hunk. Assume it is wrong until proven right; for each change ask
           what must be true for it to be correct, what input breaks it, and what caller/test relied
           on the old behavior. Find correctness bugs, security issues, broken invariants, omissions,
           AND deviations from the attached house rules (ADRs / coding guidelines / architectural style).
Output:    The standard finding payload, one block per finding, with scope, kind and (for a behaviour
           finding) the expected contract filled, INCLUDING a verification artifact for each. The
           claim's type fixes the method — snippet+output, in-repo path:line proof, or
           authoritative deep link — it is not a choice among them; split a mixed finding into atoms
           and ground each by its own type rather than withholding the whole thing. An executable
           claim — what the code does at runtime — is grounded only by running it and showing the real
           output, never by an in-repo citation or a source link in its place; if it was not run it is
           withheld from the findings rather than downgraded to ❓, and is listed under Not run with the
           reason and the command that would settle it. A genuinely ungroundable non-executable finding
           still downgrades to ❓ unverified. End with a verdict, and a Not run list if anything was
           withheld.
Tools:     Read/Grep the attached files and their dependents. Run snippets/tests to verify executable
           claims. (Add WebSearch/WebFetch if claims need checking.)
Boundaries: Judge this diff and what it touches; do not propose unrelated refactors; no unverified
           findings; nothing from the attached skip list. A defect you find outside the diff is still
           reported, with scope set to sibling or pre-existing. The lead applies the bar, you do not.
```

**Per-concern worker (quorum)** — one per included concern:
```
Objective: Grill this diff for <CONCERN> only (see scope: <one-line scope from the menu>), hunk-by-hunk:
           for each relevant change ask what must be true for it to be correct and what breaks it.
Output:    The standard finding payload for <CONCERN> findings only, with scope, kind and (for a
           behaviour finding) the expected contract filled; '✅ nothing found' if clean.
           Every finding MUST carry a verification artifact whose method the claim's type fixes —
           snippet+actual output, in-repo path:line proof, or authoritative deep link — never a choice
           among them; split a mixed finding into atoms and ground each by its own type rather than
           withholding the whole thing. An executable claim — what the code does at runtime — is
           grounded only by running it and showing the real output, never by an in-repo citation or a
           source link in its place; if it was not run it is withheld from the findings rather than
           downgraded to ❓, and is listed under Not run with the reason and the command that would
           settle it. A genuinely ungroundable non-executable finding still downgrades to ❓ unverified.
Tools:     Read/Grep the attached files + dependents. Run snippets/tests to confirm executable claims.
           [documentation worker ONLY] You own the house rules: check the diff for conformance to the
           project's ADRs, coding guidelines, patterns/practices, and architectural style (DDD vs n-tier
           vs hexagonal — layering & dependency direction); cite the exact doc/ADR a violation breaks.
           + WebSearch + WebFetch — verify every doc/API/version/standards claim against ≥2 authoritative
           sources; attach deep links. Apply the fact-check skill.
Boundaries: Stay in your concern. Do not duplicate other concerns; flag cross-cutting issues briefly
            and let the lead dedupe. Judge this diff and its ripple set, nothing from the attached
            skip list; a defect you find outside them is still reported, with scope set to sibling
            or pre-existing. The lead applies the bar, you do not.
```

## Table templates

The `Scope` column carries `diff` / `sibling` / `pre-existing` and, after it, the kind; the `Severity` (single) or `Consensus` (quorum) column is the lead's result of applying the bar. The `Verified` column names the method (snippet / in-repo / source); the copy-paste-ready artifact itself goes **below the table**, one block per finding ID, so the user can replicate each one directly.

**Single-agent:**
```
| ID | Location         | Scope            | Finding                              | Severity | Suggested fix                 | Verified |
|----|------------------|------------------|--------------------------------------|----------|-------------------------------|----------|
| F1 | `src/Repo.cs:42` | diff · data      | SQL built by string-concat of userId | 🔥       | Parameterise (`SqlParameter`) | snippet  |
| F2 | `src/Repo.cs:88` | diff · perf      | N+1 query in loop                    | 📦       | Ticket: batch-load orders     | snippet  |
| F3 | `src/Audit.cs:17` | sibling · data  | Same string-concat shape as F1       | 📦       | Ticket: same shape as F1      | snippet  |
```

**Quorum** — include a column only for the concerns you actually spawned; `Votes` = agents-flagging / agents-total; `Consensus` = lead's final severity after the bar:
```
| ID | Location         | Scope        | Finding                   | 🔒Sec | 🏛Arch | 🧹Qual | 📚Docs | ⚡Perf | 🧪Test | Votes | Consensus | Verified |
|----|------------------|--------------|---------------------------|-------|--------|--------|--------|--------|--------|-------|-----------|----------|
| F1 | `src/Repo.cs:42` | diff · data  | SQL string-concat userId  | 🔥    | –      | ⚠️     | –      | –      | –      | 2/6   | 🔥        | snippet  |
| F2 | `src/Repo.cs:88` | diff · perf  | N+1 query in loop         | –     | –      | –      | –      | ⚠️     | –      | 1/6   | 📦        | snippet  |
```

**Verification artifacts** (below the table):
```
F1 — method: snippet
$ python3 -c "uid=\"1 OR 1=1\"; print(f\"SELECT * FROM u WHERE id={uid}\")"
SELECT * FROM u WHERE id=1 OR 1=1     # untrusted uid lands in the query verbatim
F2 — method: in-repo
src/Repo.cs:88 calls LoadOrder(id) inside the `foreach (var id in ids)` loop at :85 → one query per id.
```

**Not run** (below the table, not a row in it):
```
Not run — the retry loop backs off exponentially under load
Why: no load-test harness in this repo; reproducing needs a running service.
Command: k6 run loadtest/retry-backoff.js against a staging deploy.
```

## Posting mechanics (Step 7 — never auto-post; post only user-selected findings)

### Comment body

An inline comment holds four parts and nothing else, in this order, under twelve lines:

````markdown
🔥 **F1** `userId` reaches the SQL string unescaped, so any caller can read every row.

Reproduce:
```sh
$ python3 -c 'uid="1 OR 1=1"; print(f"SELECT * FROM u WHERE id={uid}")'
SELECT * FROM u WHERE id=1 OR 1=1
```
Fix: pass `userId` as a `SqlParameter`.
````

Line one is the severity, the ID and the finding with its consequence in one sentence. `Reproduce` is the verification artifact verbatim: the command and its output, the `path:line` and the quoted lines, or the deep link and the quoted text; for a `behaviour` finding, the `expected` contract follows it on one line. `Fix` is one line for the author to act on, never a patch for the reviewer to vet. No preamble, no restatement of the code, no praise.

### GitHub
Resolve repo + PR head, then post each selected 🔥/⚠️ finding as an inline review comment. Post **one first** and confirm the response has a numeric `id` before sending the rest.
```bash
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
HEAD_SHA=$(gh pr view <PR> --json headRefOid -q .headRefOid)

gh api "repos/$OWNER_REPO/pulls/<PR>/comments" \
  -f body="$(cat f1.md)" \
  -f commit_id="$HEAD_SHA" \
  -f path="src/Repo.cs" \
  -F line=42 \
  -f side=RIGHT

# a ⛏️ nit opens with the marker (see § The nit marker)
gh api "repos/$OWNER_REPO/pulls/<PR>/comments" \
  -f body="![Ackchyually](https://raw.githubusercontent.com/PFalkowski/skills/main/code-review-grill/assets/ackchyually.png)

⛏️ **F7** \`ParseHeader\` reads as a query, not a command. Rename to \`TryReadHeader\`." \
  -f commit_id="$HEAD_SHA" \
  -f path="src/Repo.cs" \
  -F line=42 \
  -f side=RIGHT
```
- `-F line=N` sends a number; `-f` sends strings. For a multi-line range add `-F start_line=N -f start_side=RIGHT`.
- `line` is the line **in the file at `commit_id`**; it must fall on a line in the PR diff or GitHub rejects it.
- To batch instead of one-at-a-time, `POST repos/$OWNER_REPO/pulls/<PR>/reviews` with a `comments` array of `{path,line,side,body}` and `event=COMMENT` — but the one-at-a-time form above is what lets you confirm the first thread landed.

The summary thread and the Carried tickets, when the user approves them:
```bash
gh issue create --title "<defect shape>" --body "<sites as path:line, the verification artifact, found reviewing PR #N>"
gh pr comment <PR> --body "<the summary thread, § The bar>"
```
File the tickets first so the summary thread can link them. A Carried `data` finding gets the repo's blocker label or priority. When the user declines the tickets it stays a drafted ticket, named first in the report.

### Azure DevOps
Delegate to **[AZURE-DEVOPS.md](AZURE-DEVOPS.md)** — it encodes the `pullRequestThreads` JSON schema, left/right anchoring, and the Windows console-encoding workarounds. Build the finding bodies here; let that skill post the threads. The summary thread is a PR thread with no file anchor; Carried tickets are work items (`az boards work-item create`).

**Always**: never auto-post. Present the table, ask which findings to post and whether to post the summary thread and file the Carried tickets, then do only that.
