---
name: relay-loop
description: Run long multi-step work as a relay of fresh contexts — a PLAN file holds every planned step, a HANDOFF file carries the baton (current state + exact next step), and each iteration executes exactly ONE step, verifies it, commits, rewrites the baton, and re-queues itself. Any fresh context pointed at the loop folder can continue the work. Use when work spans more steps or sessions than one context should hold, when the user wants every step reproducible from a fresh context, mentions "relay loop", "self-prompting loop", "handoff at each step", "make this resumable/reproducible", or when compaction or session loss would otherwise lose the plan mid-work.
---

# Relay Loop

Long work rots a context: early decisions blur, the plan drifts, a crash or compaction loses
everything not written down. A relay loop makes the FILES the only memory: every iteration
("leg") could be run by a brand-new agent, because everything a runner needs is in two small
files that the previous leg left behind. If the current session dies at any point, nothing is
lost but the leg in flight.

## Files (the only shared state)

Create `docs/loops/<subject>/` in the repo (committed, so the loop survives machines too):

**PLAN.md** — every step, decided up front, amended as discovered. Never rewritten wholesale.

```md
# <subject> — relay plan
Goal: <one sentence>
Done means: <observable end state>

## Steps
- [x] S1 — <imperative, self-contained step> (verify: <command/observation>)
- [ ] S2 — ... (verify: ...)
- [!] S3 — BLOCKED: <the exact question only the user can answer>
```

**HANDOFF.md** — the baton. REWRITTEN every leg (never appended). Follow the `handoff` skill's
style: carry state not story, point at files instead of pasting, resolve every reference.

```md
# Baton — <subject>
Leg completed: S2 (<date>)
Next: S3 — <exact instruction a fresh agent runs verbatim, incl. repo/branch>
Preflight: <one quick check that the world is as expected, e.g. "branch X exists, tests green">
State the next runner cannot reconstruct:
- <bullet — decisions made, gotchas hit, paths; no narration>
```

## The leg protocol (one iteration)

1. Read HANDOFF.md, then PLAN.md. Run the preflight check; if reality disagrees, fix the files
   first — the files are authoritative, your memory is not.
2. Execute exactly ONE step (the baton's `Next`). Resist bundling "quick" extra steps.
3. Verify it by the step's own `verify:` clause — build, tests, observable output.
4. Commit + push (code and the two loop files together — the baton must never describe a state
   that isn't pushed).
5. Update PLAN.md (`[ ]`→`[x]`; append newly-discovered steps as new IDs — discoveries go to the
   PLAN, never balloon the baton).
6. Rewrite HANDOFF.md for the next step.
7. Re-queue (below) — or stop if PLAN is all `[x]` (report done) or the next step is `[!]`
   (stop the loop and surface the blocking question to the user).

## Re-queuing (pick one; the files make them equivalent)

- **Self-pacing loop**: `/loop /relay-loop docs/loops/<subject>` — each firing runs one leg;
  end it via the loop's stop mechanism when PLAN is exhausted.
- **Fresh subagent per leg** (best context hygiene): the orchestrator spawns one agent per leg
  with the prompt below, reads its result, spawns the next — nightshift-style.
- **Ralph loop / cron**: same prompt on an interval; idempotent because a leg with an
  unchanged baton just re-runs the same `Next`.
- **Manual**: user opens any fresh session and pastes the prompt. This always works — the other
  three are conveniences on top of it.

Leg prompt (self-contained, works in any fresh context):

```
Run one leg of the relay loop at <repo>/docs/loops/<subject>: read HANDOFF.md and PLAN.md,
execute only the Next step, verify, commit+push, update both files per the relay-loop skill.
```

## Bootstrapping from a live conversation

When adopting mid-work: write PLAN.md from what remains (mark what's already done), write the
first baton from the current conversation state (this is a normal `handoff`), commit, then
switch to the leg protocol. From then on the conversation you bootstrapped from is disposable.

## Rules

- One step per leg. A step too big to verify in one leg gets split in PLAN.md first.
- Never mark `[x]` without its `verify:` passing; never leave the baton describing unpushed work.
- Blocked ≠ failed: `[!]` stops the loop loudly with the question; it does not guess.
- Steps must be self-contained imperatives — a runner with zero prior context executes them.
  When in doubt, apply the `prompt-backlog` test: could a fresh agent run this line verbatim?
