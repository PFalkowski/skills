# NightShift — Pre-flight checklist

The goal of pre-flight is **zero overnight stops**. Walk every category below with the user before saying you're ready. Treat anything you skim past as a guaranteed 3 a.m. blocker.

## 1. Backlog hygiene

For each item in the backlog file:
- [ ] Has a status header: `## [pending] Title`.
- [ ] Has an `**Acceptance:**` line phrased as an observable outcome (a test will assert this).
- [ ] Implementation hints / constraints in `**Notes:**` if non-obvious.
- [ ] No interdependencies on items lower in the list (or they're explicitly called out).

If any item lacks acceptance criteria, ask: "What's the observable outcome that means item *X* is done?" Don't proceed until answered.

### Multi-cycle naming on the same date

If the project organises run records by date and a backlog file already exists for today's date directory, do NOT overwrite — increment a numeric suffix (`nightshift-backlog-2.md`, `nightshift-backlog-3.md`, …) per the [SKILL.md multi-run convention](SKILL.md#multiple-runs-on-the-same-date). Confirm with the user which cycle suffix you are writing into before proceeding.

## 2. Design ambiguity sweep

For each pending item, ask yourself: "What's the first decision I'd have to make to start coding?" Then ask the user. Common shapes:
- Where does this code live? (project / namespace / file path)
- What's the public API surface? (return type, error mode, async or sync)
- What's the abstraction boundary — interface or concrete?
- Is there an existing pattern in the codebase to follow, or is this novel?
- What does failure look like? (exception, `Result` type, null, log-and-continue)
- Does this need an ADR first? (anything touching architectural seams or cross-cutting concerns)

Inline answers into the item's `**Notes:**` block — not in chat. Future-you in the loop won't see the chat.

## 3. Test fixtures + boundaries

- [ ] What's mocked? What hits the real thing?
- [ ] Are there containers/services that must be running? (Docker daemon, Testcontainers images — pre-pull MSSQL / Azurite to avoid 1.4 GB cold pulls in the middle of the night)
- [ ] Do tests need network access? Whitelist hosts via permissions if so.
- [ ] Are there test secrets / API keys needed? Confirm user-secrets / env vars are in place (`dotnet user-secrets list` for .NET; `env | grep <prefix>` for shell).

## 4. Build / test plumbing (discovery, not assumption)

Walk the discovery order from SKILL.md (`CLAUDE.md` → CI workflow → build manifest → saved memory → README) and write what you find into a `## NightShift detected conventions` block at the top of the backlog. Confirm with the user before locking it in.

- [ ] **Build command** — record verbatim (e.g. `dotnet build <sln>.sln`, `npm run build`, `cargo build`, `make`, `./gradlew build`, `mix compile`).
- [ ] **Test command(s)** — there may be more than one (unit / integration / e2e). Record each with its trigger condition.
- [ ] **Test style preference** — saved memory may already say "integration tests first" or similar; if not, ask.
- [ ] **"Green" baseline run** — run the test command(s) once *now*. If anything is failing, NightShift inherits that failure and will waste retries on it. Either fix it pre-flight or document it in the backlog under `## Known fails to ignore` so the loop doesn't trip on it.
- [ ] **Workflow shape** — saved memory may say "ADR → plan → TDD → implement" or similar; if so, draft a short ADR snippet in the Run log before Red for non-trivial items.

## 5. Permission staging

The loop must NOT trigger interactive permission prompts. Pre-approve via `.claude/settings.local.json`. Use the `update-config` skill to apply changes safely — it knows the schema.

Derive the allow-list from the build/test commands you discovered in section 4, plus the always-safe read-only git operations. Universal baseline:

```jsonc
{
  "permissions": {
    "allow": [
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)"
    ]
  }
}
```

Then layer per-toolchain entries. Examples (pick the ones that match what section 4 surfaced):

| Toolchain | Add |
|---|---|
| .NET | `Bash(dotnet build:*)`, `Bash(dotnet test:*)`, `Bash(dotnet restore:*)`, `Bash(dotnet user-secrets:*)` |
| Node | `Bash(npm install:*)`, `Bash(npm run:*)`, `Bash(npm test:*)`, `Bash(npx:*)` |
| Python | `Bash(pytest:*)`, `Bash(uv run:*)` or `Bash(poetry run:*)`, `Bash(ruff:*)` |
| Rust | `Bash(cargo build:*)`, `Bash(cargo test:*)`, `Bash(cargo clippy:*)` |
| Container-backed tests | `Bash(docker:*)` (or narrower: `Bash(docker pull:*)`, `Bash(docker ps:*)`) |
| Cloud-touching | `Bash(az:*)`, `Bash(gh:*)`, `Bash(terraform:*)` — **only if the work items genuinely need them** |

**Always ask the user before adding network-egress permissions or anything that could write to shared infra** (`gh pr create`, `git push`, `terraform apply`, `az * set`, `kubectl apply`, package publish commands).

## 6. Commit / push / PR policy

Ask explicitly and inline the answers at the top of the backlog as a `## NightShift policy` block:
- [ ] Should NightShift commit per item? (default: **yes** — one commit per Green)
- [ ] Should it push? (default: **NO** — leave for morning review)
- [ ] Should it open PRs? (default: **NO**)
- [ ] Branch policy — are we on a working branch already, or should NightShift create one?
- [ ] Off-limits paths — files / directories NightShift must not touch (e.g. production config, generated code)

## 7. Final go/no-go

Before saying "ready", read back to the user:
- "I will work on N items in this order: ..."
- "I will NOT touch: ..."
- "If I get stuck on item *X*, I will defer the question and move on; on the 3rd retry I'll mark it failed and move on."
- "I will leave the run log + Q:/A: entries in the backlog for you to read in the morning."
- "Commit policy: <yes/no per item>. Push policy: <yes/no>. PR policy: <yes/no>."

User says "go" → enter Phase 2.

## Anti-patterns to avoid in pre-flight

- **Don't accept "use your judgment"** as an answer to a design question that has multiple defensible options. Make the user pick now, or you'll pick wrong at 3 a.m.
- **Don't skip the green-baseline run.** Trusting that "tests probably pass" eats a retry budget on item 1.
- **Don't pre-approve `git push`** without an explicit request. The default policy is local-only.
- **Don't enter Phase 2 because the user said "looks good".** They have to literally say "go" or equivalent unambiguous authorization.
