# skills

Personal Claude Code skills.

## Install

```bash
npx skills@latest add PFalkowski/skills
```

The installer (the [`skills`](https://www.npmjs.com/package/skills) CLI used by the wider Claude Code skills ecosystem) reads `.claude-plugin/plugin.json`, lets you pick which skills to enable, and drops them into `~/.claude/skills/` for any agent you select.

## Skills

| Skill | One-liner |
|---|---|
| [azure-devops-pr-review](azure-devops-pr-review/SKILL.md) | Review an Azure DevOps (dev.azure.com) pull request from the terminal — resolve the PR, produce a clean merge-base diff with full repo context via a local clone, and post findings back as inline PR comments. Encodes the auth, diff-API, and console-encoding workarounds so they don't have to be rediscovered each time. |
| [nightshift](nightshift/SKILL.md) | Autonomously implement backlog work overnight using TDD (Red→Green→Refactor) per item, with pre-flight grilling and per-item subagent spawn. |
| [prompt-backlog](prompt-backlog/SKILL.md) | Dead-simple ordered list of prompts to feed to an agent verbatim — status header + prompt fence + log per item. Includes the `prompts/` folder convention and an init recipe. |
| [refresh-nuget-repo](refresh-nuget-repo/SKILL.md) | Autonomously refresh a dormant .NET/NuGet library repo — deep review, fix correctness bugs with regression tests, modernize targets/deps/packaging, deprecate-not-break misleading APIs, and set up CI + CD (NuGet Trusted Publishing/OIDC). Checks the published registry first to avoid refreshing a stale tree. |
| [signal-verdict](signal-verdict/SKILL.md) | Take a new trading/ML/quant idea from hypothesis → real-data baseline → TDD → walk-forward benchmark harness → honest PROMOTE/PARK verdict → docs. Falsify-first; data-first; real-data CI gate. |

## Layout

Each skill is a directory at the repo root containing at minimum a `SKILL.md` with the frontmatter Claude Code expects (`name`, `description`). Reference docs split into sibling files (e.g. `LOOP.md`, `PREFLIGHT.md`) when `SKILL.md` would exceed ~100 lines.

`.claude-plugin/plugin.json` is the manifest the installer reads. Every new skill must be added there alongside its directory.

## Local development

When iterating on a skill in this repo and you want Claude Code to pick up your in-progress edits without re-running the installer:

### Windows (PowerShell)

```powershell
New-Item -ItemType Junction `
    -Path "$env:USERPROFILE\.claude\skills\nightshift" `
    -Target "C:\src\repos\PFalkowski\skills\nightshift"
```

### macOS / Linux

```bash
ln -s ~/src/skills/nightshift ~/.claude/skills/nightshift
```

Removing a junction/symlink doesn't delete the source — they're pointers, not copies.

## Adding a new skill

1. Create `<skill-name>/SKILL.md` with the required frontmatter (`name`, `description`).
2. Split into reference files if SKILL.md would exceed ~100 lines.
3. Add `"./<skill-name>"` to the `skills` array in `.claude-plugin/plugin.json`.
4. Junction/symlink into `~/.claude/skills/` to test locally.
5. Commit + push.

## License

MIT — see [LICENSE](LICENSE).
