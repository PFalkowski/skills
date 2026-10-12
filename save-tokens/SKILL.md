---
name: save-tokens
description: Reduce context/model cost on new requests, dispatches, phase checkpoints or usage limits; offer fresh sessions.
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# save-tokens

Apply token savings with available tools. Agents cannot run user slash commands (`/clear`, `/compact`, `/rewind`, `/model`): recommend the exact command at its trigger in one line, then continue work.

Guidance draws on [session value](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions) and [model/effort selection](https://claude.com/blog/claude-model-and-effort-level-in-claude-code).

## Settings worth checking once

On first use on a machine, unexplained usage, or a large initial prefix, read [MACHINE-SETTINGS.md](MACHINE-SETTINGS.md) for config checks and measurement commands. Suggest only applicable changes; settings require the user's yes. Do not repeat configured recommendations.

## What the agent does itself

### Send each job to the cheapest tier that does it

Set `model` on every dispatch, never below the `CLAUDE.md` house worker tier. Read MACHINE-SETTINGS when inheritance/version precedence matters.

| Tier | Work |
|---|---|
| Worker, low effort | Read-only discovery and mechanical changes verifiable by search/build: callers, renames, version bumps, formatting, log summaries |
| Worker, medium (default) | Local engineering and tests: reproduced bugs, patterned features, module refactors |
| Strongest available | Cross-cutting/hard-to-reverse decisions and adversarial work: plan/security review, unreproduced concurrency, public APIs, grading diffs |

When torn, take the lower row. Before escalation, fix vague briefs; low-effort briefs must specify action and return format. Full context + genuine failed reasoning needs a bigger model; skipped files/tests or incomplete work needs more effort. A failed attempt gets one retry, one row up. Workflow `agent()` and definitions support `effort`; plain dispatch uses model defaults.

### Keep noise out of the context that thinks

Output above 30,000 characters spills to a file; `bashOutputMaxChars` (or fallback `BASH_MAX_OUTPUT_LENGTH`) changes this. Large output just under the limit remains expensive.

Use quiet flags (`--reporter=dot`, `-q`, `--quiet`, `--no-pager`, `--stat`, log `-n 20`), then filter relevant failures/tail lines or redirect to scratch. Delegate large logs, sweeps, and builds whose intermediate output is irrelevant; two-line jobs do not justify duplicated subagent context. Await completion notices/Monitor rather than repeated polling; do independent work meanwhile.

### Read what the task needs, once

Search before reading; use offsets/limits for known regions. Do not reread unchanged context or print files merely to confirm successful edits. Reuse transcript facts. For large lessons/decision logs, use indexes and read matching records only; add a pointer index when missing using [`postmortem`](../postmortem/SKILL.md).

### Write less

Keep final answers short; link files/output instead of pasting or repeating them.

## What the agent recommends, and when

One exact-command suggestion per boundary; after a decline, drop it for the task. Detect spills, finished large outputs, unrelated prompts, auto-compaction, and unused tools. User gauges: [`statusline`](../statusline/SKILL.md), `/context`, `/usage` (`/cost`).

| Trigger | Recommendation |
|---|---|
| Milestone finished; heavy detail no longer needed | `/compact keep: <goal, decisions, paths>; drop: <finished detail>`. Stable preservation rules belong in `# Compact instructions` in CLAUDE.md or a `SessionStart` hook matched on `compact`. For 1M models, `/autocompact 200k` (v2.1.221+) restores an earlier safety net |
| User stepping away | `/compact` while cached: subscription cache expires after 1h, API after 5m. API `promptCacheTtl: 1h` / `ENABLE_PROMPT_CACHING_1H=1` covers breaks under 1h |
| Recent turns should be discarded | `/rewind` before them: cuts turns free; `/compact` rewrites at a cost |
| Wrong tier/effort for the next stretch | `/model` or `/effort` at a boundary, ideally after clear/compact. Model switches and most effort switches re-prefill (effort exception: Fable 5.1); choices persist as next-session defaults. Known grunt session: `MAX_THINKING_TOKENS=0 claude` (no Fable effect) |
| Had to search for the user's file | After searching, suggest an @-mention once; avoids a Read. Repeated mentions attach duplicate copies |
| Setting up local `/loop`, reminder, or cron | Use a fresh session/terminal: each firing carries its full conversation; after 1h idle, cache misses too. Cloud `/schedule` is exempt |
| Delegated work reaches a committed checkpoint, or a usage limit is hit | Offer a fresh session unprompted. First save every prompt needed next to a file and identify session-started background processes that will die with the session |
| Fresh session, unused MCPs, or workflow-heavy CLAUDE.md | `/context`, `/model`, `/effort`; `/mcp disable <server>` for this session. Offer moving workflow prose into skills |
| Repeated noisy command now has a known quiet form | Propose its exact one-line CLAUDE.md invocation. Alternatively offer a `PreToolUse` Bash hook via `hookSpecificOutput.updatedInput.command`; [example](https://code.claude.com/docs/en/costs#offload-processing-to-hooks-and-skills) |
| Repeated delegated noisy job | Write `.claude/agents/<name>.md` with explicit worker `model:` and appropriate `effort:`; report in one line |

### A new request: keep going, compact, or start fresh

- Builds on active work or arrives mid-task: continue silently.
- Needs session context but finished detail dominates: recommend compact with explicit keep/drop.
- Third correction of the same issue after two failed corrections: offer a fresh session with a note stating the correct target.
- Needs little context: offer a fresh session. If too entangled for a short note, compact instead; for fire-and-forget work, dispatch a subagent with the note.

Before offering/launching a fresh session, read [FRESH-SESSION.md](FRESH-SESSION.md): prepare a scratch handoff and platform launcher, show both, then ask. Only after yes, launch and stop working on the request here. Never clear/compact for the user.

## Relationship to sibling skills

[`handoff`](../handoff/SKILL.md) writes the fresh-context note (supersedes archived `handoff-check`); [`reflect`](../reflect/SKILL.md) budgets obstacles; [`whatever`](../whatever/SKILL.md) makes compaction suggestions defaults with cheap veto. [`nights-watch`](../nights-watch/TRIAGE.md) and [`manager`](../manager/SKILL.md) use this tier rubric; [`go-go-go`](../go-go-go/SKILL.md) keeps its shipping table. [`statusline`](../statusline/SKILL.md) shows usage.
