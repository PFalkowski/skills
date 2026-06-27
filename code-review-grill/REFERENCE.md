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
| 📚 | documentation | Doc/comment accuracy, public-API docs, README/changelog drift; **fact-checks claims against authoritative sources** (web). |
| ⚡ | performance | Hot paths, allocations, N+1 / unbounded queries, sync-over-async, complexity regressions. |
| 🧪 | tests | Coverage of the change, missing edge/negative cases, flakiness, assertion strength. |

**Auto-pick heuristic** (when the user picks quorum but names no concerns) — always include 🧹 code-quality; add a concern when the diff shows its trigger:
- 🔒 if it touches auth, SQL/query building, crypto, file/network I/O, deserialization, secrets, or dependencies.
- 🏛 if it changes public signatures, module boundaries, or has a wide Step-3 ripple set.
- 📚 if it changes public APIs, docs/README, or asserts factual/version/standards claims.
- ⚡ if it touches loops over data, queries, caching, concurrency, or known hot paths.
- 🧪 if it adds/changes behaviour but no tests, or weakens existing tests.

Keep it lean — one worker per included concern, no more (per [orchestrate](../orchestrate/SKILL.md) effort budgets).

## Standard finding payload (every agent returns this)

```
- location:    path/to/file.ext:LINE   (the line in the diff, RIGHT side unless noted)
- severity:    🔥 | ⚠️ | 💡 | ❓
- finding:     one-sentence statement of the problem
- suggested:   concrete fix (code or precise instruction)
- verification:
    method:    snippet | in-repo | source      (which grounding method was used)
    detail:    the actual proof, copy-paste-ready (see below) — NOT "I checked" with no artifact
```

**`verification` is mandatory on every finding** (per [fact-check](../fact-check/SKILL.md)). A finding without a verification artifact is not a finding — either ground it or downgrade it to ❓ and mark it unverified. The `detail` must let the user replicate in one step:

| method | when | what `detail` must contain |
|---|---|---|
| **snippet** | executable claim (logic/off-by-one/regex/boundary/encoding/null/overflow/async/perf) | the minimal runnable snippet **or failing test** *verbatim*, the command to run it, and its **actual captured output** — user reproduces by copy-paste |
| **in-repo** | broken invariant / ripple / dependent | the exact `path:line` of the relying caller, the relevant lines quoted, and the `grep`/command that found them |
| **source** | doc / API / version / standards claim | a working **deep link** to the authoritative section (≥2 for consequential claims), with the relevant text quoted |

The documentation agent's `source` `detail` must be a working deep link (≥2 for consequential claims) — never "I believe" with no link. When a snippet cannot be made to reproduce the issue, that is itself a result: drop or downgrade the finding.

## Brief templates

Pass these to the `Agent` tool verbatim, filling the brackets. Always attach: the diff, the changed files at full context, and the Step-3 ripple set.

All briefs use the **grilling stance**: interrogate the diff one hunk at a time to a verified conclusion (what must be true for this to be correct? what input breaks it? what caller relied on the old behavior?); settle every doubt by running code or grepping the repo, never by speculating.

**Single adversarial reviewer**
```
Objective: Grill this diff hunk-by-hunk. Assume it is wrong until proven right; for each change ask
           what must be true for it to be correct, what input breaks it, and what caller/test relied
           on the old behavior. Find correctness bugs, security issues, broken invariants, omissions.
Output:    The standard finding payload, one block per finding, INCLUDING a verification artifact for
           each (runnable snippet+output, in-repo path:line proof, or authoritative deep link). State
           the method used. Downgrade any finding you cannot ground to ❓ unverified. End with a verdict.
Tools:     Read/Grep the attached files and their dependents. Run snippets/tests to verify executable
           claims. (Add WebSearch/WebFetch if claims need checking.)
Boundaries: Review only this diff and what it touches. Do not propose unrelated refactors. No unverified findings.
```

**Per-concern worker (quorum)** — one per included concern:
```
Objective: Grill this diff for <CONCERN> only (see scope: <one-line scope from the menu>), hunk-by-hunk:
           for each relevant change ask what must be true for it to be correct and what breaks it.
Output:    The standard finding payload for <CONCERN> findings only; '✅ nothing found' if clean.
           Every finding MUST carry a verification artifact (runnable snippet+actual output, in-repo
           path:line proof, or authoritative deep link) and name the method. No unverified findings —
           downgrade what you cannot ground to ❓ unverified.
Tools:     Read/Grep the attached files + dependents. Run snippets/tests to confirm executable claims.
           [documentation worker ONLY] + WebSearch + WebFetch — verify every doc/API/version/standards
           claim against ≥2 authoritative sources; attach deep links. Apply the fact-check skill.
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

## Posting mechanics (Step 6 — never auto-post; post only user-selected findings)

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
