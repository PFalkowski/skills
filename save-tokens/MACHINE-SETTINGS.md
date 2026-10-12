## Settings worth checking once

Session-level advice is spent every session; these are set once and then hold. Check them the first
time this skill runs in a machine's config, when the user asks what is eating their tokens, or when a
session's first turn already carries a large prefix. Say what applies in one line with the value to
set, and move on. Do not re-offer what is already set. Settings are the user's call: suggest, and
change nothing without their yes.

Read the machine before changing it. On a subscription plan `/usage` attributes recent usage to
individual skills, subagents, plugins and MCP servers, and flags any behaviour at 10% or more of the
total; on an API key or a cloud provider there is no attribution panel. `/insights` answers a
different question - how the work goes rather than what it cost - reporting friction such as
misunderstood requests and buggy code across up to 200 previously unseen sessions per run, written
to `~/.claude/usage-data/report.html`. Both read local session history only, so the figures are
estimates and other machines are not included.

| Check | Do | Why |
|---|---|---|
| `CLAUDE_CODE_SUBAGENT_MODEL` in `settings.json` `env` | Set it to the house worker tier from `CLAUDE.md` | An unset subagent inherits the **main session's** model, so every worker in a session on the strongest tier bills at it. From v2.1.251 a per-dispatch `model`, and a definition's own `model:`, take precedence over it, so adversarial phases keep the strong tier; before that version the variable overrode both. It does not move the built-in `Explore` and `Plan` agents, which still inherit the main model - give `Explore` a user-scope definition with the worker tier's `model:` and `effort: low` to cover them. |
| A plugin enabled at user scope but used in one or two projects | Disable it in user settings; enable it in that project's `.claude/settings.local.json` | A plugin loads its skills **and** its MCP server into every session in every repository. One measured at 3,721 tokens per turn in repositories that never called it. The key is `plugin-name@marketplace-name`; a bare plugin name is silently ignored. `.claude/settings.json` is shared with everyone in the repository, so a personal choice belongs in the local file instead. |
| An MCP server that fails to connect | `claude mcp list`, then `claude mcp remove <name>` | It costs a failed connection attempt every session, and its error banner hides real MCP problems behind it. With no `-s` the command removes the server from whichever scope it lives in; `-s user` fails outright on a project- or local-scoped one. |
| A built-in tool, connector or MCP server the user never calls | Name the lever that removes it: `permissions.deny` on the tool (`"Artifact"`), disconnect the claude.ai connector, or `claude mcp remove` | Every eager tool schema rides in every request. The `Artifact` tool measured about 10,900 tokens, and a deny rule drops its schema, not just its calls. Leave tool search on: turning it off added about 26,000. |
| `CLAUDE.md` carries workflows, history or rationale, or a skill description runs past one short sentence | Offer the trim: `CLAUDE.md` keeps only what binds every session, and a description says what and when in one sentence | Both load in every request, whether or not the session needs them. |
| `bashOutputMaxChars` (v2.1.261+) | Measure before changing it | Anything above the cap spills to a file and only a preview stays. The default is 30,000 characters, and the value is clamped into 4,000-128,000. Lowering it pays only if the preview is usually enough: a spill the agent has to read back costs a whole extra turn carrying the whole context, far more than the characters saved. |

Measuring a machine's fixed per-turn cost, when a number is needed rather than a guess: run the
probe below in the target repository, then take the smallest `cache_read + cache_creation + input`
of any assistant turn in the newest transcript under `~/.claude/projects/<encoded-cwd>/`. Change one
thing, run it again, and the difference is that thing's cost. The prompt goes first, because
`--mcp-config` takes a space-separated list and otherwise swallows it:

```bash
claude -p "reply with exactly: ok" --strict-mcp-config --mcp-config '{"mcpServers":{}}'
claude -p "reply with exactly: ok" --settings '{"enabledPlugins":{"<plugin>@<marketplace>":false}}'
```

Neither form edits anything on disk. `claude -p` has no `Artifact` tool, and an interactive session's
first turn goes out before MCP servers connect, so measure the tool in an interactive session and
MCP with `-p`. Runs minutes apart can differ by a few hundred tokens as the
git status snapshot changes, so treat that as the noise floor.
