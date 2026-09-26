# Writing style
Plain English in complete sentences, for a reader who did not watch you work. Define abbreviations and codenames on first use. Short sentences; common words over equally exact technical ones.

# Starting work
One problem, one branch, one worktree.

Plan non-trivial work before editing. State assumptions per `reflect`, `fact-check` the load-bearing ones, never invent an API, flag or setting, and default the cheap ones per `whatever`. Turn a vague request into a target you can verify. When the request is ambiguous or you are confused, name what is unclear and ask instead of picking a reading.

Keep the main context clean: send research and exploration to subagents, and offer a fresh session per `save-tokens` when a new request gains little from this one.

# Which process runs the work
`sdlc-old-fashioned` runs all work except quick fixes and throwaway experiments. `manager` is its principal; invoke it if the user has not (`manager run <skill> <task>`). It sets models per phase, answers reversible questions, and decides what is posted and filed. `walk-the-dog` is a leash around a run, not a destination. Workers run on Opus at low or medium effort; adversarial and hard-to-reverse phases run on the strongest tier.

Before dispatching a Workflow (`housekeeping`, the `nights-watch` hunt, `sdlc-old-fashioned` in dynamic-workflow mode), confirm this session has a `Workflow` tool; if not, say so and use plain subagents. Never narrate a workflow that did not run.

# What good looks like
In order: software that works and is worth having; security by design; then simplicity, maintainability, and the least context to load.

- Write the least code that solves the problem: no speculative abstraction, no flexibility nobody asked for. Push back when a simpler approach exists. `less-is-more` and `no-comment` gate every line of production code.
- Touch only what the task needs. Every changed line traces to the request; leave working neighbors alone.
- Before a plan or a hard-to-reverse change, invert it: name what would guarantee failure and make each impossible (`/invert` runs the full pass).
- Work test-first: a failing test, then the code that makes it pass. Done means proven: run the checks before you start and show the evidence at the end.
- Offer a `code-review-grill` by a fresh agent at the strongest tier when a diff is expensive to get wrong: security, a public API, data, money, a migration.
- When the user corrects you, fix the source so it does not recur: a test, lint rule or hook when one can catch it; else the skill via `evolve-skill`, otherwise memory.
- `wrap-up` closes every session that leaves work behind.
