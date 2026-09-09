---
name: save-tokens
description: 'Spends a session''s tokens on the task: the cheapest subagent tier that fits, noise kept out of the main context, and a one-line call for /clear, /compact, /rewind, a model change or a handoff when it is cheapest. Triggers: a subagent dispatch, a noisy command, a task boundary, "save tokens", "context is filling up".'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# save-tokens

*"Nothing gets sent just once."* Everything in the conversation is sent again on every later turn:
the files read, the command output, the thinking. Cached re-sends cost a tenth of the input price,
output costs about five times input, and the model's price multiplies all of it. Four levers, in the
order they cost: which model, how long the session runs, how much thinking, how much sits in the
context. This skill is the agent's side of Anthropic's guidance in
[Maximizing the value of your Claude Code sessions](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions)
and [Choosing a Claude model and effort level](https://claude.com/blog/claude-model-and-effort-level-in-claude-code).

Two kinds of fix, and the split is the point. Some the agent applies itself, this turn, with the
tools it has. The rest are slash commands and settings only the user can run: an agent cannot
`/clear`, `/compact`, `/rewind` or `/model`. For those its job is to say the exact command at the
moment it is cheapest, in one line, and get on with the work.

## What the agent does itself

### Send each job to the cheapest tier that does it

Set `model` on every subagent dispatch. An unset subagent runs on whatever the main session runs on,
which is usually the most expensive tier available, and a grep does not need it.

| Tier | The job smells like | Examples |
|---|---|---|
| `haiku` | Read-only discovery, mechanical, verifiable by grep or build alone | find the callers of X, a rename sweep, a version bump, formatting, a commit message, summarising a log |
| `sonnet` (default) | Normal engineering: a localised change plus its tests | a bug with a repro, a small feature in an existing pattern, new test coverage, a refactor inside one module |
| `opus`, or `fable` where offered | Cross-cutting reasoning where a wrong design costs more than the tier premium, and anything adversarial | plan review, security review, a concurrency bug with no repro, a public API, grading another agent's diff |

When torn, take the lower tier: a failed attempt escalates one tier on retry, once, which is cheaper
than over-provisioning every job. Effort follows tier. Pick once at dispatch and never move a running
subagent. The same rubric applied to shipping is in [`go-go-go`](../go-go-go/SKILL.md).

When a result comes back wrong, the two questions decide which dial: *it had the context, clearly
tried, and still got it wrong* is a bigger model; *it skipped a file, did not run the tests, or
stopped part-way* is more effort on the same model. Routine work for a while on the big tier is the
signal to drop down at the next boundary.

### Keep noise out of the context that thinks

Command output is appended like a file and re-sent every turn after. Output over 30,000 characters
is spilled to a file automatically and only a preview stays (`BASH_MAX_OUTPUT_LENGTH` moves the
line); the expensive band is everything just under it, such as a test runner printing 400 passing
lines one at a time.

- Quiet flags first: `--reporter=dot`, `-q`, `--quiet`, `--no-pager`, `--stat` instead of the full
  diff, `-n 20` on a log.
- Then filter: `tail -n 30`, `grep -E 'FAIL|error'`, or redirect the whole output to a scratch file
  and read only the lines that matter.
- A job that produces a lot of output the session does not need to keep (reading a log, a sweep
  across many files, a long build) goes to a subagent, and only its answer comes back. A two-line job
  does not: a subagent re-reads what the session already had, and for small work that overhead is
  the whole cost.
- Once the right quiet invocation is known for a command the project runs all day, propose the
  one-line addition to `CLAUDE.md`, written the way the user would type it (*run one test file:
  `npx vitest run <file> --reporter=dot`*). It saves a turn and a few hundred lines in every session
  after. If the user would rather not leave quieting to the agent at all, a `PreToolUse` hook on
  `Bash` can rewrite a noisy command before it runs by returning
  `hookSpecificOutput.updatedInput.command` ([hooks reference](https://code.claude.com/docs/en/hooks));
  offer to add it to `settings.json`.

### Read what the task needs, once

- Grep before Read. Read with an offset and limit when the region is known. Never re-read a file
  already in the context, and never cat a file back to verify an edit the tool already confirmed.
- When the next step is a search the user could short-cut, say so: one @-mention in their next prompt
  attaches the file to the request with no Read call, where "the tests are failing" costs a grep or
  two and several opened files that stay in the context for the rest of the session. A file already
  in the context is not mentioned again; a second mention attaches a second copy.
- Answer from the transcript before running anything. Re-deriving a fact that is already in the
  conversation spends output tokens, the expensive kind.

### Write less

Thinking, tool calls and prose are all output. The final message is short, points at files and
output instead of pasting them, and does not restate what was done.

## What the agent recommends, and when

One line at the trigger, with the exact command, then back to work. Once per boundary; if the user
declines, drop it for that task. Noise trains the user to ignore it.

| Trigger | Say |
|---|---|
| The next request is a different task from the conversation so far | "`/clear` first (`/rename` before it if you want this session back): the last N turns are about X and would ride along every turn." |
| A milestone closed and what came before it is dead weight now (PR open, bug found, phase done) | "`/compact keep: the goal, the decision on X, paths A and B; drop: the debugging of Y`", with the keep and drop lines written out. When the same things must survive every compaction, a standing *when compacting, keep…* line in `CLAUDE.md` does it once, and a `SessionStart` hook matched on `compact` can re-inject a short brief after each one. On a 1M-context model, `/autocompact 200k` puts the safety net back where it was, so turns stop re-sending half a million tokens. |
| The user is stepping away, or says so | "`/compact` before you go: the cache expires after an hour on a subscription and five minutes on an API key, and summarising is much cheaper while the conversation is still cached." |
| The last few turns went somewhere not worth keeping | "`/rewind` to before them, not `/compact`: rewinding cuts turns off the end and costs nothing, compacting rewrites everything and always costs." |
| A big task is greenlit in a context that is full or mostly about something else | Ask: *if this task restarted in a clean session, how much of this conversation would be re-read?* Little, and the state fits a short note: write it with [`handoff`](../handoff/SKILL.md) and recommend a fresh session, or a subagent when the job is fire-and-forget. Entangled state: `/compact` instead. Never clear, compact or spawn on the user's behalf. |
| The tier is wrong for the stretch ahead | Recommend `/model` or `/effort`, at a boundary only. Both are part of the cache key, so a switch mid-conversation re-prefills the whole conversation at full price; right after `/clear` or `/compact` it is nearly free. For a session that is known to be grunt work: `MAX_THINKING_TOKENS=0 claude` (no effect on Fable). |
| A `/loop` or scheduled prompt is being set up in a long session | "Run it from a fresh session in another terminal: each firing is a full turn carrying this whole conversation, and after an hour idle it is a cache miss on top." |
| A fresh session, or MCP tools sit unused in the tool list, or `CLAUDE.md` carries workflow prose | "`/context` shows what is loaded before you type. `/mcp disable <server>` turns a server off for this session. Workflow instructions move from `CLAUDE.md` into skills, which load only when used." Offer the `CLAUDE.md` edit. |
| The same noisy job is handed off again and again | Offer a subagent definition in `.claude/agents/<name>.md` with `model: haiku` (or `sonnet`); without one it runs on the main session's model. |

`/model` and `/effort` remember the last choice as the next session's default. Worth saying once: run
both in a fresh session to see what is actually set.

## Signals the agent can see

There is no gauge on the agent's side. There is: a persisted-output marker (an output just spilled);
a run of large tool results on a topic that is finished; the user's next prompt on an unrelated
subject; "brb", "back tomorrow"; a summary notice from an auto-compact; a tool list full of MCP tools
nobody has called. Those are the triggers above. The user has the gauge: a status line with the
context percentage ([`statusline`](../statusline/SKILL.md)), `/context`, and `/usage` (`/cost` is its alias).

## Anti-patterns

- Narrating the cost model. The user wanted the work; the suggestion is one line.
- Suggesting `/compact` every few turns, or again after the user declined.
- A subagent for a two-line job.
- `model` left unset on a subagent, so a grep runs on the strongest tier.
- Switching `/model` mid-conversation for one hard question and back. Each switch re-prefills
  everything, so that is twice.
- @-mentioning a file that is already in the context.
- Running the full suite unfiltered to check one test.
- "Turn off telemetry to save tokens." `DISABLE_TELEMETRY` and its relatives change background
  traffic, not tokens.

## Relationship to sibling skills

- [`handoff`](../handoff/SKILL.md) writes the note once this skill decides a fresh context wins.
- [`reflect`](../reflect/SKILL.md) token-boxes one obstacle; this skill boxes the session.
- [`whatever`](../whatever/SKILL.md): a compaction suggestion is a stated default with a cheap veto,
  not a question.
- [`go-go-go`](../go-go-go/SKILL.md) and [`nights-watch`](../nights-watch/TRIAGE.md) apply the tier
  rubric to shipping and to tickets.
- [`statusline`](../statusline/SKILL.md) puts the numbers on screen.

To make this standing rather than on request, one line in `CLAUDE.md`: *run `save-tokens` before
each subagent dispatch and at every task boundary.*
