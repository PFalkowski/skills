# claude-skills

User-authored Claude Code skills.

## Skills

| Skill | One-liner |
|---|---|
| [nightshift](nightshift/SKILL.md) | Autonomously implement backlog work overnight using TDD (Red→Green→Refactor) per item, with pre-flight grilling and per-item subagent spawn. |

## Layout

Each skill is a directory at the repo root containing at minimum a `SKILL.md` with the frontmatter Claude Code expects (`name`, `description`). Reference docs split into sibling files (e.g. `LOOP.md`, `PREFLIGHT.md`) when `SKILL.md` would exceed ~100 lines.

## Installation

Clone the repo somewhere stable, then expose each skill to Claude Code via a directory junction (Windows) or symlink (macOS/Linux) into `~/.claude/skills/`.

### Windows (PowerShell)

```powershell
git clone https://github.com/PFalkowski/claude-skills C:\src\repos\PFalkowski\claude-skills
New-Item -ItemType Junction `
    -Path "$env:USERPROFILE\.claude\skills\nightshift" `
    -Target "C:\src\repos\PFalkowski\claude-skills\nightshift"
```

### macOS / Linux

```bash
git clone https://github.com/PFalkowski/claude-skills ~/src/claude-skills
ln -s ~/src/claude-skills/nightshift ~/.claude/skills/nightshift
```

Repeat the link command per skill you want active. Removing a link won't delete the source — junctions/symlinks are pointers, not copies.

## Adding a new skill

1. Create `<skill-name>/SKILL.md` with the required frontmatter.
2. Split into reference files if SKILL.md would be over ~100 lines.
3. Junction/symlink into `~/.claude/skills/` to test locally.
4. Commit + push.
