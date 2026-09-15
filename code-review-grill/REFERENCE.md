# code-review-grill — reference

## Severity legend

| Emoji | Severity | Meaning |
|---|---|---|
| 🔥 | Blocker | Meets [the bar](#the-bar--what-may-be-posted-inline-or-fixed-in-this-pr) and has no workaround; must fix before merge. Posted inline. |
| ⚠️ | Major | Meets the bar with a workaround or narrower reach; fix in this PR. Posted inline. |
| 📦 | Carried | Verified true, fails the bar. One class ticket per defect shape plus a count in the summary thread; no inline thread, no fix in this PR. |
| ⛏️ | Minor | Mechanical or style finding on a changed line (typo, import, lint, formatting, naming). Meets the bar; a count in the summary thread only, never an inline thread. |
| ✅ | Reviewed-clean | Agent examined this area and found nothing. |
| ❓ | Uncertain | Needs author input or more info to judge. Listed in the summary thread as an open question. |

Use `–` in an agent's cell when that agent did not flag the row.

## The bar — what may be posted inline or fixed in this PR

The bar sits between "verified true" and "post it inline / fix it in this PR". It runs after verification, never instead of it, and it never changes what a reviewer reports. A verified finding is 🔥 or ⚠️ only if both prongs hold:

1. **In the diff** (`scope: diff`). It sits on a line the PR changed, or on code the change newly reaches or whose contract it changes. Everything else is `scope: sibling` (the same defect shape at a site the PR did not touch) or `scope: pre-existing` (a defect on untouched code the change does not reach).
2. **Merge-relevant kind.** `behaviour` (breaks behaviour), `data` (loses, corrupts or leaks data, including any security defect), `rollback` (blocks a rollback), `gate` (breaches a rule the repo documents as a gate). `perf`, `observability`, `tests`, `docs`, `architecture` and `style` are not merge-relevant by default; a repo that documents one of them as a gate makes that finding `gate`.

Both prongs are mechanical: no likelihood or value judgment re-scores a finding.

Everything else verified true is 📦 Carried: one class ticket per defect shape (reuse an existing ticket for the same shape), the count in one summary thread, no inline thread, no commit and no test in this PR. Dependents a fix would break are `scope: diff` by prong 1 and are always fixed; only sibling sites are carried. A Carried finding of kind `data` is filed at blocker priority and named to the human in the report: the bar decides where it is fixed, not whether.

**The summary thread** is one PR-level comment per review round: inline threads posted this round (count and IDs), Carried findings grouped by shape with their ticket links, the Minor count, the ❓ open questions, and the Not run list.

**Re-review.** When the PR was grilled before, one fresh single reviewer scores each previous fix as fixed / partial / regressed and grills only the delta since the last reviewed head. The same bar decides what posts.

### The nit marker

A ⛏️ finding is not posted inline by default. When the user names its ID anyway, its body opens with this line, verbatim, above the finding text:

```markdown
![Ackchyually](https://raw.githubusercontent.com/PFalkowski/skills/main/code-review-grill/assets/ackchyually.png)
```

It marks the comment as optional at a glance, so a reader scrolling a thread tells a nit from a bug without reading either. Only ⛏️ carries it: a marker on a 🔥 or ⚠️ finding undercuts the finding, and one on every comment marks nothing. The URL is absolute because the skill posts into repositories that do not contain the image.

## Concern menu

| Emoji | Concern | Scope |
|---|---|---|
| 🔒 | security | Injection, authz/authn, secrets, unsafe deserialization, SSRF, crypto misuse, dependency risk. |
| 🏛 | architecture | Boundaries, coupling, layering, abstraction fit, ripple/blast radius, backward compatibility. |
| 🧹 | code-quality | Correctness bugs, error handling, naming, dead code, duplication, readability, idiom. |
| 📚 | documentation & conventions | **Conformance to the project's house rules** (Step 4): ADRs, coding guidelines, patterns/practices, and the documented architectural style (DDD vs n-tier vs hexagonal vs vertical-slice — layering and dependency direction). Plus doc/comment accuracy, public-API docs, README/changelog drift; **fact-checks claims against authoritative sources** (web). |
| ⚡ | performance | Hot paths, allocations, N+1 / unbounded queries, sync-over-async, complexity regressions. |
| 🔭 | observability | Can this be operated once it breaks? A new failure path that logs nothing, a job or worker with no success/failure signal, an exception swallowed into silence, instrumentation deleted with the code it measured, a health check that cannot fail, an alert routed nowhere. |
| 🧪 | tests | Coverage of the change, missing edge/negative cases, flakiness, assertion strength. |

**Auto-pick heuristic** (when the user picks quorum but names no concerns) — **always include 🧹 code-quality and 📚 documentation & conventions**; add the rest when the diff shows their trigger:
- 🔒 if it touches auth, SQL/query building, crypto, file/network I/O, deserialization, secrets, or dependencies.
- 🏛 if it changes public signatures, module boundaries, or has a wide Step-3 ripple set.
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
- suggested:   concrete fix (code or precise instruction)
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

Pass these to the `Agent` tool verbatim, filling the brackets. Always attach: the diff, the changed files at full context, the Step-3 ripple set, and the **Step-4 house rules** (the project's documented patterns/ADRs/architectural style) so every reviewer judges the diff against them.

All briefs use the **grilling stance**: interrogate the diff one hunk at a time to a verified conclusion (what must be true for this to be correct? what input breaks it? what caller relied on the old behavior?); settle every doubt by running code or grepping the repo, never by speculating.

**Single adversarial reviewer**
```
Objective: Grill this diff hunk-by-hunk. Assume it is wrong until proven right; for each change ask
           what must be true for it to be correct, what input breaks it, and what caller/test relied
           on the old behavior. Find correctness bugs, security issues, broken invariants, omissions,
           AND deviations from the attached house rules (ADRs / coding guidelines / architectural style).
Output:    The standard finding payload, one block per finding, INCLUDING a verification artifact for
           each. The claim's type fixes the method — snippet+output, in-repo path:line proof, or
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
Boundaries: Review only this diff and what it touches. Do not propose unrelated refactors. No unverified findings.
           Report sibling and pre-existing sites with their scope set rather than withholding them;
           the lead applies the bar, you do not.
```

**Per-concern worker (quorum)** — one per included concern:
```
Objective: Grill this diff for <CONCERN> only (see scope: <one-line scope from the menu>), hunk-by-hunk:
           for each relevant change ask what must be true for it to be correct and what breaks it.
Output:    The standard finding payload for <CONCERN> findings only; '✅ nothing found' if clean.
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
            and let the lead dedupe. Review only this diff and its ripple set. Report sibling and
            pre-existing sites with their scope set rather than withholding them; the lead applies
            the bar, you do not.
```

## Table templates

The `Scope` column carries `diff` / `sibling` / `pre-existing` and, after it, the kind; the `Severity` (single) or `Consensus` (quorum) column is the lead's result of applying the bar. The `Verified` column names the method (snippet / in-repo / source); the copy-paste-ready artifact itself goes **below the table**, one block per finding ID, so the user can replicate each one directly.

**Single-agent:**
```
| ID | Location         | Scope            | Finding                              | Severity | Suggested fix                 | Verified |
|----|------------------|------------------|--------------------------------------|----------|-------------------------------|----------|
| F1 | `src/Repo.cs:42` | diff · data      | SQL built by string-concat of userId | 🔥       | Parameterise (`SqlParameter`) | snippet  |
| F2 | `src/Repo.cs:88` | diff · perf      | N+1 query in loop                    | 📦       | Ticket: batch-load orders     | snippet  |
| F3 | `src/Audit.cs:17`| sibling · data   | Same string-concat shape as F1       | 📦       | Ticket: same shape as F1      | snippet  |
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

### GitHub
Resolve repo + PR head, then post each selected 🔥/⚠️ finding as an inline review comment. Post **one first** and confirm the response has a numeric `id` before sending the rest.
```bash
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
HEAD_SHA=$(gh pr view <PR> --json headRefOid -q .headRefOid)

gh api "repos/$OWNER_REPO/pulls/<PR>/comments" \
  -f body="🔥 **F1** SQL built by string-concat of \`userId\`. Parameterise via \`SqlParameter\`." \
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
gh issue create --title "<defect shape>" --body "<sites as path:line, the verification artifact, found reviewing PR #<PR>>"
gh pr comment <PR> --body "<the summary thread, § The bar>"
```
File the tickets first so the summary thread can link them. A Carried `data` finding gets the repo's blocker label or priority.

### Azure DevOps
Delegate to **[AZURE-DEVOPS.md](AZURE-DEVOPS.md)** — it encodes the `pullRequestThreads` JSON schema, left/right anchoring, and the Windows console-encoding workarounds. Build the finding bodies here; let that skill post the threads. The summary thread is a PR thread with no file anchor; Carried tickets are work items (`az boards work-item create`).

**Always**: never auto-post. Present the table, ask which findings to post and whether to post the summary thread and file the Carried tickets, then do only that.
