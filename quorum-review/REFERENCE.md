# quorum-review — reference

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
- evidence:    deep-link URL (docs/spec) OR runnable snippet + its actual output OR path:line of the dependent it breaks
```

The documentation agent's `evidence` must be a working deep link to the authoritative source (≥2 for consequential claims) — never "I believe" with no link (see [fact-check](../fact-check/SKILL.md)).

## Brief templates

Pass these to the `Agent` tool verbatim, filling the brackets. Always attach: the diff, the changed files at full context, and the Step-3 ripple set.

**Single adversarial reviewer**
```
Objective: Adversarially review this diff. Assume it is wrong until proven right; find correctness
           bugs, security issues, broken invariants, and omissions.
Output:    The standard finding payload, one block per finding. End with a one-line verdict.
Tools:     Read/Grep the attached files and their dependents. (Add WebSearch/WebFetch if claims need checking.)
Boundaries: Review only this diff and what it touches. Do not propose unrelated refactors.
```

**Per-concern worker (quorum)** — one per included concern:
```
Objective: Review this diff for <CONCERN> only (see scope: <one-line scope from the menu>).
Output:    The standard finding payload for <CONCERN> findings only; '✅ nothing found' if clean.
Tools:     Read/Grep the attached files + dependents.
           [documentation worker ONLY] + WebSearch + WebFetch — verify every doc/API/version/standards
           claim against ≥2 authoritative sources; attach deep links. Apply the fact-check skill.
Boundaries: Stay in your concern. Do not duplicate other concerns; flag cross-cutting issues briefly
            and let the lead dedupe. Review only this diff and its ripple set.
```

## Table templates

**Single-agent:**
```
| ID | Location         | Finding                              | Severity | Suggested fix                 |
|----|------------------|--------------------------------------|----------|-------------------------------|
| F1 | `src/Repo.cs:42` | SQL built by string-concat of userId | 🔥       | Parameterise (`SqlParameter`) |
```

**Quorum** — include a column only for the concerns you actually spawned; `Votes` = agents-flagging / agents-total; `Consensus` = lead's final severity:
```
| ID | Location         | Finding                   | 🔒Sec | 🏛Arch | 🧹Qual | 📚Docs | ⚡Perf | 🧪Test | Votes | Consensus |
|----|------------------|---------------------------|-------|--------|--------|--------|--------|--------|-------|-----------|
| F1 | `src/Repo.cs:42` | SQL string-concat userId  | 🔥    | –      | ⚠️     | –      | –      | –      | 2/6   | 🔥        |
| F2 | `src/Repo.cs:88` | N+1 query in loop         | –     | –      | –      | –      | ⚠️     | –      | 1/6   | ⚠️        |
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
