---
name: handoff-check
description: 'When the user greenlights a substantial, multi-step task, reflects on whether the current context is too full or too off-topic to run it efficiently, and — only if a clean context would be clearly cheaper and safer — recommends a handoff (fresh session or subagent) with a ready-to-paste brief and the reasoning. Suggests only; never auto-spawns or clears. Use when the user commits to a big piece of work ("go ahead", "do it", "implement/build it", "let''s ship it", "proceed").'
---

# handoff-check

A fast gate the instant a big task is greenlit: run it **here**, or start **clean**?

## The call — three gates, hand off only if ALL hold

1. **Big task** — multi-step / multi-file / long-horizon; real risk of filling the
   window or hitting compaction mid-task. *Small or quick → stay, say nothing.*
2. **Carrying ≫ needed** — the window is already well-used **or** mostly about something
   else. Test: *if I restarted this task in a clean session, how much of this conversation
   would I actually re-read?* Little → a fresh start is cheap and valuable. *Fresh window,
   or most context is on-topic → stay.*
3. **Cleanly transferable** — the state the task needs (goal, files, decisions,
   constraints) fits in a short brief without losing tacit, hard-won understanding.
   *Deeply entangled state → handoff is lossy; prefer `/compact` or stay.*

Use whatever usage signal is visible (token %, session length); otherwise estimate
coarsely — the decision is intentionally low-resolution.

## Output discipline — staying is the default
- If handoff doesn't **clearly** win, emit **one line max** (or nothing) and get on with
  the task. Do not narrate the gates you checked.
- Run **once** per greenlight. If the user already declined a handoff for this work, drop it.

## If handoff clearly wins
Surface a short recommendation, then let the user choose — **never auto-spawn, `/clear`, or
`/compact` for them.**

1. **Why** — 1–3 sentences grounded in real signals (window fullness, what's now dead
   weight, task scale). e.g. *"Window's ~60% full but ~80% of it is the deploy debugging
   this build doesn't need; this is a ~15-step multi-file job — a clean start begins
   near-empty with full runway."*
2. **Handoff brief** — tight enough to be lossless:
   - **Objective** — one line.
   - **Done when** — acceptance criteria.
   - **Key files / entry points** — paths.
   - **Settled** — decisions & constraints already made (don't re-litigate).
   - **Out of scope** — ruled-out paths / dead-ends.
   - **First step.**
3. **Pick the path** (AskUserQuestion) — match it to interaction need:
   - **Fresh session** — user stays hands-on, full runway; loses this thread. Write the
     brief to a file (e.g. `HANDOFF.md` in the repo) so it survives `/clear`.
   - **Subagent now** — fire-and-forget, self-contained; this context is preserved. The
     user's yes is the spawn request.
   - **Continue here** — keep the thread; skip the handoff.
   - **Compact first** — reclaim space, keep the thread (when state is too entangled to brief).
