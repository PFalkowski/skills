---
name: statusline
description: 'Installs a Claude Code status line: worktree, branch, model, tokens, rate limits, cost. Use for: cost/tokens/metrics in the status line, footer, or status bar; customizing or debugging the status line; a blank status line; what fields the status line payload contains.'
disable-model-invocation: true
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# Status line

A single-file Node status line for Claude Code. No dependencies, no subprocesses,
degrades to an empty string rather than throwing.

```text
📁 my-repo · 🌿 main · 🌟 Opus 5 (1M context) · xhigh · 🪟 58.8k/1M 6% · ⏳ limit 5h 7% | 7d 27%→169% · 📝 +1/-0 · 🕐 4m37s · $1.07
```

## Install

```bash
node <skill-dir>/scripts/install.mjs
```

Copies `statusline.js` into the Claude Code config dir (`CLAUDE_CONFIG_DIR`, else
`~/.claude`) and adds the `statusLine` block to `settings.json`, backing the file up
first. `--dry-run` to preview, `--force` to replace a different existing status line.

Then **restart Claude Code**. Settings are read at startup, so a session that was
already open when you installed shows no status line at all — that is the single most
common "it doesn't work" report, and it is not a bug in the script. Edits to
`statusline.js` afterwards apply live, because the command re-runs on every render.

## Segments

Every segment is omitted when its data is absent, so a sparse payload degrades cleanly
down to just the model name.

| Segment | Source | Notes |
|---|---|---|
| 📁 worktree · 🌿 branch | `.git`, walked up from cwd | See "Why it reads .git" below |
| 🧠 💡 🌟 🌌 model | `model.id` + `model.display_name` | Icon escalates by tier: Haiku → Sonnet → Opus → Fable |
| effort, ⚡ fast | `effort.level`, `fast_mode` | Effort is absent on models without it |
| 🪟 tokens | `context_window` | `used/size pct`, blue → cyan → yellow → red at 60/80/90 |
| ⏳ limit | `rate_limits` | Both windows, coloured by **burn rate** — see below |
| 📝 churn | `cost.total_lines_{added,removed}` | Hidden until the session edits something |
| 🕐 time | `cost.total_duration_ms` | `8s` → `4m37s` → `2h10m` |
| $ cost | `cost.total_cost_usd` | No icon — the `$` is the icon |

## Rate limits are coloured by pace, not percentage

30% of a weekly quota spent on day 1 projects to 210% and is an emergency; the same 30%
on day 7 is fine. Raw-percentage colouring paints both green and tells you nothing.

`resets_at` is a unix timestamp and the windows are exactly 5h and 7d, so elapsed
fraction is `(length − remaining) / length` and the projection is `used% ÷ elapsed`.
Colour comes from the projection, floored by raw usage so 95% spent stays urgent even
when the window is nearly over. Below 5% elapsed the divisor is tiny and a single
request would project to 400%, so it declines to guess and falls back to raw.

The `→NNN%` projection is printed only when it is both ≥70% and worse than what is
already spent — quiet when you are fine, loud when you are not.

## Customising

`ICONS` at the top of `statusline.js` is a plain table — swap any glyph in one line.
`MODEL_ICONS` is a list of `[regex, glyph]` matched against id and display name joined,
so adding a tier is one entry. `CLAUDE_STATUSLINE_ICONS=0` drops every icon (useful over
ssh, or in a font without emoji fallback).

Photographic icons are not an option worth chasing: a status line is one row, so
half-block characters cap an emoji-width icon at 2×2 pixels. Sixel is supported by
Windows Terminal ≥1.22 but cannot work either — Claude Code measures the footer's visual
width, and sixel bytes have no character width. Only a patched font with private-use
codepoints could carry real image-derived glyphs.

## The payload

Do **not** reverse the payload shape out of the compiled binary — its string table lists
keys non-adjacently, and reading adjacency as structure invents fields that do not exist
while hiding ones that do. Capture ground truth instead: add
`fs.writeFileSync('<path>', raw)` to the stdin handler, let one render fire, read the
JSON, remove the probe. Seconds, and exact.

Verified against Claude Code 2.1.221:

```json
{
  "session_id": "…", "transcript_path": "…", "cwd": "…", "prompt_id": "…",
  "session_name": "…", "version": "2.1.221", "output_style": { "name": "default" },
  "model": { "id": "claude-opus-5[1m]", "display_name": "Opus 5 (1M context)" },
  "effort": { "level": "xhigh" }, "fast_mode": false, "thinking": { "enabled": true },
  "workspace": { "current_dir": "…", "project_dir": "…", "added_dirs": [] },
  "cost": { "total_cost_usd": 0.95, "total_duration_ms": 221802,
            "total_api_duration_ms": 155379, "total_lines_added": 1, "total_lines_removed": 0 },
  "context_window": { "total_input_tokens": 58808, "total_output_tokens": 278,
                      "context_window_size": 1000000, "current_usage": { },
                      "used_percentage": 6, "remaining_percentage": 94 },
  "exceeds_200k_tokens": false,
  "rate_limits": { "five_hour":  { "used_percentage": 7,  "resets_at": 1785880200 },
                   "seven_day":  { "used_percentage": 27, "resets_at": 1786381200 } }
}
```

## Why it reads .git

There is no top-level `worktree` key in an ordinary repo — the payload only carries one
inside a Claude-managed worktree, so a payload-only status line shows no branch most of
the time. The script walks up from cwd and reads `.git` itself: `.git` as a *file* means
a linked worktree, so follow its `gitdir:`; `HEAD` holding `ref: refs/heads/x` gives the
branch, a raw sha means detached. No subprocess, and it handles the unborn-branch case
that `git rev-parse HEAD` fails on outright.

Do not reach for `git rev-parse --abbrev-ref` to shortcut this — the flag is *sticky*
and applies to every rev after it, so `--show-toplevel --abbrev-ref HEAD --short HEAD`
returns the branch name twice instead of a sha.
