---
name: save-tokens
description: 'Spends a session''s tokens on the task: the cheapest subagent tier that fits, noise kept out of the main context, and a one-line call for /clear, /compact, /rewind, a model change or a handoff when cheapest. Triggers: a subagent dispatch, a noisy command, a task boundary, "save tokens", "what is eating my tokens".'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# save-tokens

The agent's side of Anthropic's
[Maximizing the value of your Claude Code sessions](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions)
and [Choosing a Claude model and effort level](https://claude.com/blog/claude-model-and-effort-level-in-claude-code).
Two kinds of fix: what the agent applies itself, this turn, with the tools it has, and the slash
commands and settings only the user can run. An agent cannot `/clear`, `/compact`, `/rewind` or
`/model`; for those it says the exact command at the moment it is cheapest, in one line, and gets
on with the work.

## Settings worth checking once

Session-level advice is spent every session; these are set once and then hold. Check them the first
time this skill runs in a machine's config, or when the user asks what is eating their tokens. Say
what is unset in one line with the value to set, and move on. Do not re-offer what is already set.

`/context` shows what is loaded before a prompt is typed. `/usage` attributes recent usage to
individual skills, subagents, plugins and MCP servers, and flags any behaviour that is 10% or more
of the total. Prefer both over reasoning about the config from what is on disk.

| Check | If unset | Why |
|---|---|---|
| `CLAUDE_CODE_SUBAGENT_MODEL` in `settings.json` `env` | Set it to `sonnet` | An unset subagent inherits the **main session's** model, so every worker in an Opus session bills at Opus. A per-dispatch `model` still overrides it, so adversarial phases keep the strong tier. |
| A plugin enabled at user scope but used in one or two projects | Disable it in user settings, enable it per project | A plugin loads its skills **and** its MCP server into every session in every repository. One measured at 3,721 tokens per turn in repositories that never called it. |
| An MCP server that fails to connect | Remove it with `claude mcp remove <name> -s user` | It costs a failed connection attempt every session, and its error banner hides real MCP problems. |
| `bashOutputMaxChars` | Measure before changing it | Anything above the cap spills to a file and only a preview stays. Lowering it pays only if the preview is usually enough: a spill the agent has to read back costs a whole extra turn carrying the whole context, which is far more than the characters saved. |
| A command whose noisy form runs all day | A `PreToolUse` hook on `Bash`, or a filtering CLI | Quieting at the source beats capping the tail. The tail is rare; the volume is in the many small outputs. |

Measuring a machine's fixed per-turn cost, when a number is needed rather than a guess: run
`claude -p "reply with exactly: ok"` in the target repository, then take the smallest
`cache_read + cache_creation + input` of any assistant turn in the newest transcript under
`~/.claude/projects/<encoded-cwd>/`. Change one thing and run it again; the difference is that
thing's cost. `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` and
`--settings '{"enabledPlugins":{"<name>":false}}'` toggle a component without editing anything on
disk. Runs minutes apart differ by a few hundred tokens as the git status snapshot changes, so treat
that as the noise floor.

## What the agent does itself

### Send each job to the cheapest tier that does it

Set `model` on every subagent dispatch. An unset subagent inherits the main session's model unless
`CLAUDE_CODE_SUBAGENT_MODEL` says otherwise, and a grep does not need the strongest tier.

| Tier | The job smells like | Examples |
|---|---|---|
| `haiku` | Read-only discovery, mechanical, verifiable by grep or build alone | find the callers of X, a rename sweep, a version bump, formatting, a commit message, summarising a log |
| `sonnet` (default) | Normal engineering: a localised change plus its tests | a bug with a repro, a small feature in an existing pattern, new test coverage, a refactor inside one module |
| `opus`, or `fable` where offered | Cross-cutting reasoning where a wrong design costs more than the tier premium, and anything adversarial | plan review, security review, a concurrency bug with no repro, a public API, grading another agent's diff |

When torn, take the lower tier. Before retrying a tier up, re-read the brief: a vague brief fails at
every tier, and a haiku brief must say exactly what to do and what to return. Then the two questions
decide the dial: *it had the context, clearly tried, and still got it wrong* is a bigger model; *it
skipped a file, did not run the tests, or stopped part-way* is more effort. Effort stays at the
model's default; `effort:` exists only in a subagent definition file, for a job that recurs. A failed
attempt escalates one tier on retry, once.

### Keep noise out of the context that thinks

Output over 30,000 characters is spilled to a file automatically and only a preview stays
(`BASH_MAX_OUTPUT_LENGTH` or the `bashOutputMaxChars` setting moves the line); the expensive band is
everything just under it, such as a test runner printing 400 passing lines one at a time.

- Quiet flags first: `--reporter=dot`, `-q`, `--quiet`, `--no-pager`, `--stat` instead of the full
  diff, `-n 20` on a log.
- Then filter: `tail -n 30`, `grep -E 'FAIL|error'`, or redirect the whole output to a scratch file
  and read only the lines that matter.
- A job that produces a lot of output the session does not need to keep (reading a log, a sweep
  across many files, a long build) goes to a subagent, and only its answer comes back. A two-line job
  does not: a subagent re-reads what the session already had, and for small work that overhead is
  the whole cost.
- Waiting is not a loop of turns. Each poll is a full turn carrying the whole context; use a
  background task's completion notice or a `Monitor`, and do other work meanwhile.

### Read what the task needs, once

- Grep before Read. Read with an offset and limit when the region is known. Never re-read a file
  already in the context, and never cat a file back to verify an edit the tool already confirmed.
- Answer from the transcript before running anything; never re-derive a fact that is already in the
  conversation.

### Write less

The final message is short, points at files and output instead of pasting them, and does not
restate what was done.

## What the agent recommends, and when

One line at the trigger, with the exact command, then back to work. Once per boundary; if the user
declines, drop it for that task. Noise trains the user to ignore it. The signals the agent can see:
a persisted-output marker (an output just spilled), a run of large tool results on a topic that is
finished, the user's next prompt on an unrelated subject, an auto-compact summary, a tool list full
of MCP tools nobody has called. The user has the gauge: a status line with the context percentage
([`statusline`](../statusline/SKILL.md)), `/context`, and `/usage` (`/cost` is its alias).

| Trigger | Say |
|---|---|
| The next request is a different task from the conversation so far | "`/clear` first (`/rename` before it if you want this session back): the last N turns are about X and would ride along every turn." |
| A milestone closed and what came before it is dead weight now (PR open, bug found, phase done) | "`/compact keep: the goal, the decision on X, paths A and B; drop: the debugging of Y`", with the keep and drop lines written out. When the same things must survive every compaction, a `# Compact instructions` section in `CLAUDE.md` says it once, and a `SessionStart` hook matched on `compact` can re-inject a short brief after each one. On a 1M-context model, `/autocompact 200k` (v2.1.221+) puts the safety net back where it was. |
| The user is stepping away for a while, or says so | "`/compact` before you go: the cache expires after an hour on a subscription and five minutes on an API key, and summarising is much cheaper while the conversation is still cached." On an API key, `promptCacheTtl: 1h` in settings (or `ENABLE_PROMPT_CACHING_1H=1`) makes breaks under an hour free. |
| The last few turns went somewhere not worth keeping | "`/rewind` to before them, not `/compact`: rewinding cuts turns off the end and costs nothing, compacting rewrites everything and always costs." |
| A big task is greenlit in a context that is full or mostly about something else | Ask: *if this task restarted in a clean session, how much of this conversation would be re-read?* Little, and the state fits a short note: write it with [`handoff`](../handoff/SKILL.md) and recommend a fresh session, or spawn a subagent with the note when the job is fire-and-forget. Entangled state: `/compact` instead. Never clear or compact on the user's behalf; a fresh session is theirs to start. |
| The tier is wrong for the stretch ahead: routine work on the strongest model, or the model clearly tried with full context and still failed | Recommend `/model` or `/effort`, at a boundary only. A model switch re-prefills the whole conversation at full price, and an effort switch does too on most models (not on Fable 5.1); right after `/clear` or `/compact` it is nearly free. Both remember the last choice as the next session's default. For a session that is known to be grunt work: `MAX_THINKING_TOKENS=0 claude` (no effect on Fable). |
| The agent had to search for the file the user meant | Once, after the search: "@-mention the file next time; it is attached to the message with no Read call. Once per conversation: a second mention attaches a second copy." |
| A `/loop`, or a reminder or cron task in this session, is being set up in a long session | "Run it from a fresh session in another terminal: each firing is a full turn carrying this whole conversation, and after an hour idle it is a cache miss on top." A `/schedule` routine runs in the cloud and is exempt. |
| A fresh session, or MCP tools sit unused in the tool list, or `CLAUDE.md` carries workflow prose | "`/context` shows what is loaded before you type; `/model` and `/effort` show what is set. `/mcp disable <server>` turns a server off for this session. Workflow instructions move from `CLAUDE.md` into skills, which load only when used." Offer the `CLAUDE.md` edit. |
| The right quiet invocation is now known for a command the project runs all day | Propose the one-line `CLAUDE.md` addition, written the way the user would type it (*run one test file: `npx vitest run <file> --reporter=dot`*); it saves a turn and a few hundred lines in every session after. If the user would rather not leave quieting to the agent at all, a `PreToolUse` hook on `Bash` can rewrite a noisy command before it runs by returning `hookSpecificOutput.updatedInput.command` ([worked example](https://code.claude.com/docs/en/costs#offload-processing-to-hooks-and-skills)); offer to add it to `settings.json`. |
| The same noisy job is handed off again and again | Write a subagent definition in `.claude/agents/<name>.md` with `model: haiku` (or `sonnet`) and say so in one line; without one it runs on the main session's model. |

## Anti-patterns

- Narrating the cost model. The user wanted the work; the suggestion is one line.
- Suggesting `/compact` every few turns, on "be right back", or again after the user declined.
- A subagent for a two-line job.
- `model` left unset on a subagent, so a grep runs on the strongest tier.
- Switching `/model` mid-conversation for one hard question and back. Each switch re-prefills
  everything, so that is twice.
- Asking the user which file instead of grepping. Grep now; the @-mention tip comes after, once.
- @-mentioning a file that is already in the context.
- Running the full suite unfiltered to check one test.

## Relationship to sibling skills

- [`handoff`](../handoff/SKILL.md) writes the note once this skill decides a fresh context wins. The
  gate above supersedes the archived `handoff-check`.
- [`reflect`](../reflect/SKILL.md) token-boxes one obstacle; this skill decides what each token buys.
- [`whatever`](../whatever/SKILL.md): a compaction suggestion is a stated default with a cheap veto,
  not a question.
- [`nights-watch`](../nights-watch/TRIAGE.md) applies the tier rubric to tickets and
  [`manager`](../manager/SKILL.md) dispatches by it; [`go-go-go`](../go-go-go/SKILL.md) keeps its
  own table for shipping.
- [`statusline`](../statusline/SKILL.md) puts the numbers on screen.
