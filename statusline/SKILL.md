---
name: statusline
description: 'Install, customize or debug a Claude Code status line for branch, model, tokens, limits and cost.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Status line

Single-file Node status line for Claude Code: no dependencies/subprocesses; errors yield an empty string.

## Install

```bash
node <skill-dir>/scripts/install.mjs
```

Copies `statusline.js` into `CLAUDE_CONFIG_DIR` or `~/.claude`, backs up `settings.json`, and adds `statusLine`. Use `--dry-run` to preview; `--force` to replace another status line.

**Restart Claude Code** to load settings. Subsequent `statusline.js` edits apply live on each render.

## Segments

Absent data omits its segment; sparse payloads can show only the model.

| Segment | Source | Behavior |
|---|---|---|
| Worktree/branch | Walk upward from cwd to `.git` | Follow file-form `gitdir:` for linked worktrees |
| Model | `model.id` + `model.display_name` | Tier icons: Haiku → Sonnet → Opus → Fable |
| Effort/fast | `effort.level`, `fast_mode` | Effort only where supported |
| Tokens | `context_window` | Used/size/percent; blue → cyan → yellow → red at 60/80/90% |
| Limits | `rate_limits` | 5h and 7d windows, colored by projected usage |
| Churn | `cost.total_lines_{added,removed}` | Hidden until edits occur |
| Time | `cost.total_duration_ms` | `8s`, `4m37s`, `2h10m` |
| Cost | `cost.total_cost_usd` | Dollar sign doubles as icon |

For rate limits, `resets_at` is Unix time. Elapsed fraction = `(window length − remaining) / window length`; projected usage = `used% / elapsed`. Color uses the greater of projection and raw usage. Below 5% elapsed, use raw usage to avoid unstable projections. Display `→NNN%` only when projection is ≥70% and exceeds raw usage.

## Customize and debug

Edit the `ICONS` table. `MODEL_ICONS` contains `[regex, glyph]` entries matching joined ID/display name. Set `CLAUDE_STATUSLINE_ICONS=0` to disable icons.

Photographic icons need a patched font/private-use codepoints: one-row half-block graphics give only 2×2 pixels at emoji width, and sixel (even on Windows Terminal ≥1.22) has no character width for Claude Code's footer measurement.

Capture actual stdin to learn payload shape: temporarily add `fs.writeFileSync('<path>', raw)` to the handler, render once, read JSON, remove probe. Do not infer structure from adjacent compiled-binary strings; keys are non-adjacent.

Payload verified on Claude Code 2.1.221:

```json
{
  "session_id": "…", "transcript_path": "…", "cwd": "…", "prompt_id": "…",
  "session_name": "…", "version": "2.1.221", "output_style": {"name": "default"},
  "model": {"id": "claude-opus-5[1m]", "display_name": "Opus 5 (1M context)"},
  "effort": {"level": "xhigh"}, "fast_mode": false, "thinking": {"enabled": true},
  "workspace": {"current_dir": "…", "project_dir": "…", "added_dirs": []},
  "cost": {"total_cost_usd": 0.95, "total_duration_ms": 221802,
    "total_api_duration_ms": 155379, "total_lines_added": 1, "total_lines_removed": 0},
  "context_window": {"total_input_tokens": 58808, "total_output_tokens": 278,
    "context_window_size": 1000000, "current_usage": {},
    "used_percentage": 6, "remaining_percentage": 94},
  "exceeds_200k_tokens": false,
  "rate_limits": {"five_hour": {"used_percentage": 7, "resets_at": 1785880200},
    "seven_day": {"used_percentage": 27, "resets_at": 1786381200}}
}
```

Ordinary repos have no top-level `worktree` payload key; only Claude-managed worktrees do. Read `.git` directly: `HEAD`'s `ref: refs/heads/x` yields the branch; raw SHA means detached. This avoids subprocesses and handles unborn branches, where `git rev-parse HEAD` fails.

Avoid combining `git rev-parse --abbrev-ref` with later revisions: the flag is sticky, so `--show-toplevel --abbrev-ref HEAD --short HEAD` returns the branch twice, not a SHA.
