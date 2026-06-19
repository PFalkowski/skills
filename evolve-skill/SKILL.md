---
name: evolve-skill
description: Capture user feedback about a skill, MCP, hook, or repeatable process into a durable improvement of that capability — so it gets better every time it is used and found wanting. TRIGGER PROACTIVELY whenever, shortly after a skill/MCP/tool/process ran, the user requests a change to HOW it behaves, corrects how it ran, or raises feedback about it ("nightshift should also…", "that process was painful — codify it", "this skill keeps missing X", "make the agent always…", "remember to…", "incorporate this into…", "build this into…"). Ask the user for permission before modifying anything. Locate the capability's canonical source (public skills live at github.com/PFalkowski/skills, locally C:\src\repos\PFalkowski\skills; many are symlinked into ~/.claude/skills so editing the repo file IS editing the live skill), apply a generalized edit with private specifics stripped, route project-bound lessons to memory instead, and commit. Distinct from write-a-skill (authoring new from scratch) and update-config (MCP/permission/settings). Also: /evolve-skill.
---

# evolve-skill

Capture feedback about *how a capability behaved* into its source, so it improves instead of evaporating into a one-off fix.

## Triggers
Feedback about a skill / MCP / hook / process that just ran — a change request, a correction, a recurring-gap flag, or "codify / remember / build this in". **Test:** would it apply next time this capability runs on a *different* task? Yes → here. Only the current task → just finish the task. Recognition is model-driven (no hook) — treat any "the tool/process should…" remark as the cue.

## Runbook
1. **Locate the canonical source.**
   - Public skill → `github.com/PFalkowski/skills` (locally `…/skills/<name>`); many are symlinked into `~/.claude/skills`, so editing the repo file edits the live skill (`ls -la ~/.claude/skills` to confirm).
   - Vendored/third-party (symlinked elsewhere, e.g. `~/.agents/skills`) → flag it; don't rewrite upstream as ours.
   - MCP / hooks / permissions / settings → `settings.json` via `update-config`, not here.
   - Project-bound lesson → project memory or `.claude/skills/`, never a public skill.
2. **Distill** the feedback into the smallest generalized change. Strip private specifics (absolute paths, single-repo issue numbers, sensitive names). Keep the *why*.
3. **Edit vs. new:** tweak → edit it; a distinct reusable process → new skill (`write-a-skill`); sometimes both.
4. **Ask permission, showing the change** — file(s), diff summary, and whether it's a local edit / commit / push. Never modify silently.
5. **Apply** — edit, commit with a clear message; **push only with separate explicit confirmation** (public = outward-facing).

## Rules
- Always ask before modifying; show the change first.
- Public skills carry **no** private specifics — a reader with no repo access must understand it fully.
- Minimal, targeted edits; capture the rationale, not just the rule.
- Right home wins: generalizable → public skill; project-bound → memory; config → `update-config`.
- Don't let the meta-work bury the task — capture, sign off, return.

## Related
`write-a-skill` (new from scratch) · `update-config` (settings/MCP) · project memory (non-generalizable lessons).
