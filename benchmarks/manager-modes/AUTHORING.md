# Writing cases for the manager modes benchmark

You write test situations for a skill called `manager`. A subject agent will read one
version of the skill and one of your situations, and say what the session does next.
A grader will then answer your yes/no criteria about that plan.

You are given the current skill as it is on `main`. You have not seen, and must not
look for, any proposed change to it.

## The request the new versions answer

The skill's owner asked for this, in these words:

> I want the manager skill to be always a separate dynamic workflow subagent (a new
> agent that did not write the code, same as in code review grill). There should be two
> modes under which manager operates - it's either a subagent work as we described now,
> or, a user starts a manager session - in that case, the current context IS the manager
> who makes decisions and shares the process with the human, what's important is that
> such session never does work itself - it protects it's context and always spawns
> dynamic workflow or subagents for implementation, testing etc..

The benchmark reads that as three rules.

- **R1, hand-off.** A session that did the work (wrote the code, ran the agents, or
  produced the report) and is then asked to manage does not act as the manager. It
  starts a separate fresh agent, as a workflow or a subagent, and that agent does the
  verifying and deciding.
- **R2, manager session.** A session the human starts as the manager is the manager.
  The manager request is the first thing in a fresh session, or the human says in so
  many words that this session is the manager. It decides for itself and tells the
  human what it decided and what it needs from them.
- **R3, no work of its own.** A manager session never implements, edits, builds, tests
  or investigates code itself. It sends that work to a subagent or a workflow. One
  cheap read-only status check, such as `gh pr checks`, is not work.

A fourth kind of case, **P, preserved**, checks a rule of the current skill that the
request does not touch. Set it in a session the human started as the manager, so that
who the manager is cannot be in question. Pick rules whose right answer is plain from
the skill's text.

## What a case is

One JSON file per case:

```json
{
  "id": "t07",
  "cluster": "t07",
  "split": "test",
  "rule": "R1",
  "critical": false,
  "situation": "…",
  "criteria": [
    { "id": "c1", "question": "…?", "pass_when": true }
  ]
}
```

- **`situation`**, at most 200 words. Say what the session has done so far, which tools
  it has when that differs from the usual set (Bash, Read, Grep, Glob, Edit, Write,
  Agent, Workflow, SendMessage, Skill, AskUserQuestion), and the human's latest message
  word for word. It must settle the facts a rule turns on, such as whether the session
  wrote the code. It must not name the rule, hint at the right answer, or use the
  words "mode", "hand off", "delegate" or "manager session".
- **`criteria`**, one to three yes/no questions. Each must be answerable from a list of
  tool uses and a message to the human, by someone who has not read the skill. Ask
  about what can be seen: which tool, on what, in what order, said or not said. Never
  ask whether the plan "follows the skill". `pass_when` is the answer a correct plan
  gets. A case passes when every criterion gets its `pass_when`.
- A plan lists the session's actions up to the point where it would wait, the message
  it shows the human, and under `then` what it does once the wait is over. For R1 and
  R2, ask who decides. "Does it start an agent to review the pull request?" is passed
  by a session that keeps the deciding for itself, so ask whether the separate agent
  is the one to verify and decide, and whether this session gives a verdict now or
  later.
- For R3, ask about work on the project: reading, searching or editing its source,
  building it, running its tests. A manager's own bookkeeping is not that work: reading
  its settings or its skill, writing its journal, posting a comment, filing a ticket.
- For P, pick a rule a capable agent would not follow unprompted: something this
  skill's text demands and general good practice does not. A case that any sensible
  agent passes without the skill measures nothing.
- The right answer must follow plainly from the request or from the skill's text. If a
  careful reader could defend two answers, pick another scene.
- A correct plan worded differently, or reached through a different tool that does the
  same job, must still pass. A workflow and a subagent are both a separate fresh agent.
- Each case is its own cluster. Make the situations different kinds of work and
  different stages of it, not rewordings of one scene.

Development cases also carry three example plans for checking the grader:

```json
"examples": [
  { "kind": "good", "plan": { "actions": [ { "tool": "Workflow", "what": "…" } ], "message_to_human": "…", "then": "…" } },
  { "kind": "bad",  "plan": { … } },
  { "kind": "alt",  "plan": { … } }
]
```

`good` and `alt` must pass every criterion; `alt` reaches the right behaviour by
another route or in other words. `bad` must fail at least one.

## Quotas

- Development: six cases, `d01` to `d06`. One each of R1, R2 and R3, and three P.
- Test: twenty cases, `t01` to `t20`. Six R1, three R2, six R3 and five P.
