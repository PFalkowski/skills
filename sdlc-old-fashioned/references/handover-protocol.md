# Handover protocol — mechanics

How the conductor runs each lifecycle phase as its own fresh `claude` process, keeps its own context minimal, and leaves a fully inspectable trail. This is the detail behind **Dial 2 → "fresh process per phase"** and the **handover protocol** section of `SKILL.md`.

> Flag names evolve between Claude Code versions. Confirm the exact flags with `claude --help` before relying on them; the *shape* of the protocol (brief in → fresh process → transcript on disk → thin summary out) doesn't change.

## File layout

Everything lives in the repo so it survives a cleared session and is reviewable in the PR:

```
prompts/sdlc-backlog.md          # THE live backlog — single source of truth for "what's current"
docs/sdlc/
  plan.md                        # Phase 4 design artifact (grilled in Phase 5)
  runs/
    01-guardrails.brief.md       # exactly what the phase agent received
    01-guardrails.log            # tee'd, human-readable transcript of the run
    02-specify.brief.md
    02-specify.log
    04-plan.brief.md
    05-plan-review.brief.md
    07-red-S2.brief.md           # per-slice phases carry the slice id
    08-impl-S2.log
    ...
  reflections/
    2026-07-06-retro.md          # Phase 13 output
```

The canonical, replayable transcript is *also* written by the harness itself (see "Transcript capture" below) — the `.log` is the convenience copy.

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

Run the conductor from inside the worktree so every spawned phase process inherits that cwd (or pass `--add-dir <worktree>` explicitly). `docs/sdlc/` and `prompts/sdlc-backlog.md` then live *in the worktree*, get committed on the branch, and travel with the PR.

**Clean up** once the PR is open and pushed — propose, don't auto-remove:

```bash
git worktree remove ../<repo>-<feature>                     # after confirming; or ExitWorktree
```

Safe because the audit trail is already committed and pushed; the worktree itself is disposable.

## The per-phase loop

For phase `NN` (and slice `Sx` where the phase is per-slice):

### 1. Write the brief

The conductor uses the `handoff` skill to produce a minimal, lossless brief. Point at artifacts; never paste them. Template:

```markdown
# Phase brief — <NN> <phase name> — slice <Sx, if any>

## Your job
Run the **<phase>** phase. Delegate to `/<owning-skill>`.
GATE you must meet before exiting: <copy the gate text from the lifecycle table>.

## Where things stand  (summary of prior phases — the part you can't reconstruct)
<3–8 lines: decisions taken, what's green/red, gotchas, the one thing that will bite you.>

## Read these (don't trust this brief alone)
- Live backlog / current state: prompts/sdlc-backlog.md
- Spec/PRD: <path>
- Plan: docs/sdlc/plan.md
- Other artifacts: <paths>

## Definition of done for THIS run
1. Meet the GATE above.
2. Update prompts/sdlc-backlog.md — item state, phase, the `Current` block, timestamp.
3. Write your artifacts to <paths>.
4. Any work outside this slice's scope → file it as an issue / backlog item. Do NOT act on it.
5. Print a `RESULT` block, ≤10 lines: gate met (y/n), artifacts written, backlog updated, blockers, recommended next phase.
```

Save it to `docs/sdlc/runs/NN-<phase>.brief.md`.

### 2. Spawn a fresh process, capture the transcript

Pick the **model tier that fits the phase** — cheap (haiku/sonnet) for mechanical phases (RED scaffolding, docs, board updates), stronger (opus) for grill / plan review / adversarial code review / deepen.

**PowerShell (Windows):**
```powershell
$phase = "05-plan-review"
$brief = "docs/sdlc/runs/$phase.brief.md"
$log   = "docs/sdlc/runs/$phase.log"
$sid   = [guid]::NewGuid().Guid            # so you know exactly which transcript file it is

Get-Content $brief -Raw |
  claude -p --session-id $sid --model opus --add-dir . `
    --permission-mode acceptEdits --verbose 2>&1 |
  Tee-Object -FilePath $log
```

**bash:**
```bash
phase="05-plan-review"; sid=$(uuidgen)
cat "docs/sdlc/runs/$phase.brief.md" \
 | claude -p --session-id "$sid" --model opus --add-dir . \
     --permission-mode acceptEdits --verbose 2>&1 \
 | tee "docs/sdlc/runs/$phase.log"
```

Notes:
- `claude -p` reads the prompt from **stdin** when piped, avoiding command-line length/escaping limits.
- Run **one process at a time**. The gates keep phases sequential, so there's no working-tree contention.
- Add `--output-format stream-json` (with `--verbose`) if you want to parse the run programmatically; plain text is fine for human inspection.

### 3. Transcript capture — two records, both inspectable

- **Convenience log:** the `tee`/`Tee-Object` above → `docs/sdlc/runs/NN-<phase>.log`, human-readable.
- **Canonical transcript:** the harness writes the complete session (every message, tool call, and result) to
  `~/.claude/projects/<project-slug>/<session-id>.jsonl`.
  `<project-slug>` is the working directory with path separators replaced by dashes; if unsure, list `~/.claude/projects/` and match by the newest `<session-id>.jsonl`. Because you passed `--session-id`, you know the filename exactly. Replay/inspect it later with `claude --resume <session-id>`.

Together these satisfy "full inspection of the conversation — what it received and what it did": the `.brief.md` is the input, the `.jsonl`/`.log` is the entire conversation.

### 4. Consume thin — the conductor stays minimal

The conductor reads back **only**:
- the child's `RESULT` block (≤10 lines), and
- the diff of `prompts/sdlc-backlog.md`.

It checks the gate against those, then advances or loops the phase. **It never reads the child's full transcript into its own context** — that would defeat the whole point. The transcript is for the human and the audit trail, on disk.

## The backlog — schema

`prompts/sdlc-backlog.md`, updated by every phase before it exits:

```markdown
# SDLC backlog — <feature / epic name>

## Current
- **Slice:**  S2 — <title>
- **Phase:**  8 — Implement → GREEN
- **Run:**    docs/sdlc/runs/08-impl-S2.log   (session <sid>)
- **Updated:** 2026-07-06T14:20Z

## Slices
| id | slice                       | state | phase | last run                         |
|----|-----------------------------|-------|-------|----------------------------------|
| S1 | <title>                     | Done  | 12    | docs/sdlc/runs/12-merge-S1.log   |
| S2 | <title>                     | Doing | 8     | docs/sdlc/runs/08-impl-S2.log    |
| S3 | <title>                     | Todo  | —     | —                                |

## Out-of-scope / filed  (feature-creep guard)
- #123  <discovered item>  — filed Phase 9, S2

## Decisions / notes
- <one-liners a fresh reader needs; link ADRs>
```

`state` ∈ `Todo | Doing | Done` (mirror your tracker's columns if it has different names). The **`Current` block is the contract**: any human or freshly-spawned agent reads it first and knows the live state without replaying anything.

## Permissions & safety

- Non-interactive children must not hang on a prompt. Use `--permission-mode acceptEdits` for edit/build phases (auto-approves file edits, still refuses genuinely risky actions). For a fully sandboxed autonomous run you *may* use `--dangerously-skip-permissions` — only inside a sandbox, never for a phase that can touch an irreversible/outward action.
- **Irreversible gates** (Phase 12 merge to a protected branch, publish, schema/data migration, spend) are **never** delegated to a skip-permissions child. The child stops at the gate and hands the action back; the conductor performs it under the usual stop-and-confirm, on explicit human go (attended) or per the logged decision (autonomous).
- Scope the child's reach with `--add-dir` to the repo; don't hand it directories it has no business in.

## Autonomous mode

When Dial 1 = autonomous, `nightshift` is the driver that walks the Step-6 backlog and runs this loop per item. Questions the child can't resolve are appended to the backlog (with the chosen default logged) instead of blocking — except at irreversible gates, which still wait for a human.
