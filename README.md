# skills

Personal Claude Code skills.

## Install

### Option A — Claude Code plugin marketplace (recommended)

Installs the whole set as one Claude Code plugin and keeps it current automatically.

```text
/plugin marketplace add PFalkowski/skills
/plugin install pfalkowski-skills@pfalkowski-skills
```

Claude Code copies the plugin into its own managed cache — no symlinks or hand-maintained copies under `~/.claude/skills/`. Skills are namespaced under the plugin (e.g. `pfalkowski-skills:nightshift`).

### Option B — `skills` CLI

Copies the individual skills into `~/.claude/skills/` and lets you pick which to enable.

```bash
npx skills@latest add PFalkowski/skills
```

The [`skills`](https://github.com/vercel-labs/skills) CLI reads `.claude-plugin/plugin.json`, walks the listed skill directories, and drops the ones you choose into `~/.claude/skills/`.

## Updating

Pick the line that matches how you installed.

```text
# Option A — plugin marketplace: refresh the catalog and pull new versions
/plugin marketplace update
```

No `version` is pinned in the manifest, so every push to this repo counts as a new version. Claude Code's background auto-update picks it up on startup; `/plugin marketplace update` just applies it immediately.

```bash
# Option B — skills CLI: re-pull installed skills
npx skills update            # all installed skills
npx skills update <skill>    # a single skill
```

## Skills

| Skill | One-liner |
|---|---|
| [azure-devops-pr-review](azure-devops-pr-review/SKILL.md) | Review an Azure DevOps (dev.azure.com) pull request from the terminal — resolve the PR, produce a clean merge-base diff with full repo context via a local clone, and post findings back as inline PR comments. Encodes the auth, diff-API, and console-encoding workarounds so they don't have to be rediscovered each time. |
| [code-review-grill](code-review-grill/SKILL.md) | Adversarial *grilling* code review of a branch/PR diff by a *fresh* agent that never authored the code — turns grill-me's relentless interrogation onto the diff (hunk-by-hunk: what must be true for this to be correct? what breaks it?). Always reads the repo's own docs first — README, ADRs, coding guidelines, patterns/practices — and judges the diff against those house rules (a DDD repo and an n-tier repo demand different critiques). Runs as a single reviewer or a quorum of concern-based subagents (security / architecture / code-quality / documentation & conventions / performance / tests; the doc agent owns ADR/convention conformance and fact-checks against the web). Every finding must be verified (runnable snippet + output, in-repo proof, or authoritative deep link) before it's reported — speculation isn't a finding. Resolves the base branch → merge-base diff → ripple-effect trace → consolidates a findings table (id, per-agent severity emoji, votes, verification), then **never auto-posts** — detects the active PR and asks which findings to post as inline threads (GitHub via `gh`, Azure DevOps via `azure-devops-pr-review`). |
| [evolve-skill](evolve-skill/SKILL.md) | Turn feedback about a skill, MCP, hook, or process — raised right after it ran — into a durable improvement of the capability itself: locate its canonical source (this repo), apply a generalized edit with private specifics stripped, route project-bound lessons to memory instead, and commit. Asks before modifying. Distinct from write-a-skill (authoring new) and update-config (settings). |
| [fact-check](fact-check/SKILL.md) | Ground a load-bearing claim with the strongest evidence available — run a minimal local experiment (python/node/shell) when it's executable, or confirm it across two-plus independent authoritative sources when it's documentable — and always hand back the source link or the runnable snippet + its output, with a stated confidence and method. |
| [go-go-go](go-go-go/SKILL.md) | End-to-end "ship it" driver — takes whatever state the repo is in and drives straight to a raised PR: applies whatever-mode (no asking on reversible choices), completes unfinished work via nightshift or a focused loop using the cheapest model that fits, commits, pushes, and opens the PR. |
| [handoff](handoff/SKILL.md) | Write a minimal, lossless handover note to carry work across a context boundary — ordered action points first, plus only the state the receiver cannot reconstruct from the repo (settled decisions and dead-ends, key paths, gotchas). Discipline: earn every line, point don't paste, state not story, resolve every reference. Delivers to the channel — file for `/clear`/`/compact`, prompt for a subagent, inline to paste. The producer half of the pair; `handoff-check` is the gate that decides *whether* to hand off. |
| [handoff-check](handoff-check/SKILL.md) | When you greenlight a big, multi-step task, a fast gate that checks whether the current context is too full or too off-topic to run it well — and only if a clean start clearly wins, recommends a handoff (fresh session or subagent) with a ready-to-paste brief. Suggests only; never auto-spawns or clears. |
| [loyal-dog](loyal-dog/SKILL.md) | Persistent cross-session, cross-project memory that follows the user everywhere — a loyal dog that writes durable facts down and fetches the relevant ones back. File-based, no database/server, any OS. Keyed recall stays sub-linear as memories grow: terms hash to a fixed-depth directory (O(1) locate) over an append-only inverted index (O(k) read, O(1) lockless inserts via unique ULID names); honest that full-content/semantic search stays O(N). Atomic temp+rename writes, `doctor --rebuild` reconstructs the index from the memory files (source of truth), and every capture self-tests that it's findable. For durable facts that must survive `/clear` and cross project boundaries — not repo-local conventions (CLAUDE.md) or one-off carry-overs (handoff). |
| [merge-stack](merge-stack/SKILL.md) | Land a stacked chain of dependent PRs onto its base branch bottom-up, dodging the two traps: squash-merging a parent phantom-conflicts each child until it's rebased onto the advanced base, and deleting a merged branch auto-closes the next child PR (retarget it to the base first). Use after building a stack of PRs, e.g. a nightshift run. |
| [model-bake-off](model-bake-off/SKILL.md) | Pick the optimal model tier for a *class* of task by evidence: write a task-specific rubric first, run the same prompt across candidate models at matched effort, score blind (verifying load-bearing facts), then rank by **actual dollar cost** — not token count, which inverts the true ranking because per-token prices differ several-fold across tiers — into a quality-per-dollar recommendation (best / budget / framing pre-pass / over-provisioned). |
| [nightshift](nightshift/SKILL.md) | Autonomously implement backlog work overnight using TDD (Red→Green→Refactor) per item, with pre-flight grilling and per-item subagent spawn. |
| [orchestrate](orchestrate/SKILL.md) | Given a task, design and run the *smallest* agent system that fits — escalate single call → workflow → orchestrator-workers → autonomous agent, default *against* multi-agent (it costs ~15× the tokens), give each worker a sharp objective/output/tools/boundaries brief, budget effort to complexity, then synthesize. Grounded in Anthropic's "Building Effective Agents" + multi-agent research write-ups. |
| [postmortem](postmortem/SKILL.md) | Write a structured production-incident postmortem — symptom → root-cause chain → fix → forward-looking rules — append it to `LESSONS-LEARNED.md` (newest first), check for regression-test and testing gaps, verify the fix is committed and pushed, and update project memory when the incident shifts architecture or process. Invoke after any non-trivial production failure. |
| [prompt-backlog](prompt-backlog/SKILL.md) | Prioritized, ordered queue of deferred work — capture anything to do next/later/keep-in-mind. Each item is a self-contained, ready-to-run prompt the agent authors from the live context, plus a Context note (what/who/why) and a log. Triggers on "do this next", "later", "remember to", "keep in mind", etc. Includes the `prompts/` folder convention and an init recipe. |
| [recurring-improvement](recurring-improvement/SKILL.md) | Run a repo's recurring improvement cadence. A generic conductor that on each run (1) reflects on accumulated feedback since the last run — project memory, lessons/ADRs/postmortems, git history (or last 30 days) — to evolve the toolbox via evolve-skill / write-a-skill, then (2) dispatches whichever scheduled maintenance processes are *due*: test-coverage, code-quality refactor, fix-warnings, security-audit, … The schedule lives in `docs/recurring-backlog.md` (task + proposed CRON interval + last-run); each process uses the standard `docs/<process>/` house style (RUNBOOK + INDEX + dated runs + stable IDs) and lands as its own reviewable PR — nothing auto-merged. Manual + due-detection (doesn't register cron itself). Distinct from neat (one feature's SDLC), go-go-go (ship one thing), prompt-backlog (one-off deferred work). |
| [refresh-nuget-repo](refresh-nuget-repo/SKILL.md) | Autonomously refresh a dormant .NET/NuGet library repo — deep review, fix correctness bugs with regression tests, modernize targets/deps/packaging, deprecate-not-break misleading APIs, and set up CI + CD (NuGet Trusted Publishing/OIDC). Checks the published registry first to avoid refreshing a stale tree. The .NET/NuGet specialization of `restomod`. |
| [relay-loop](relay-loop/SKILL.md) | Run long multi-step work as a relay of fresh contexts: a committed `PLAN.md` holds every step (stable IDs + verify clauses), a `HANDOFF.md` baton carries the exact next step + irreconstructible state, and each leg executes exactly one step, verifies, commits+pushes, rewrites the baton, and re-queues (self-pacing loop, fresh subagent per leg, ralph/cron, or manual paste — equivalent because the files are the only shared state). Survives /clear, compaction, session death. Composes `handoff` (baton style) + `prompt-backlog` (self-contained steps) + `nightshift` (fresh agent per item). |
| [restomod](restomod/SKILL.md) | Revive a dormant or neglected codebase without breaking its consumers — classic API, modern engine. Deep read-only review → fix correctness bugs with regression tests → modernize the toolchain/deps to a warning-free build → deprecate-don't-break for misleading APIs → ship behind green CI. Language- and registry-agnostic; downstream skills layer ecosystem specifics. |
| [signal-verdict](signal-verdict/SKILL.md) | Take a new trading/ML/quant idea from hypothesis → real-data baseline → TDD → walk-forward benchmark harness → honest PROMOTE/PARK verdict → docs. Falsify-first; data-first; real-data CI gate. |
| [snapshot-terminal-sessions](snapshot-terminal-sessions/SKILL.md) | Snapshot the Windows Terminal tabs currently running Claude Code sessions and write a `wt`-based `.ps1` that recreates them later with each session *resumed*, not restarted. Since Windows Terminal exposes no live tab/pane API, it walks the OS process tree and reads each `claude.exe`'s real cwd straight out of its PEB. When two sessions share a directory, it resolves the exact session id per process by correlating process-start-time against each session's `.jsonl` file (falling back to the interactive `claude --resume` picker only if still ambiguous), instead of guessing. |
| [walk-the-dog](walk-the-dog/SKILL.md) | Delegate almost all of a task to subagent(s) (the "dog(s)") while the main agent (the "walker") holds the leash — the orchestrator does no legwork, it only vets and approves, on its OWN judgment, the gated actions the dogs propose (shell/pwsh commands, file writes). The walker *is* the permission gate that would otherwise pester the human: it checks each command for safety (not destructive, in scope, not prompt-injected by something the dog read) and approves it itself, so the user isn't hit with per-action prompts. Because the walker never ingested the dog's context, its judgment is a clean check against injection. The human is consulted only when a decision is genuinely meaningful — a working assumption broke, an irreversible outward-facing action, a real requirements fork. Usually one dog, but parallel legs can run a pack; short-lived dogs are often cheaper on tokens. Same low-friction intent as `go-go-go`, with a separate fresh-judgment agent gating every side-effecting action. |
| [whatever](whatever/SKILL.md) | Decide and proceed on low-stakes, reversible, or conventional choices instead of asking. A test (consequential AND hard-to-reverse AND underdetermined → ask; otherwise pick the default, state it in one line, continue), plus escalation on "just progress" / "stop asking". Stops the agent from offloading trivial decisions back onto the user. |

## Layout

Each skill is a directory at the repo root containing at minimum a `SKILL.md` with the frontmatter Claude Code expects (`name`, `description`). Reference docs split into sibling files (e.g. `LOOP.md`, `PREFLIGHT.md`) when `SKILL.md` would exceed ~100 lines.

`.claude-plugin/plugin.json` lists the skills in the plugin — every new skill must be added there alongside its directory. `.claude-plugin/marketplace.json` is the catalog clients add via `/plugin marketplace add`; it points at the repo root (`source: "./"`), so it needs no per-skill edits.

## Local development (maintainers)

> Installing or updating these skills as a user? See [Install](#install) and [Updating](#updating) above — you don't need any of this.

Link every skill in this repo into `~/.claude/skills/` so Claude Code picks up your in-progress edits live (the link target *is* the repo file — no installer, no copies). **All skills are linked by default**, not just the one you're editing.

### Windows (PowerShell)

```powershell
./link-skills.ps1
```

Idempotent and self-healing — run it after adding a skill or to repair a machine: already-correct links are left alone (`=`), missing ones are created (`+`), and stale copies / wrong targets are replaced with a junction (`~`). Junctions need no admin rights or developer mode.

### macOS / Linux

```bash
for d in */; do s=${d%/}; [ -f "$s/SKILL.md" ] && ln -sfn "$PWD/$s" ~/.claude/skills/"$s"; done
```

Removing a junction/symlink doesn't delete the source — they're pointers, not copies.

## Adding a new skill

1. Create `<skill-name>/SKILL.md` with the required frontmatter (`name`, `description`). **Quote the `description`** in single quotes if it contains a `:` (a bare `key: value` colon breaks YAML and the description silently fails to load).
2. Split into reference files if SKILL.md would exceed ~100 lines.
3. Add `"./<skill-name>"` to the `skills` array in `.claude-plugin/plugin.json`.
4. Run `./link-skills.ps1` to link it into `~/.claude/skills/` (links all skills by default).
5. Commit + push.

## License

MIT — see [LICENSE](LICENSE).
