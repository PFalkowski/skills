---
name: evolve-skill
description: 'Apply user corrections or process feedback to the source skill or hook so they persist.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# evolve-skill

Apply feedback about a skill, MCP, hook, or process when it should change the capability's next run on a different task. Task-specific feedback stays with the current task. Recognize requests such as “the process should…”, “codify”, or “remember” without requiring a hook.

1. **Locate the source.**
   - Public skill: `github.com/PFalkowski/skills`, locally `…/skills/<name>`. Check `ls -la ~/.claude/skills` for symlinks; editing the repo may edit the live skill.
   - Vendored/third-party source outside this repo: flag it; do not rewrite it as ours.
   - MCP, hooks, permissions, settings: `settings.json` via `update-config`.
   - Project-specific lesson: project memory or `.claude/skills/`, never a public skill.
2. **Distill the smallest general rule and its rationale.** Remove private paths, names, and repo-specific issue numbers. Capture only the requested behavior; avoid invented edge cases or workflow variants. Prefer one sentence over a subsection.
3. **Choose the artifact.** Edit an existing skill for a tweak; use `write-a-skill` for a distinct reusable process; sometimes both.
4. **Show the change and ask before modifying.** Name files, summarize the diff, and distinguish local edit, commit, and push.
5. **Apply and commit.** Check the skills repo's branch first. Branch from the default branch, keep unrelated pending work out, and open a PR. **Push requires separate explicit confirmation.**

Public skills must make sense without private repo access. New logs/state files follow [docs/agent-state.md](../docs/agent-state.md), outside the tree; do not invent another state root. Capture the improvement, get sign-off, and return to the original task.
