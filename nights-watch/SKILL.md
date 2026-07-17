---
name: nights-watch
description: 'The watch that never sleeps — a standing autonomous loop that scans the issue tracker (GitHub or Jira) for tickets explicitly marked ready for AI (label `ai-ready` or equivalent), triages each through a readiness gate, claims it, and dispatches the work to lean dynamic Workflows. The watcher takes no part in the work itself: the main context stays lean (scan → triage → dispatch → report only), workers run at the lowest sufficient model tier (Sonnet default, Haiku for mechanical, Opus by exception), tickets are worked one at a time by default with a worker cap of 3 (both configurable), and token spend is watched and used to plan each wave. Truth and correctness outrank everything: at every critical decision moment, agents use the fact-check skill to decompose the decision into verifiable sub-claims and prove each with evidence — or discover the premise is false in the process. The Watch remembers: each agent dumps field notes to its own chronicle as it works, and every patrol closes with a gathering at the fire — a retrospective that curates durable lessons (conventions, gotchas, token calibrations, decisions, tooling) into a shared Library that all future agents recall from by index. Composes the sworn-brother skills at their highest-value points: fact-check (every critical decision + external facts), nightshift (each ranger''s TDD loop), sdlc-workhorse (opus-tier/load-bearing tickets — the autonomous lifecycle, dispatched as a Workflow), code-review-grill (every PR before ai-done). ALSO the single-ticket mode — a RANGING (`ticket=<id|url|prose>`): the user hands over ONE ticket (no tracker label needed, no muster, no worker pool, no standing loop) and the Watch works it end to end with the full by-the-book lifecycle regardless of size — fact-checked readiness gate (gaps asked of the user, since they''re in the room), spec + written plan, design review, TDD Red→Green→Refactor, adversarial code-review-grill, and documentation the change invalidates updated in the same PR. Use the ranging when the user says "do this ticket properly / by the book / the right way", "take this one issue and do the whole process", "work issue #N end to end with TDD and docs", or hands over a single task wanting it done correctly rather than fast (for fast, that''s go-go-go; for a backlog file, that''s nightshift). Use the patrol when the user wants tickets picked up and worked autonomously, mentions "night''s watch", "man the wall", "watch the backlog / tracker", "pick up AI-ready tickets", wants unattended triage of labeled issues, or invokes /nights-watch. AND the recurring security mode — a HUNT (`hunt`, `every=1h` configurable): instead of the tracker it watches the CODE as it moves, waking on a fixed cadence to examine only what changed since it last looked (commits, dependency manifests, config, optionally logs — a watermark and a fingerprint ledger mean a quiet hour costs one `git log` and no finding is ever reported twice, though a severity that rose or a fixed flaw come back still sound the horn), hunting critical bugs and vulnerabilities through single-lens hunters (injection, authz, secrets, supply-chain, correctness, exposure), killing any candidate that two of three independent refuters can refute, and reporting the survivors — with failure path and proof — through a configurable channel (`report=document|issues|pr|advisory|chat`; `issues` files them as ai-ready tickets for a patrol to fix). The hunt never fixes what it finds, and never publishes a vulnerability from a public repo. Use it when the user wants recurring/scheduled/hourly scanning for bugs, vulnerabilities, CVEs or regressions in recent changes, an autonomous security watch or audit of new commits and dependencies, findings documented and reported automatically, or says "hunt", "scan every hour", "watch the code for vulnerabilities", "keep checking what we merged".'
---

# Night's Watch

> *"I am the watcher on the walls."* The Watch never sleeps, takes no part in the work, and wears no gold — minimalism is the uniform.

## Quick start

```
/nights-watch                                  # GitHub, label ai-ready, one ticket at a time
/nights-watch label=ready-for-ai tracker=jira  # custom label / tracker
/nights-watch parallel=3                       # up to 3 tickets in flight (the default worker cap)
/nights-watch parallel=5 max-workers=5         # raising past 3 requires raising the cap too
/nights-watch once                             # single patrol, no standing loop
/nights-watch ticket=42                        # a RANGING — one ticket the user hands over, full lifecycle
/nights-watch ticket="CSV export drops the last row"
/nights-watch hunt                             # a HUNT — hourly sweep of what changed, for bugs & vulns
/nights-watch hunt every=15m report=issues     # tighter cadence; findings filed as ai-ready tickets
```

Invoking this skill is the user's explicit opt-in to multi-agent orchestration (the Workflow tool).

## The Oath (non-negotiable rules)

1. **Truth before all.** Truth and correctness are the utmost priority — above throughput, above token economy. At every critical decision moment (a triage verdict, a design fork, a "this is the root cause" call, a blocker declaration, a "done" claim), the deciding agent uses the **fact-check** skill to decompose the decision into smaller verifiable sub-claims and prove each one — a runnable experiment with its output, or independent authoritative sources — before acting on it. A claim that can't be proven is treated as false until it can; discovering mid-check that the premise is wrong is a *success* of the process, and the decision changes accordingly. No agent of the Watch acts on an unverified load-bearing claim.
2. **The watcher takes no part.** The main agent NEVER implements a ticket. It only scans, triages, dispatches Workflows, and reports. All reading of codebases, all edits, all tests happen inside workflow subagents — the watcher's context stays lean enough to patrol all night.
3. **Only sworn tickets.** Pick up ONLY items carrying the AI-ready label (default `ai-ready`; accept obvious variants the user configured). No label, no work — never infer readiness from a ticket that hasn't been explicitly handed to the Watch. (On a ranging, the user handing the ticket over *is* the vouch — that IS the explicit hand-over the rule asks for. A hunt needs no vouch at all: it changes no code, so the rule has nothing to protect — and in exchange it may never fix what it finds, only report it.)
4. **Minimalism.** Every worker runs at the lowest sufficient tier: `haiku` for mechanical chores, `sonnet` as the default, `opus` only when the triage rubric justifies it ([TRIAGE.md](TRIAGE.md)). Never default a worker to the main-loop tier. Minimalism buys tiers, never process: no tier is ever a licence to skip the gate, the grill, or a ranging's lifecycle.
5. **One ticket at a time — by default.** In-flight tickets default to **1** (`parallel=1`); the user may raise it, but never past the worker cap `max-workers` (default **3**). Both are configurable; both are enforced by the worker pool inside the workflow script, not by hope. A ranging is always exactly one.
6. **Watch the tokens.** Track `budget.spent()` across the night; plan each wave so tokens go to tickets, not overhead. If a token target is set, stop claiming new tickets when the remainder wouldn't cover one ([WATCH.md](WATCH.md) § Token watching).
7. **Report or die trying.** Every claimed ticket ends in exactly one of: a PR + `ai-done`, or a comment explaining the blocker + `ai-blocked`. Never leave a ticket claimed and silent. On a hunt, every wake reports too — including the empty ones, since a quiet hunt and a broken hunt are indistinguishable from the outside.

## One patrol (each wake-up)

1. **Muster** — query the tracker for the ready label, excluding already-claimed items (GitHub: `gh issue list --label ai-ready`; Jira: JQL via available MCP/CLI). Empty muster → log it, schedule next patrol.
2. **Triage** — run each candidate through the readiness gate and tier rubric in [TRIAGE.md](TRIAGE.md). Not ready → comment precisely what's missing, swap label to `ai-blocked`, move on. Never dispatch a ticket that fails the gate.
3. **Claim** — swap `ai-ready` → `ai-working` and comment that the Watch has taken it (prevents double-pickup by a second watcher or a human).
4. **Dispatch** — one Workflow per patrol: a 3-worker pool draining the triaged queue, each ticket at its assigned tier, budget-guarded. Script template in [WATCH.md](WATCH.md).
5. **Report** — per ticket: push branch, open PR, comment the link, label `ai-done`; or comment the blocker and label `ai-blocked`. Append a patrol summary (tickets, tiers, outcomes, tokens spent) to the watch journal.
6. **Gather at the fire** — mandatory retrospective closing every patrol: the watcher reads every ranger's chronicle (each agent dumps field notes to its own chronicle file *as it works* — crash-safe, outside its worktree) and curates the durable lessons into the shared **Library** (`.nights-watch/library/`, one fact per file + INDEX.md): conventions, gotchas, token calibrations, settled decisions, tooling. Noise dies with the chronicle; process lessons route to `evolve-skill` instead. Protocol in [LIBRARY.md](LIBRARY.md).
7. **Return to the wall** — standing watch runs under `/loop` self-pacing: long fallback (~1800 s) while a workflow runs, 20–30 min idle ticks when the muster was empty. `once` mode skips this. Details in [WATCH.md](WATCH.md).

Every agent of the Watch reads the Library's `INDEX.md` before working (rangers open only entries relevant to their ticket — recall stays lean) and writes to its own chronicle as it goes. Only the fire writes the Library.

## The Ranging — one ticket the user hands over ([RANGING.md](RANGING.md))

`ticket=<id|url|prose>` switches the Watch from patrolling the wall to a single mission beyond it: no muster, no label required, no worker pool, no loop. The user names one ticket; the Watch returns a PR or a precise reason it couldn't.

What falls away is everything that served throughput. What stays is everything that serves correctness — and the process floor rises: the ranging runs **sdlc-workhorse end to end regardless of how small the ticket looks** (spec → grilled requirements → design review → TDD → implement → adversarial review → **docs updated in the same PR**), with the tier rubric choosing only which model carries each phase, floor `sonnet`. The gate still runs — but with the user in the room, a gate failure is a question asked of them, not an `ai-blocked` label and a shrug. Full protocol, including the three completion conditions agents quietly skip on small tickets: [RANGING.md](RANGING.md).

Reach for it when one ticket matters enough that a wrong answer costs more than the lifecycle does. For a typo sweep, let a patrol hand it to a haiku ranger; to ship fast, use `go-go-go`.

## The Hunt — standing watch over what just changed ([HUNT.md](HUNT.md))

`hunt` points the Watch at the code instead of the tracker. On a fixed cadence (`every`, default **1h**) it examines **only what changed since it last looked** — commits, dependency manifests, config, optionally logs — hunts critical bugs and vulnerabilities through a party of single-lens hunters (injection, authz, secrets, supply-chain, correctness, exposure), sends every candidate to **three independent refuters** whose job is to kill it, and reports the survivors through the channel the user chose (`report=document|issues|pr|advisory|chat`, default a dated document). It runs as its own Workflow ([`.claude/workflows/hunt.js`](../.claude/workflows/hunt.js), dispatched by `scriptPath` — named resolution would read the hunted repo's workflows, not this one).

Three properties make it survivable as an hourly job. It is **incremental**: a watermark records the last delta every triggered lens examined, so a quiet hour costs one `git log --name-only` and spawns no agents, and a ledger of fingerprints — derived by the script from a closed vocabulary, never phrased by a model — means nothing is reported twice, while a severity that *rose* or a fixed flaw come *back* still gets through. (That state is deliberately not in the Library: the Library is memory an agent may fact-check and correct, and a watermark is law — [LIBRARY.md](LIBRARY.md).) It is **adversarial**: two of three refuters killing a finding drops it silently, because an hourly report the user learns to skim is worth nothing. And it **never fixes** — an unattended agent rewriting security-sensitive code with nobody reading the diff is worse than the bug; `report=issues` files findings as `ai-ready` tickets instead, which is how the Hunt hands work to the patrol and the two modes close the loop.

One rule is the Hunt's alone: **disclosure is a decision**. On a public repo a committed document, a tracker issue, and a PR are each publication — and so is the ledger, which names live unfixed flaws. So visibility is resolved before the muster (unresolvable → treated as public), the state root moves *outside* the repo rather than being gitignored inside it, and a real vulnerability routes to a draft security advisory — overriding whatever `report=` said, falling back to telling the human directly rather than writing it down. The cost is stated rather than hidden: state outside the repo no longer travels between machines, so `state=<private path>` is how a team gets that back ([HUNT.md](HUNT.md)).

## Sworn brothers — mandatory skill composition

The Watch does not reinvent discipline it already has. These four skills are **mandatory**, each at the point where it provides the most value; skipping one is an Oath violation, not a judgment call.

| Skill | Where in the patrol | Why there |
|---|---|---|
| **fact-check** | Every critical decision moment, by every agent of the Watch (Oath rule 1): triage verdicts, load-bearing external claims in tickets (API behavior, version/compat facts, copied numbers), a ranger's root-cause call or design fork, any fact about to enter code | Decomposes the decision into smaller verifiable sub-claims and proves each with evidence — a runnable experiment + output, or independent authoritative sources — or discovers the premise is false in the process. A ticket built on a false premise fails the gate honestly (`ai-blocked` + evidence) instead of burning a worker; proven facts carry their proof into the PR |
| **nightshift** (LOOP.md discipline) | Every ranger's implementation of a normal ticket | The per-item TDD loop (Red → Green → Refactor), 3-attempt limit, and Q:/A: question-deferral are exactly the ranger's job — deferral maps to returning `blocked` instead of guessing |
| **sdlc-workhorse** | Opus-tier / load-bearing tickets (public API, schema, subsystem — anything the triage rubric escalated for design risk), **and every ranging, whatever its tier**. Dispatched as a Workflow — by the patrol script, or by the watcher on a ranging — never handed to a ranger to "run" | Where a wrong design costs more than the tokens, the full by-the-book lifecycle (spec → grilled requirements → design review → TDD → review → docs) is the cheap option — and a ticket the user hands over one at a time is that case by construction. The Watch works unattended, so it takes the variant whose gates are **control flow**: `sdlc-old-fashioned` holds its gates with a human standing at each one, and there is no human on the Wall at 3am. Its gates would be improvised past, which is worse than not having them — it looks like rigor in the report |
| **code-review-grill** | After Green + Refactor, before any PR is marked `ai-done` — a fresh reviewer that never saw the ranger's rationale grills the diff | The ranger's test proves only what the ranger thought to assert; the grilling is the Watch's quality gate, and its findings post to the PR |

The watcher wires these in via the ranger prompt ([WATCH.md](WATCH.md)); triage assigns which process each ticket gets ([TRIAGE.md](TRIAGE.md) § Process assignment).

## Label protocol

| Label | Meaning | Set by |
|---|---|---|
| `ai-ready` | Human vouches the ticket is self-contained and AI-suitable | Human only |
| `ai-working` | Claimed by the Watch this patrol | Watch |
| `ai-done` | PR opened, link commented | Watch |
| `ai-blocked` | Failed the gate or hit a human-decision blocker; comment says why | Watch |

Label names are configurable; the four-state protocol is not. Missing labels? Create them on first patrol (GitHub: `gh label create`).

## Stop conditions

Stand down when the user says so, when a hard token target is exhausted, or when 3 consecutive patrols find an empty muster **and** no standing loop was requested. On stand-down, release any still-claimed tickets back to `ai-ready` with a comment.

A **ranging** has no loop to stand down from: it ends at its terminal state — PR opened and reported, or the blocker explained to the user with the evidence behind it.

A **hunt** stands down on the user's word or an exhausted token target — never on its own judgment that the repo has gone quiet, since "hourly" is a promise about coverage. No ticket is ever claimed, so none needs releasing — but the lock does: a stand-down mid-hunt must release `.lock/`, or the next hunt skips ticks until the TTL breaks it. The watermark deliberately does not advance there, so the cost is re-hunting one delta rather than a delta nobody ever looked at.
