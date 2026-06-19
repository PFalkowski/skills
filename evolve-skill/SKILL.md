---
name: evolve-skill
description: Capture user feedback about a skill, MCP, hook, or repeatable process into a durable improvement of that capability — so it gets better every time it is used and found wanting. TRIGGER PROACTIVELY whenever, shortly after a skill/MCP/tool/process ran, the user requests a change to HOW it behaves, corrects how it ran, or raises feedback about it ("nightshift should also…", "that process was painful — codify it", "this skill keeps missing X", "make the agent always…", "remember to…", "incorporate this into…", "build this into…"). Ask the user for permission before modifying anything. Locate the capability's canonical source (public skills live at github.com/PFalkowski/skills, locally C:\src\repos\PFalkowski\skills; many are symlinked into ~/.claude/skills so editing the repo file IS editing the live skill), apply a generalized edit with private specifics stripped, route project-bound lessons to memory instead, and commit. Distinct from write-a-skill (authoring new from scratch) and update-config (MCP/permission/settings). Also: /evolve-skill.
---

# evolve-skill

Skills, MCP integrations, hooks, and repeatable processes should improve every time they're used and found lacking. When the user gives feedback on **how a capability behaved** — not on the immediate task output — that feedback is a durable upgrade waiting to be captured. But it only compounds if it lands in the capability's *source*, generalized, with the user's sign-off. This skill is the reflex that makes that happen instead of letting the lesson evaporate into a one-off fix.

## When this triggers (proactively)

Fire this skill when, shortly after a skill / MCP / hook / repeatable process ran, the user:

- **requests a change to it** — "nightshift should also post the review to the PR", "make merge-stack rebase automatically";
- **corrects how it behaved** — "you force-pushed without asking — that should never happen, bake it in";
- **flags a recurring gap** — "the review step keeps missing the caller side";
- **says to codify a process** — "remember / incorporate / build this into / make a skill for this".

Do **not** fire it for feedback about the immediate task output (a bug in the code you just wrote, a wrong answer) — that's just finishing the task. The test: **would the feedback apply the next time this same capability runs on a different task?** If yes, it belongs here. If it only matters for the current task, it doesn't.

The trigger is model-recognition, not a hook — so treat any "the tool/process should…" remark as a cue to invoke this skill before moving on.

## What it does

1. **Identify the target capability and its canonical source.**
   - **Public skills** → `github.com/PFalkowski/skills`, locally `C:\src\repos\PFalkowski\skills\<name>`. Many are symlinked into `~/.claude/skills`, so editing the repo file edits the live skill (confirm with `ls -la ~/.claude/skills`).
   - **Vendored / third-party skills** → may symlink elsewhere (e.g. `~/.agents/skills/<name>`). Flag these; don't rewrite upstream content as if it were ours.
   - **MCP servers / hooks / permissions / settings** → `~/.claude/settings.json` or project `.claude/settings.json`. Use the `update-config` skill for those, not this one.
   - **Project-bound lessons** (only true for one repo) → a project memory or a project-local `.claude/skills/` skill, never a public skill.
2. **Distill the feedback into a concrete, minimal, generalized change.** Strip private/project specifics — a public skill must read cleanly for any project: no private absolute paths, no single-repo issue numbers, no sensitive names. Keep the *why* (the failure that earned the rule), not just the *what*.
3. **Decide: edit existing vs. new skill vs. both.** A behavioral tweak to an existing capability → edit it. A distinct, reusable process that stands on its own → a new skill (use `write-a-skill`). Sometimes both — update the existing skill *and* extract a sibling it should cross-link.
4. **Ask the user for permission, showing the proposed change** — name the file(s), summarize the diff, and state whether it's just a local edit, a commit, and/or a push to the public repo. Never modify a skill silently.
5. **Apply + record.** On approval: make the edit; if it's the public skills repo, commit with a clear message. **Push only with explicit confirmation** (public repo = outward-facing). Symlinked skills take effect immediately for the local session.

## Hard rules

1. **Always ask before modifying a skill — show the change first.** Self-modifying behavior without sign-off is precisely what needs a gate; the user decides.
2. **Public skills carry no private specifics.** Generalize examples; move project-bound lessons to memory or a project skill. A reader with no access to any private repo must understand the skill fully.
3. **Minimal, targeted edits.** One piece of feedback → the smallest change that captures it. Don't refactor a whole skill over a one-line note.
4. **Right home wins.** Generalizable behavior → public skill. Project-bound lesson → memory / project skill. Tooling/permission/MCP/hook config → settings via `update-config`. Don't force a project lesson into a public skill, or a config change into prose.
5. **Push is outward-facing — confirm it separately** from the edit. Editing + committing locally is reversible; pushing to public GitHub publishes (and may be cached/indexed even if reverted).
6. **Capture the rationale, not just the rule.** A rule stripped of the failure that motivated it gets deleted by the next editor who never saw that failure.
7. **Don't let the meta-work bury the task.** Capture the improvement, get sign-off, then return to what the user was actually doing.

## Relationship to other skills
- `write-a-skill` — authoring a brand-new skill from scratch; this skill delegates to that pattern when feedback warrants a new skill rather than an edit.
- `update-config` — MCP servers, permissions, hooks, and other `settings.json` changes (not skill prose).
- Project memory — the home for project-bound lessons that don't generalize to a public skill.
