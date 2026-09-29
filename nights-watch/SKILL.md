---
name: nights-watch
description: 'Continuously patrol issues, code or PRs and pick up tickets; never merge or approve. Use for "man the wall".'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Night's Watch

## Quick start

```
/nights-watch                                  # DEFAULT — a PATROL and a HUNT on the same wall, each on its own cadence
/nights-watch patrol                           # the patrol alone — judged intake over the tracker, no hunt
/nights-watch select=label:ready-for-agent     # a label, if this board already marks agent-ready work
/nights-watch select=123,456,789               # an explicit list
/nights-watch select="title:/parity|flaky/"    # regex over titles (a glob is accepted too)
/nights-watch select=label:ready-for-agent judge=off     # trust the selector, skip the judge
/nights-watch label=ready-for-ai tracker=jira  # custom label / tracker
/nights-watch parallel=3                       # up to 3 tickets in flight (the default worker cap)
/nights-watch parallel=5 max-workers=5         # raising past 3 requires raising the cap too
/nights-watch once                             # single patrol, no standing loop
/nights-watch ticket=42                        # a RANGING — one ticket the user hands over, full lifecycle
/nights-watch ticket="CSV export drops the last row"
/nights-watch hunt                             # a HUNT — hourly sweep of what changed, for bugs & vulns
/nights-watch hunt every=15m report=issues     # tighter cadence; findings filed as ai-ready tickets
/nights-watch hunt for=smells target=repo      # ADD prey (docs/observability/performance/smells/warnings — security+bugs always run) and pick ground (diff/last-commit/<range>/repo)
/nights-watch grill                            # a GRILL — cadenced adversarial review of our open PRs
/nights-watch grill stance=quorum concerns=security,architecture,tests
/nights-watch salvage worktrees=<path>[,<path>…] max=5 once   # a SALVAGE — preserve blocked worktrees' work in PRs, then remove them
/nights-watch salvage worktrees=<path>[,<path>…] dry-run once  # classify and plan only
```

Invoking this skill is the user's explicit opt-in to multi-agent orchestration (the Workflow tool). A scheduled firing may not carry that opt-in: when the Workflow tool is missing or refuses, dispatch the same work as plain subagents and say so in the patrol summary.

## The Oath (non-negotiable rules)

1. **Truth before all.** Truth and correctness are the utmost priority — above throughput, above token economy. At every critical decision moment (a triage verdict, a design fork, a "this is the root cause" call, a blocker declaration, a "done" claim), the deciding agent uses the **fact-check** skill to decompose the decision into smaller verifiable sub-claims and prove each one — a runnable experiment with its output, or independent authoritative sources — before acting on it. A claim that can't be proven is treated as false until it can.

   **The claim's type fixes which of those two it gets, not convenience.** An executable claim — what the code does at runtime — is grounded only by running it and showing the real output, never by an in-repo citation or a source link in its place; if it was not run it is withheld from the findings rather than reported anyway, and is listed under **Not run** with the reason and the command that would settle it.

   **Absence is a claim like any other, and needs its own proof.** An empty grep, an empty diff, or a file that reads as missing proves only that the check came back empty — not that the thing checked for is actually gone. Before concluding absence, verify the check ran against fresh, correct state: fetch before reading a remote ref, never in the same command as the read and never before the fetch has completed, and confirm the path was right (see [LIBRARY.md](LIBRARY.md) § Recall).
2. **The watcher takes no part — in every mode.** Dispatch all code reading, analysis, edits and tests, including hunt lenses/refuters, grill reviewers/verifiers and ranging premise/ranger, at rule 4's tier. The watcher scans, triages, dispatches and reports. It may handle the muster (names only), one cheap shell command, or a decision needing loop state; name the reason in the report. If dispatch is unavailable, report it and stand down; never absorb the work.
3. **Only work that is ready *and* intended.** Require sufficient specification and intent to build now; exclude parked, deferred, superseded, decision-blocked and record-only tickets. A user selector (label, IDs, glob/regex over titles/labels/components/paths, or tracker query) establishes that set. Without one, judge every open unclaimed ticket ([TRIAGE.md](TRIAGE.md) § Judged intake). Reuse the tracker's ready label or documented role (`ai-ready`, `ready-for-agent`, `approved-for-ai`); never add a competing vouch label or extra gate. Never enact rejection: no label, closure or argument; report under rule 7. A ranging's direct assignment establishes readiness and intent. Hunts need neither because they report only and never fix.
4. **Minimalism.** Every worker runs at the lowest sufficient tier: `low` effort on the house worker tier for mechanical chores, `medium` as the default, `high` (the full lifecycle on the strongest tier) only when the triage rubric justifies it ([TRIAGE.md](TRIAGE.md)). Never default a worker to the main-loop tier. Minimalism buys tiers, never process: no tier is ever a licence to skip the gate, the grill, or a ranging's lifecycle.
5. **One ticket at a time — by default.** In-flight tickets default to **1** (`parallel=1`); the user may raise it, but never past the worker cap `max-workers` (default **3**). Both are configurable; both are enforced by the worker pool inside the workflow script, not by hope. A ranging is always exactly one.
6. **Watch the tokens — and the usage window.** Track `budget.spent()` across the night; reserve enough per ticket before claiming. Stop new claims when a token target cannot cover one. If the harness usage window cannot cover a ticket reserve, hold the muster unclaimed and wake at reset instead of the idle tick. These are the only backpressure limits; unmerged PRs never slow dispatch ([WATCH.md](WATCH.md) § Token watching).
7. **Report or die trying — and never label a refusal.** Every claim ends in a PR + `ai-done`, or a precise blocker comment and released claim. Decide reversible choices at `opus` under `whatever`, recording the choice and reasoning in the PR. Escalate irreversible or grave decisions: data loss, money, external publishing/sending, schema/public API, or anything the ticket flags as contested. Judge the cost of being wrong, not whether the ticket specified a detail. Surface escalations in the session as well as the tracker: plain-English question, why an agent cannot decide, and ticket link. Pre-claim refusals get only a patrol-summary reason: no comment, label or state change. Hunts report every wake, including empty ones.
8. **Stealth in the field.** A ranger's diff should read like anyone's: no code comments beyond what the repo's own house rules require (e.g., a documented Arrange-Act-Assert convention) — default to none. Nothing in a commit message, PR title, or PR description names the Watch, nights-watch, or "ranger", or otherwise reveals the work was done by this skill; write them as any contributor would, describing only the change itself. This directive doesn't travel on its own — whatever carries the brief to a worker (the ranger prompt, a ranging's gated brief, an opus ticket's `goal`) must restate it, since a worker outside this skill's own prompt never reads the Oath.
9. **Announce the watch.** On the first patrol, publish one durable, pinned board notice with 🐺 at the title's start. Name the selector (or "every open ticket, judged"), the `ai-working` claim label/comment with holder, tier, host and ISO start, and the orphan rule: claim older than lock TTL with no PR link is released. Verify the pin every patrol and repin if lost; [WATCH.md](WATCH.md) § The notice covers full pin slots. Never close, duplicate or retitle the notice to reflect run status. Its title must not claim liveness: use "🐺 Autonomous agents may claim issues here". Current liveness comes from ticket claim timestamps. This board notice never becomes a commit/PR byline (rule 8).
10. **No code without a failing test first.** TDD — Red → Green → Refactor — is the *only* way work gets done here, at every tier including `low`, and the red must fail on the **asserted behaviour**, not on a typo or a missing fixture. The single exemption is a change with genuinely no observable behavioural surface — a dep bump with no API delta, doc wording — and it must be **declared with a reason and verified by the grill against the diff**.
11. **The premise is established before the work, at `opus`, and only proven claims are held.** Before a ranger writes anything, a fresh opus agent settles what *correct* means for the ticket: every load-bearing claim run through **fact-check**, the survivors carried forward as the verified premise, the unprovable listed as open questions rather than hedged into the brief. The ranger's tests assert that premise. It is floored at `opus` even when the ranger is `low`, because the failure modes are not symmetric: a cheap premise writes a wrong *definition of correct*, and then every gate downstream faithfully certifies conformance to it.

## One patrol (each wake-up)

1. **Muster** — first release any `ai-working` ticket whose claim comment is older than `lockTtlMin` and carries no PR link: remove the label, comment why, and treat it as a candidate again — the board-side twin of the lock reap. Then build the candidate set, excluding already-claimed items. **With no selector (the default):** every open unclaimed ticket is a candidate, and the judge decides — expect it to reject most of them, which is the intended shape, not a malfunction. **With a selector:** a label is a tracker query (GitHub: `gh issue list --label ai-ready`; Jira: JQL via available MCP/CLI); a list is the ids themselves; a glob/regex is a full listing matched locally (`gh issue list --json number,title,labels,isPinned` → filter), never a shell glob against the tracker. The judge still runs afterwards unless turned off. **Ask for `isPinned` here whatever the selector is** — that one extra field on a call the muster already makes is the whole of the notice check (rule 9). **An empty muster under one label is not an empty wall.** Before logging it, list the tracker's labels (`gh label list`) and read whatever label map the repo documents — many projects declare their triage vocabulary in `CLAUDE.md` or `docs/`, and an agent that queries only this skill's default name will report a quiet wall while vouched tickets sit under the project's own. If a plausible vouch label exists that you didn't query, ask the user which one carries it rather than standing down beside a full backlog. Genuinely empty → log it, schedule next patrol.
2. **Groom** — `needs-triage` tickets need lane assignment before candidacy. Dispatch `triage` in a fresh medium-effort agent per ticket to read code/reproduce bugs. With delegation recorded in the repo's label doc, it writes `ready-for-agent`, `ready-for-human` or `needs-info` and supporting briefs/notes; otherwise it only comments notes. Report `wontfix` in the summary/digest, never close the ticket. The intake judge still checks groomed agent-ready tickets. See [TRIAGE.md](TRIAGE.md) § Grooming.
3. **Triage** — run each surviving candidate through the readiness gate and tier rubric in [TRIAGE.md](TRIAGE.md). Not ready → record it in the patrol summary with the specific reason and move on. Never label it, never dispatch it.
4. **Claim** — swap `ai-ready` → `ai-working` and comment that the Watch has taken it, naming holder, tier, host and ISO start — the same lines as `owner.md`, so the board shows who holds it and since when (prevents double-pickup by a second watcher or a human, and lets anyone judge staleness).
5. **Dispatch** — one Workflow per patrol: a 3-worker pool draining the triaged queue, each ticket at its assigned tier, budget-guarded. Per ticket the pool runs **premise (opus) → ranger (TDD, in its own worktree) → grill**, and advertises the claim in `~/.agent-state/<repo-slug>/nights-watch/locks/ticket-<id>/` with an `owner.md` naming holder, ticket, tier, branch, start time and host — released in a `finally`, so a dead ranger or a thrown grill cannot strand it. Script template in [WATCH.md](WATCH.md).
6. **Report** — per ticket, push/open PR, comment its link and label `ai-done`; otherwise comment the blocker and release the claim. Surface decision blockers in the session with a plain-English question, ticket link and recommendation. Once daily include every open human-lane ticket (`ready-for-human`, decision-blocked, groom-written `needs-info`) in a digest: question, recommendation, link. The next patrol converts the human's batch answers into lanes and briefs. Journal tickets worked, tiers, outcomes, tokens spent, and every declined candidate with its reason.
7. **Gather at the fire** — mandatory retrospective closing every patrol: the watcher reads every ranger's chronicle (each agent dumps field notes to its own chronicle file *as it works* — crash-safe, outside its worktree) and curates the durable lessons into the shared **Library** (`.nights-watch/library/`, one fact per file + INDEX.md): conventions, gotchas, token calibrations, settled decisions, tooling. Noise dies with the chronicle; process lessons route to `evolve-skill` instead. Protocol in [LIBRARY.md](LIBRARY.md).
8. **Return to the wall** — standing watch runs under `/loop` self-pacing: long fallback (~1800 s) while a workflow runs, 20–30 min idle ticks when the muster was empty. **Under the default, the next wake is whichever loop is due first** — the patrol's idle tick or the hunt's cadence, never the patrol's alone, or the hunt's hourly promise quietly becomes a two-hourly one whenever a patrol runs long. `once` means one patrol and one hunt, and skips this. Details in [WATCH.md](WATCH.md).

Every agent of the Watch reads the Library's `INDEX.md` before working (rangers open only entries relevant to their ticket — recall stays lean) and writes to its own chronicle as it goes. Only the fire writes the Library.

**The default runs two modes.** Bare `/nights-watch` runs patrol and hunt concurrently, each on its own cadence without waiting for the other. `patrol`, `hunt` and `grill` run only their named mode; `ticket=<id>` runs one ranging without a loop.

**Modes may meet other sessions' live state.** Leave another mode's `.lock/` and unowned `ai-working` claims alone. Hunt lock `owner.md` records start, range and host; only a lock older than `lockTtl` is stale ([HUNT.md](HUNT.md)).

**Because they run concurrently, every mode stamps its output** — `[MM-DD HH:mm] <message>`, with a start and end banner on every wake, empty wakes included. The watcher takes the time at dispatch and passes it in as `startedAt`, because **a workflow script has no clock** — `Date.now()` throws inside one. Full convention, and the two rules that follow from having no clock, in [WATCH.md](WATCH.md) § Stamped output.

**Resolve run state from settings, never disk inference:** invocation `state=<path>` for a Hunt; else `AGENTS_STATE` in committed `.claude/settings.json`'s `env`; else `~/.agent-state/<repo-slug>/nights-watch/`. See [agent-state.md](../docs/agent-state.md). This holds journals, chronicles, locks, watermark and ledger. `.agent-state` opts into the checkout across clones/worktrees; the team chooses tracking (bookkeeping commits each wake) or ignoring (state lost with worktree). Only the [Library](LIBRARY.md) is always tracked. Name the resolved root each start banner and the setting to change it on an unconfigured first run. A public repo may never put Hunt state in-tree ([HUNT.md](HUNT.md) § Where the state root is).

## The Ranging — one ticket the user hands over ([RANGING.md](RANGING.md))

`ticket=<id|url|prose>` switches the Watch from patrolling the wall to a single mission beyond it: no muster, no label required, no worker pool, no loop. The user names one ticket; the Watch returns a PR or a precise reason it couldn't.

Run **sdlc-workhorse end to end at every ticket size**: spec → grilled requirements → design review → TDD → implementation → adversarial review → docs in the same PR. Tier controls phase effort only, floor `medium`. Gate failures go to the present user as questions. Read [RANGING.md](RANGING.md) for the full protocol and three completion conditions.

Reach for it when one ticket matters enough that a wrong answer costs more than the lifecycle does. For a typo sweep, let a patrol hand it to a `low` ranger; to ship fast, use `go-go-go`.

## The Hunt — standing watch over what just changed ([HUNT.md](HUNT.md))

`hunt` examines only changes since its watermark on `every` (default **1h**): commits, dependencies, config and optional logs. Dispatch single-lens hunters; **security and bugs always run**, security covering OWASP Top 10 (injection, authz/authn, crypto, secrets, supply-chain, exposure, insecure-design, audit-logging), bugs covering correctness/logic. Add docs, performance, smells or warnings when relevant. Send every candidate to **three independent refuters** to verify atomic claims, including attacker reachability against actual deployment topology. Dispatch [`workflows/hunt.js`](../workflows/hunt.js) by name; read [HUNT.md](HUNT.md). Report via `report=document|issues|pr|advisory|chat`, default `issues` with a remote tracker, otherwise a dated document.

The watermark advances only after every triggered lens covers the delta; quiet ticks cost one `git log --name-only` and no agents. Script-derived fingerprints use a closed vocabulary to suppress duplicates while allowing risen severity or recurrence. Keep this state outside the mutable [Library](LIBRARY.md). Two of three refuters rejecting a finding drops it silently. Hunts **never fix**; `report=issues` files survivors as `ai-ready` for patrol pickup.

**Disclosure is a decision.** Resolve visibility before muster; unknown means public. Public repos may never keep Hunt state in-tree: the ledger names unfixed flaws. Route real vulnerabilities to draft security advisories, overriding `report=`; if unavailable, tell the human directly rather than write a public record. For private cross-machine state use `state=<shared private path>` ([HUNT.md](HUNT.md)).

## The Grill — standing watch over the pull requests ([GRILL.md](GRILL.md))

`grill` runs every **45m** by default over our open PRs (`prs=` widens scope). Skip heads already in the grilled ledger; dispatch one workflow per changed PR. Fresh reviewers must not inherit author rationale, must apply repo house rules, and must have every finding refute-verified before reporting. Post survivors, including nits, inline on exact lines. Never merge, approve or edit code.

Workflow agents cannot spawn reviewers ([#46](https://github.com/PFalkowski/skills/issues/46)). [`workflows/grill.js`](../workflows/grill.js) must dispatch each concern reviewer and verifier as a first-order `agent()`, blind to the others. Missing execution means `complete: false` and no ledger entry, forcing re-review next tick. Read [GRILL.md](GRILL.md).

## The Salvage — worktrees nobody can clean up ([SALVAGE.md](SALVAGE.md))

`salvage worktrees=<paths>` points the Watch at local worktrees that hold unshipped work: unpushed commits, uncommitted changes, ignored files that are not build output. Each real feature gets its own PR; every leftover goes into one salvage PR per repository. Once a worktree's commits are proven to be on its PR's branch, the worktree and its local branch are removed. A secret-looking file is never committed; its worktree stays and is reported. Every safety decision (eligibility, secrets, the proof before `--force`) is made by [`scripts/salvage-gate.sh`](scripts/salvage-gate.sh), never by a model. `max=` caps the run, `dry-run` plans without writing, and the final message ends with a JSON report for the caller.

## Sworn brothers — mandatory skill composition

The following skills are mandatory at their listed stages.

| Skill | Required stage and contract |
|---|---|
| **triage** | Apply [READINESS.md](../triage/READINESS.md)'s ready-and-intended bar at judged intake and again at the gate. |
| **fact-check** | Every agent uses it at critical decisions (Oath 1): triage, external/API/version/numeric claims, root cause, design forks and facts entering code. Prove atomic claims by their required method; false premises are declined with evidence in the summary; carry proven evidence into the PR. |
| **nightshift** (`LOOP.md`) | Every ranger, including `low`: Red → Green → Refactor, 3-attempt limit, Q:/A: deferral mapped to `blocked`, never guessing. |
| **sdlc-workhorse** | High-tier/load-bearing tickets and every ranging: full spec → grilled requirements → design review → TDD → review → docs. Dispatch as a Workflow from the patrol script or ranging watcher, never through a ranger; gates must be script control flow. |
| **code-review-grill** | After ranger PR, before `ai-done`: fresh reviewer blind to ranger rationale, findings posted to PR. Patrol script dispatches a second `agent()` (ranger has no `Agent` tool); ranging watcher dispatches its reviewer. |


The watcher wires these in — the implementation skills via the ranger prompt, the grill as its own dispatch stage ([WATCH.md](WATCH.md)); triage assigns which process each ticket gets ([TRIAGE.md](TRIAGE.md) § Process assignment).

## Label protocol

| Label | Meaning | Set by |
|---|---|---|
| *a ready label* — `ai-ready`, `ready-for-agent`, whatever this tracker already calls it | The board's own mark for agent-ready work. **Optional**: one possible selector, replaced by judged intake where a tracker has no such convention | Whoever triages |
| `ai-working` | Claimed by the Watch this patrol | Watch |
| `ai-done` | PR opened, link commented | Watch |
| *the state lane* — `needs-triage` → `ready-for-agent` / `ready-for-human` / `needs-info` | Where a ticket is in triage. A lane label is a triage judgment, not a refusal | Watch's groom step, **only** under a delegation recorded in the repo's label doc |

Label names are configurable. **There is deliberately no rejected/blocked label** — the Watch never marks a ticket it declined (Oath rule 7); refusals go in the patrol summary, so a misjudgement costs a line of text rather than a state change on someone else's board.

`ai-working` and `ai-done` are the only two the Watch writes on its own authority (the groom's lane labels need the delegation above), and both are mandatory however the ticket was admitted: they advertise the claim, and a patrol that skips `ai-working` invites exactly the double-pickup they exist to prevent. Create them on first patrol if missing (GitHub: `gh label create`). The ready-label row is optional — with judged intake, nothing needs labelling by hand at all.

A running Watch applies these autonomously, often within minutes of a ticket gaining the ready label — announce it (Oath rule 9) so the transitions aren't read as a labelling bug.

## Stop conditions

Stand down when the user says so, when a hard token target is exhausted, or when 3 consecutive patrols find an empty muster **and** no standing loop was requested. **Under the default, the two loops stand down separately** — an empty tracker retires the patrol and leaves the hunt on the wall, since a quiet board says nothing about what was committed. Only the user's word or an exhausted target ends both. On stand-down, release any still-claimed tickets — remove `ai-working` and comment why — so nothing is left holding a claim the Watch is no longer honouring.

A **ranging** has no loop to stand down from: it ends at its terminal state — PR opened and reported, or the blocker explained to the user with the evidence behind it.

A **hunt** stands down on the user's word or an exhausted token target — never on its own judgment that the repo has gone quiet, since "hourly" is a promise about coverage. No ticket is ever claimed, so none needs releasing — but the lock does: a stand-down mid-hunt must release `.lock/`, or the next hunt skips ticks until the TTL breaks it. The watermark deliberately does not advance there, so the cost is re-hunting one delta rather than a delta nobody ever looked at.

A **salvage** has no loop either: it ends with its report, and releases its lock however it ends.

A **grill** stands down under the same terms as a hunt: release the lock, and leave any PR whose grill was mid-flight out of the grilled ledger — an un-ledgered PR is simply re-grilled next tick, which is the recoverable direction.
