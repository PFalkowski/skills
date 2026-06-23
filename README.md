# skills

Personal Claude Code skills.

## Install

### Option A — Claude Code plugin marketplace (recommended)

Installs the whole set as one Claude Code plugin and keeps it current automatically.

```text
/plugin marketplace add PFalkowski/skills
/plugin install pfalkowski-skills@pfalkowski-skills
```

Claude Code copies the plugin into its own managed cache — no symlinks or hand-maintained copies under `~/.claude/skills/`. Skills are namespaced under the plugin (e.g. `pfalkowski-skills:nightshift`).

### Option B — `skills` CLI

Copies the individual skills into `~/.claude/skills/` and lets you pick which to enable.

```bash
npx skills@latest add PFalkowski/skills
```

The [`skills`](https://github.com/vercel-labs/skills) CLI reads `.claude-plugin/plugin.json`, walks the listed skill directories, and drops the ones you choose into `~/.claude/skills/`.

## Updating

Pick the line that matches how you installed.

```text
# Option A — plugin marketplace: refresh the catalog and pull new versions
/plugin marketplace update
```

No `version` is pinned in the manifest, so every push to this repo counts as a new version. Claude Code's background auto-update picks it up on startup; `/plugin marketplace update` just applies it immediately.

```bash
# Option B — skills CLI: re-pull installed skills
npx skills update            # all installed skills
npx skills update <skill>    # a single skill
```

## Skills

| Skill | One-liner |
|---|---|
| [azure-devops-pr-review](azure-devops-pr-review/SKILL.md) | Review an Azure DevOps (dev.azure.com) pull request from the terminal — resolve the PR, produce a clean merge-base diff with full repo context via a local clone, and post findings back as inline PR comments. Encodes the auth, diff-API, and console-encoding workarounds so they don't have to be rediscovered each time. |
| [bias-to-action](bias-to-action/SKILL.md) | Decide and proceed on low-stakes, reversible, or conventional choices instead of asking. A test (consequential AND hard-to-reverse AND underdetermined → ask; otherwise pick the default, state it in one line, continue), plus escalation on "just progress" / "stop asking". Stops the agent from offloading trivial decisions back onto the user. |
| [handoff-check](handoff-check/SKILL.md) | When you greenlight a big, multi-step task, a fast gate that checks whether the current context is too full or too off-topic to run it well — and only if a clean start clearly wins, recommends a handoff (fresh session or subagent) with a ready-to-paste brief. Suggests only; never auto-spawns or clears. |
| [nightshift](nightshift/SKILL.md) | Autonomously implement backlog work overnight using TDD (Red→Green→Refactor) per item, with pre-flight grilling and per-item subagent spawn. |
| [prompt-backlog](prompt-backlog/SKILL.md) | Prioritized, ordered queue of deferred work — capture anything to do next/later/keep-in-mind. Each item is a self-contained, ready-to-run prompt the agent authors from the live context, plus a Context note (what/who/why) and a log. Triggers on "do this next", "later", "remember to", "keep in mind", etc. Includes the `prompts/` folder convention and an init recipe. |
| [refresh-nuget-repo](refresh-nuget-repo/SKILL.md) | Autonomously refresh a dormant .NET/NuGet library repo — deep review, fix correctness bugs with regression tests, modernize targets/deps/packaging, deprecate-not-break misleading APIs, and set up CI + CD (NuGet Trusted Publishing/OIDC). Checks the published registry first to avoid refreshing a stale tree. The .NET/NuGet specialization of `restomod`. |
| [restomod](restomod/SKILL.md) | Revive a dormant or neglected codebase without breaking its consumers — classic API, modern engine. Deep read-only review → fix correctness bugs with regression tests → modernize the toolchain/deps to a warning-free build → deprecate-don't-break for misleading APIs → ship behind green CI. Language- and registry-agnostic; downstream skills layer ecosystem specifics. |
| [signal-verdict](signal-verdict/SKILL.md) | Take a new trading/ML/quant idea from hypothesis → real-data baseline → TDD → walk-forward benchmark harness → honest PROMOTE/PARK verdict → docs. Falsify-first; data-first; real-data CI gate. |

## Layout

Each skill is a directory at the repo root containing at minimum a `SKILL.md` with the frontmatter Claude Code expects (`name`, `description`). Reference docs split into sibling files (e.g. `LOOP.md`, `PREFLIGHT.md`) when `SKILL.md` would exceed ~100 lines.

`.claude-plugin/plugin.json` lists the skills in the plugin — every new skill must be added there alongside its directory. `.claude-plugin/marketplace.json` is the catalog clients add via `/plugin marketplace add`; it points at the repo root (`source: "./"`), so it needs no per-skill edits.

## Local development (maintainers)

> Installing or updating these skills as a user? See [Install](#install) and [Updating](#updating) above — you don't need any of this.

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
