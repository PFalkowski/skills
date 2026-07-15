---
name: nights-watch
description: 'The watch that never sleeps — a standing autonomous loop that scans the issue tracker (GitHub or Jira) for tickets explicitly marked ready for AI (label `ai-ready` or equivalent), triages each through a readiness gate, claims it, and dispatches the work to lean dynamic Workflows. The watcher takes no part in the work itself: the main context stays lean (scan → triage → dispatch → report only), workers run at the lowest sufficient model tier (Sonnet default, Haiku for mechanical, Opus by exception), concurrency is capped at 3, and token spend is watched and used to plan each wave. Use when the user wants tickets picked up and worked autonomously, mentions "night''s watch", "man the wall", "watch the backlog / tracker", "pick up AI-ready tickets", wants unattended triage of labeled issues, or invokes /nights-watch.'
---

# Night's Watch

> *"I am the watcher on the walls."* The Watch never sleeps, takes no part in the work, and wears no gold — minimalism is the uniform.

## Quick start

```
/nights-watch                                  # GitHub, label ai-ready, current repo
/nights-watch label=ready-for-ai tracker=jira  # custom label / tracker
/nights-watch once                             # single patrol, no standing loop
```

Invoking this skill is the user's explicit opt-in to multi-agent orchestration (the Workflow tool).

## The Oath (non-negotiable rules)

1. **The watcher takes no part.** The main agent NEVER implements a ticket. It only scans, triages, dispatches Workflows, and reports. All reading of codebases, all edits, all tests happen inside workflow subagents — the watcher's context stays lean enough to patrol all night.
2. **Only sworn tickets.** Pick up ONLY items carrying the AI-ready label (default `ai-ready`; accept obvious variants the user configured). No label, no work — never infer readiness from a ticket that hasn't been explicitly handed to the Watch.
3. **Minimalism.** Every worker runs at the lowest sufficient tier: `haiku` for mechanical chores, `sonnet` as the default, `opus` only when the triage rubric justifies it ([TRIAGE.md](TRIAGE.md)). Never default a worker to the main-loop tier.
4. **Three rangers, no more.** At most 3 tickets in flight at once — enforced by a 3-worker pool inside the workflow script, not by hope.
5. **Watch the tokens.** Track `budget.spent()` across the night; plan each wave so tokens go to tickets, not overhead. If a token target is set, stop claiming new tickets when the remainder wouldn't cover one ([WATCH.md](WATCH.md) § Token watching).
6. **Report or die trying.** Every claimed ticket ends in exactly one of: a PR + `ai-done`, or a comment explaining the blocker + `ai-blocked`. Never leave a ticket claimed and silent.

## One patrol (each wake-up)

1. **Muster** — query the tracker for the ready label, excluding already-claimed items (GitHub: `gh issue list --label ai-ready`; Jira: JQL via available MCP/CLI). Empty muster → log it, schedule next patrol.
2. **Triage** — run each candidate through the readiness gate and tier rubric in [TRIAGE.md](TRIAGE.md). Not ready → comment precisely what's missing, swap label to `ai-blocked`, move on. Never dispatch a ticket that fails the gate.
3. **Claim** — swap `ai-ready` → `ai-working` and comment that the Watch has taken it (prevents double-pickup by a second watcher or a human).
4. **Dispatch** — one Workflow per patrol: a 3-worker pool draining the triaged queue, each ticket at its assigned tier, budget-guarded. Script template in [WATCH.md](WATCH.md).
5. **Report** — per ticket: push branch, open PR, comment the link, label `ai-done`; or comment the blocker and label `ai-blocked`. Append a patrol summary (tickets, tiers, outcomes, tokens spent) to the watch journal.
6. **Return to the wall** — standing watch runs under `/loop` self-pacing: long fallback (~1800 s) while a workflow runs, 20–30 min idle ticks when the muster was empty. `once` mode skips this. Details in [WATCH.md](WATCH.md).

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
