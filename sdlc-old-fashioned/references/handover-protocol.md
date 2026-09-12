# Handover protocol — mechanics

This is the detail behind **Dial 2 → "fresh process per phase"** and the **handover protocol** section of `SKILL.md`.

> Flag names evolve between Claude Code versions. Confirm the exact flags with `claude --help` before relying on them; the *shape* of the protocol (brief in → fresh process → transcript on disk → thin summary out) doesn't change.

## File layout

The run's state root — `~/.agent-state/<repo-slug>/sdlc-old-fashioned/`, written `<state>/` here — is outside the tree, so it survives the worktree and never reaches the PR ([agent-state.md](../../docs/agent-state.md)):

```
<state>/
  backlog.md                           # THE live backlog
  runs/
    01-guardrails.brief.md             # exactly what the phase agent received
    01-guardrails.log                  # tee'd, human-readable transcript of the run
    02-specify.brief.md
    02-specify.log
    04-plan.brief.md
    05-plan-review.brief.md
    07-red-S2.brief.md                 # per-slice phases carry the slice id
    08-impl-S2.log
    ...
```

The spec, plan, review notes, verdicts and retro are **posted on the PR** — in the body, in a comment, or on a linked issue — not committed into the tree. What gets committed is what a reader would open without knowing a run happened: the ADRs, the runbooks, a lessons entry. A repo whose `CLAUDE.md` names its own committed home for agent process records overrides that; Phase 1 finds it. The canonical, replayable transcript is *also* written by the harness itself (see "Transcript capture" below) — the `.log` is the convenience copy.

## Orient & isolate (Step 0.7)

**Orient** at the very start so you never act blind:

```bash
pwd
git status --short --branch
git worktree list
```

**Isolate** the work on its own worktree by default (override: user says "work in place"):

```bash
git worktree add ../<repo>-<feature> -b <feature-branch>    # or the harness EnterWorktree
```

Run the conductor from inside the worktree so every spawned phase process inherits that cwd (or pass `--add-dir <worktree>` explicitly). The committed deliverables (ADRs, runbooks, the lessons entry) live in the worktree and land on the branch. `<state>/` — the backlog and the per-phase runs alike — is outside the tree: it stays on disk for inspection and cross-session resume, never reaches the branch, and needs nothing deleted at publish time.

**Clean up** once the PR is open and pushed — propose, don't auto-remove:

```bash
git worktree remove ../<repo>-<feature>                     # after confirming; or ExitWorktree
```

Safe as soon as the PR carries what it has to carry. `<state>/` is not in the worktree, so the briefs and `.log` files survive the removal — which matters for a phase that ran as an in-session subagent, where there is no canonical `.jsonl` to name and those logs are the only transcript and the only proof each test went RED.

## The per-phase loop

For phase `NN` (and slice `Sx` where the phase is per-slice):

### 1. Write the brief

The conductor uses the `handoff` skill to produce a minimal, lossless brief. Point at artifacts; never paste them. Template:

```markdown
# Phase brief — <NN> <phase name> — slice <Sx, if any>

## Your job
Run the **<phase>** phase. Delegate to `/<owning-skill>`.
GATE you must meet before exiting: <copy the gate text from the lifecycle table>.
<For code phases 8, 9 and 10 only — copy this line verbatim:>
Standing quality standard, part of the gate: `/less-is-more` and `/no-comment`. Smallest
architecturally honest change, no parallel additive path, no abstraction with one caller,
no comment a name or an extracted function could have replaced.
<When an optional step's trigger plausibly fires for this phase, name it here:>
Optional and yours to judge: `/<optional-skill>` — <the trigger, in one line>. Take it or
skip it; if you skip a trigger that clearly fired, say so in RESULT.

## Where things stand  (summary of prior phases — the part you can't reconstruct)
<3–8 lines: decisions taken, what's green/red, gotchas, the one thing that will bite you.>

## Assumptions this brief rests on  (falsify them; report what was wrong in RESULT)
<one line each. A count or inventory carries the filter/command that produced it, never the bare number.>

## Read these (don't trust this brief alone)
- Live backlog / current state: <state>/backlog.md
- Spec/PRD: <path>
- Plan: <the PR comment or issue holding it>
- Other artifacts: <paths>

## Definition of done for THIS run
1. Meet the GATE above.
2. Update <state>/backlog.md — item state, phase, the `Current` block, timestamp.
   <A read-only phase whose output is a PR comment — Phase 9 review, say — still writes its
   RESULT to the backlog, but is not asked to commit anything: never demand a commit from a
   phase that has nothing committable.>
3. Write your artifacts to <paths>.
4. Any work outside this slice's scope → file it as an issue / backlog item. Do NOT act on it.
5. Print a `RESULT` block, ≤10 lines: gate met (y/n), artifacts written, backlog updated, blockers, recommended next phase, and — last, mandatory — what in this brief was wrong ("nothing" is an answer; silence is not).
```

Save it to `<state>/runs/NN-<phase>.brief.md`.

### 2. Spawn a fresh process, capture the transcript

Pick the **model tier that fits the phase** — cheap (haiku/sonnet) for mechanical phases (RED scaffolding, docs, board updates), stronger (opus) for grill / plan review / adversarial code review / deepen.

**PowerShell (Windows):**
```powershell
$phase = "05-plan-review"
$brief = "<state>/runs/$phase.brief.md"
$log   = "<state>/runs/$phase.log"
$sid   = [guid]::NewGuid().Guid            # so you know exactly which transcript file it is

Get-Content $brief -Raw |
  claude -p --session-id $sid --model opus --add-dir . `
    --permission-mode acceptEdits --verbose 2>&1 |
  Tee-Object -FilePath $log
```

**bash:**
```bash
phase="05-plan-review"; sid=$(uuidgen)
cat "<state>/runs/$phase.brief.md" \
 | claude -p --session-id "$sid" --model opus --add-dir . \
     --permission-mode acceptEdits --verbose 2>&1 \
 | tee "<state>/runs/$phase.log"
```

Notes:
- `claude -p` reads the prompt from **stdin** when piped, avoiding command-line length/escaping limits.
- Run **one process at a time**. The gates keep phases sequential, so there's no working-tree contention.
- Add `--output-format stream-json` (with `--verbose`) if you want to parse the run programmatically; plain text is fine for human inspection.
- If a phase dies (API error, timeout), re-dispatch changing **one variable at a time** — resume the session first, then a fresh process, then another model — so the cause is learnable rather than asserted. A phase that keeps dying at its write is re-briefed to write the artifact incrementally, so a crash costs a paragraph, not the phase.

### 3. Transcript capture — two records, both inspectable

- **Convenience log:** the `tee`/`Tee-Object` above → `<state>/runs/NN-<phase>.log`, human-readable.
- **Canonical transcript:** the harness writes the complete session (every message, tool call, and result) to
  `~/.claude/projects/<project-slug>/<session-id>.jsonl`.
  `<project-slug>` is the working directory with path separators replaced by dashes; if unsure, list `~/.claude/projects/` and match by the newest `<session-id>.jsonl`. Because you passed `--session-id`, you know the filename exactly. Replay/inspect it later with `claude --resume <session-id>`.

### 4. Consume thin — the conductor stays minimal

The conductor reads back **only**:
- the child's `RESULT` block (≤10 lines), and
- the diff of `<state>/backlog.md`.

It checks the gate against those, writes its decision (scope change, revised figure, deferral) into the backlog's `Decisions / notes`, then advances or loops the phase — the next brief must never carry a figure the backlog doesn't. **It never reads the child's full transcript into its own context.** The transcript is for the human and the audit trail, on disk.

## The backlog — schema

`<state>/backlog.md`, updated by every phase before it exits. It is run scaffolding, not a deliverable, and the ignored state root keeps it out of the merged tree on its own — but it also dies with the worktree, so **its still-open items are filed to the tracker or the PR before Phase 13 sweeps** (see `SKILL.md`, Step 6):

```markdown
# SDLC backlog — <feature / epic name>

## Current
- **Slice:**  S2 — <title>
- **Phase:**  8 — Implement → GREEN
- **Run:**    <state>/runs/08-impl-S2.log   (session <sid>)
- **Updated:** 2026-07-06T14:20Z

## Slices
| id | slice                       | state | phase | last run                         |
|----|-----------------------------|-------|-------|----------------------------------|
| S1 | <title>                     | Done  | 12    | <state>/runs/12-merge-S1.log   |
| S2 | <title>                     | Doing | 8     | <state>/runs/08-impl-S2.log    |
| S3 | <title>                     | Todo  | —     | —                                |

## Out-of-scope / filed  (feature-creep guard)
- #123  <discovered item>  — filed Phase 9, S2

## Decisions / notes
- <one-liners a fresh reader needs; link ADRs>
```

`state` ∈ `Todo | Doing | Done` (mirror your tracker's columns if it has different names). Mark a slice **test-only** or **impl-only** in its title when the plan pairs it with another slice for its RED or its GREEN — not every slice owns both halves of Phase 7/8. The **`Current` block is the contract**: any human or freshly-spawned agent reads it first and knows the live state without replaying anything. Before writing the next brief, **the conductor reads the target slice's row and RESULT, not just the phase number** — a slice already `Done` needs no RED dispatched against it, even when the phase counter says "next is 7".

## Permissions & safety

- Non-interactive children must not hang on a prompt. Use `--permission-mode acceptEdits` for edit/build phases (auto-approves file edits, still refuses genuinely risky actions). For a fully sandboxed autonomous run you *may* use `--dangerously-skip-permissions` — only inside a sandbox, never for a phase that can touch an irreversible/outward action.
- **Irreversible gates** (Phase 12 merge to a protected branch, publish, schema/data migration, spend) are **never** delegated to a skip-permissions child. The child stops at the gate and hands the action back; the conductor performs it under the usual stop-and-confirm, on explicit human go (attended) or per the logged decision (autonomous).
- Scope the child's reach with `--add-dir` to the repo; don't hand it directories it has no business in.

## Autonomous mode

When Dial 1 = autonomous, `nightshift` is the driver that walks the Step-6 backlog and runs this loop per item. Questions the child can't resolve are appended to the backlog (with the chosen default logged) instead of blocking — except at irreversible gates, which still wait for a human.
