---
name: evolve-skill
description: 'Turns feedback about a skill, MCP, hook, or process into a durable improvement of its source. Triggers: shortly after one ran, the user asks to change its behavior, corrects it, or says "incorporate this", "build this in", "remember to". Distinct from write-a-skill (new) and update-config (settings).'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# evolve-skill

Capture feedback about *how a capability behaved* into its source, so it improves instead of evaporating into a one-off fix.

## Triggers
Feedback about a skill / MCP / hook / process that just ran — a change request, a correction, a recurring-gap flag, or "codify / remember / build this in". **Test:** would it apply next time this capability runs on a *different* task? Yes → here. Only the current task → just finish the task. Recognition is model-driven (no hook) — treat any "the tool/process should…" remark as the cue.

## Runbook
1. **Locate the canonical source.**
   - Public skill → `github.com/PFalkowski/skills` (locally `…/skills/<name>`); many are symlinked into `~/.claude/skills`, so editing the repo file edits the live skill (`ls -la ~/.claude/skills` to confirm).
   - Vendored/third-party (symlinked to a skills dir outside this repo) → flag it; don't rewrite upstream as ours.
   - MCP / hooks / permissions / settings → `settings.json` via `update-config`, not here.
   - Project-bound lesson → project memory or `.claude/skills/`, never a public skill.
2. **Distill** the feedback into the smallest generalized change. Strip private specifics (absolute paths, single-repo issue numbers, sensitive names). Keep the *why*.
3. **Edit vs. new:** tweak → edit it; a distinct reusable process → new skill (`write-a-skill`); sometimes both.
4. **Ask permission, showing the change** — file(s), diff summary, and whether it's a local edit / commit / push. Never modify silently.
5. **Apply** — edit, commit with a clear message; **push only with separate explicit confirmation** (public = outward-facing). **Check what branch the skills repo is on before you commit.** It is a working repo like any other and is often mid-task on someone else's feature branch; committing onto whatever is checked out bundles your edit with unrelated pending work and strands it behind that branch's fate. Branch off the default branch, put the edit there, and open a PR.

## Rules
- Always ask before modifying; show the change first.
- Public skills carry **no** private specifics — a reader with no repo access must understand it fully.
- **Minimal, targeted edits — capture the rule, not a procedure.** Add only what the feedback states; don't invent conditional branches, edge-case handling, or workflow variants the user didn't ask for. "Always do X" stays "always do X", not a decision tree. Prefer one sentence to a new subsection; when unsure, under-specify and let the next run add precision. Capture the rationale too, not just the rule.
- Right home wins: generalizable → public skill; project-bound → memory; config → `update-config`.
- A skill that gains its own run log or state file writes it under `.agents/<skill-name>/`, per [docs/agent-state.md](../docs/agent-state.md) — don't introduce a new state root outside that convention.
- Don't let the meta-work bury the task — capture, sign off, return.

## Related
`write-a-skill` (new from scratch) · `update-config` (settings/MCP) · project memory (non-generalizable lessons).
