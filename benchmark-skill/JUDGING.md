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
issue or review did, never the fix. It names every function, class, file or command
the hidden tests call, because a correct fix that picks other names would otherwise
fail; when naming them would give the fix away, drop the case. It also states every
rule the diff check applies.

Validate every case before freezing, and drop rather than repair one that fails. Use
the same restore-then-copy procedure as grading, below. With the reference fix
applied, the build succeeds and both the added tests and the existing suite pass, in
each of three runs by default, so that a flaky test shows. On the parent, the added
tests fail.

Give each arm the parent's files without its later history, or the agent can read the
fix with `git log` or `git show`. For example, unpack `git archive <parent>` into a
fresh directory, and if the agent needs Git, make it a new repository holding that one
commit. Reset between trials, with the same tools, budget and permissions per arm.
In a public repository the fix may also be reachable over the network, so run without
network access, or report possible contamination.

When the agent finishes, restore every test file and test configuration from the
parent, which undoes any edit to existing tests, and delete test files the agent
added; adding tests is not a failure unless the task forbids it. Then copy in the
hidden tests; do not rely on detecting tampering. Grade four things: the tests the fix
added now pass (fail-to-pass); the existing suite still passes; the build succeeds;
and a diff check holds. The diff check rejects changes to lockfiles, CI files and
vendored code, plus any property the skill claims. It limits changes to named files
only when the task names them, since a correct fix may live in a caller or a shared
helper. For the
hidden-behaviour rung, the visible tests cover part of the documented behaviour,
hidden checks cover the rest, and the task says so.

An executable grader runs code the agent wrote, so it needs at least: a fresh temporary
directory per trial; an environment scrubbed of keys, tokens and unneeded variables; a
timeout that kills the whole process tree; and hidden tests kept where the agent cannot
read or overwrite them. This hygiene keeps grades honest; it is not a security sandbox
and does not stop a hostile program. The same holds for the agent under test, which
also has a shell. Use a container or virtual machine when the code or the agent
cannot be trusted.
