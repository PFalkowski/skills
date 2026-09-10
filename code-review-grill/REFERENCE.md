# code-review-grill — reference

## Severity legend

| Emoji | Severity | Meaning |
|---|---|---|
| 🔥 | Blocker / critical | Correctness, security, or data-loss bug; must fix before merge. |
| ⚠️ | Major | Real problem with material impact; should fix. |
| 💡 | Minor / nit | Style, readability, small improvement; optional. |
| ✅ | Reviewed-clean | Agent examined this area and found nothing. |
| ❓ | Uncertain | Needs author input or more info to judge. |

Use `–` in an agent's cell when that agent did not flag the row.

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
- severity:    🔥 | ⚠️ | 💡 | ❓
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
            and let the lead dedupe. Review only this diff and its ripple set.
```

## Table templates

The `Verified` column names the method (snippet / in-repo / source); the copy-paste-ready artifact itself goes **below the table**, one block per finding ID, so the user can replicate each one directly.

**Single-agent:**
```
| ID | Location         | Finding                              | Severity | Suggested fix                 | Verified |
|----|------------------|--------------------------------------|----------|-------------------------------|----------|
| F1 | `src/Repo.cs:42` | SQL built by string-concat of userId | 🔥       | Parameterise (`SqlParameter`) | snippet  |
```

**Quorum** — include a column only for the concerns you actually spawned; `Votes` = agents-flagging / agents-total; `Consensus` = lead's final severity:
```
| ID | Location         | Finding                   | 🔒Sec | 🏛Arch | 🧹Qual | 📚Docs | ⚡Perf | 🧪Test | Votes | Consensus | Verified |
|----|------------------|---------------------------|-------|--------|--------|--------|--------|--------|-------|-----------|----------|
| F1 | `src/Repo.cs:42` | SQL string-concat userId  | 🔥    | –      | ⚠️     | –      | –      | –      | 2/6   | 🔥        | snippet  |
| F2 | `src/Repo.cs:88` | N+1 query in loop         | –     | –      | –      | –      | ⚠️     | –      | 1/6   | ⚠️        | snippet  |
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
Resolve repo + PR head, then post each selected finding as an inline review comment. Post **one first** and confirm the response has a numeric `id` before sending the rest.
```bash
OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
HEAD_SHA=$(gh pr view <PR> --json headRefOid -q .headRefOid)

gh api "repos/$OWNER_REPO/pulls/<PR>/comments" \
  -f body="🔥 **F1** SQL built by string-concat of \`userId\`. Parameterise via \`SqlParameter\`." \
  -f commit_id="$HEAD_SHA" \
  -f path="src/Repo.cs" \
  -F line=42 \
  -f side=RIGHT
```
- `-F line=N` sends a number; `-f` sends strings. For a multi-line range add `-F start_line=N -f start_side=RIGHT`.
- `line` is the line **in the file at `commit_id`**; it must fall on a line in the PR diff or GitHub rejects it.
- To batch instead of one-at-a-time, `POST repos/$OWNER_REPO/pulls/<PR>/reviews` with a `comments` array of `{path,line,side,body}` and `event=COMMENT` — but the one-at-a-time form above is what lets you confirm the first thread landed.

### Azure DevOps
Delegate to **[azure-devops-pr-review](../azure-devops-pr-review/SKILL.md)** — it encodes the `pullRequestThreads` JSON schema, left/right anchoring, and the Windows console-encoding workarounds. Build the finding bodies here; let that skill post the threads.

**Always**: never auto-post. Present the table, ask which findings to post, post only those.
