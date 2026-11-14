# Subjective outputs and agent skills

## Blind judging

Use a rubric tied to user outcomes, with anchored examples and explicit ties. Hide
arm names, source prompt text, version history and which variant is expected to win.
Keep task/reference evidence visible. Present each pair in both orders; map the
answers back to their real arms. An order-dependent preference or judge disagreement
is an unresolved grade, not an invitation to select the favorable judgment.

Calibrate the rubric and judge on development outputs rated by a qualified human.
Measure agreement and audit disagreements, valid alternatives, verbosity/style bias
and instruction injection embedded in outputs. Treat generated text as untrusted
data. Keep gold labels hidden from the tested model. Pin the judge model, prompt,
settings and rubric, and record its own uncertainty/repeatability separately.

Prefer local judges under the user's local-model preference. If no suitable calibrated
judge or human is available, return INCONCLUSIVE for subjective quality; do not quietly
send outputs to a hosted service or substitute string overlap for quality.

The bundled scorer expects independently validated binary success grades per arm.
A relative pairwise preference alone is not that metric: two bad answers still have
a winner. Keep pairwise preferences as diagnostics, or preregister an appropriate
separate preference analysis rather than feeding winner/loser as absolute pass/fail.

## Outcome checks for tool-using skills

Use an existing agent harness with identical tools, permissions, fixture state,
budgets and reset procedure for A/B. Run in isolated disposable workspaces with
mock services or test accounts; preserve intended authorization boundaries. Record
tool inputs/results, resulting files/state and the complete transcript.

Score the actual artifact or final state. Test required behavior and prohibited side
effects; use transcript checks for process requirements that the final artifact
cannot reveal. “Would ask permission” in a choice test is not evidence the agent
actually withheld a write. Never execute arbitrary generated code merely because
the text-only runner returned it; use an appropriate sandboxed execution harness.

Keep a complete paired result matrix, environment/grader identities and evidence
pointers. Inspect representative successes and failures before declaring graders
validated. See [RUNNING.md](RUNNING.md) for the bundled text-runner boundary; tool
outcomes need the existing harness's validated analysis or a separately tested adapter.

## Skills that guide code writing

Build cases from the repository's own history. A case is a fix commit, its parent,
and the tests the fix added. The task given to the agent describes the problem as the
issue or review did, never the fix. Validate every case before use: the reference fix
must pass its tests, and the parent must fail them. A case that fails either check is
dropped before freezing, not repaired after the run.

Run each arm in a clean checkout of the parent, reset between trials, with the same
tools, budget and permissions. When the agent finishes, copy in the hidden tests and
grade four things: the tests the fix added now pass (fail-to-pass); the existing suite
still passes; the build succeeds; and a diff check holds, for example only expected
paths changed, no test was edited or deleted, no dependency was added, plus any
property the skill claims. For the hidden-behaviour rung, the visible tests cover part
of the documented behaviour, hidden checks cover the rest, and the task says so.

An executable grader runs code the agent wrote, so it needs at least: a fresh temporary
directory per trial; an environment scrubbed of keys, tokens and unneeded variables; a
timeout that kills the whole process tree; and hidden tests kept where the agent cannot
read or overwrite them. This hygiene keeps grades honest; it is not a security sandbox
and does not stop a hostile program. Use a container or virtual machine when the code
cannot be trusted.
