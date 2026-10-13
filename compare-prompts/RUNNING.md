# Local execution and evidence contract

Python 3.10+ standard library only. Ollama and the selected model must already be
installed. The runner accepts loopback HTTP endpoints, disables proxies/redirects,
and never calls a hosted service. It does not install models or change server settings.

## Prepare and run

Create a JSON experiment beside your input files. Paths resolve relative to that JSON,
not the current directory. Each arm takes an ordered list of UTF-8 files: a standalone
prompt, a `SKILL.md`, or an entrypoint plus explicitly relevant references. Snapshot
Git versions into files beforehand if desired; the runner itself is Git-independent.
The contents are system instructions; each case's `input` is the user message.
There is no implicit variable interpolation, reference traversal or tool loop.

The [smoke experiment](examples/smoke/experiment.json) is runnable and intentionally
contains a bad A prompt and better B prompt. It demonstrates grader sensitivity, not
representative sampling; its honest statistical verdict is INCONCLUSIVE.

```powershell
python <skill-dir>/scripts/run.py --config experiment.json --validate-only
python <skill-dir>/scripts/run.py --config experiment.json --output <state>/run.jsonl
python <skill-dir>/scripts/score.py <state>/run.jsonl <state>/report.json
```

`<state>` is `~/.agent-state/<repo-slug>/compare-prompts/` or another explicit directory
outside the worktree. Use a fresh run and report filename. The inference run makes
no silent retries. After an infrastructure failure, investigate and rerun the entire
frozen experiment to a new file; do not select successful arms from different runs.

## Experiment fields

| Field | Meaning |
|---|---|
| `version` | `1` |
| `arms` | Exactly `a` and `b`, each with a nonempty `files` list |
| `model`, `host` | Exact installed model tag and local Ollama endpoint |
| `options` | Same decoding/context/output settings for both arms |
| `repeats` | Same number of trials per arm/case; default 2 |
| `order_seed` | Fixed counterbalanced A/B order; default 123 |
| `response_format` | Optional same output format for both arms; omit for free text |
| `cases` | Frozen task and grader records below |
| `decision` | Required predeclared settings below |

Defaults: temperature 0, seed 0, top-k 1, top-p 1, repeat penalty 1, context 32,768,
output budget 256. Choose budgets that fit the model and real task. Greedy decoding
is a controlled condition, not proof of universal repeatability. For a stochastic
deployment, specify its real sampling settings and adequate repeated trials; record
the fixed seed policy and scope conclusions to that policy.

Each case has `id`, `cluster`, `split`, `critical`, `input` and `grader`. IDs are unique;
`split` is `dev`, `test` or `gate`. A cluster cannot cross splits. `test` is the held-out
population sample; `gate` contains purposively constructed critical cases and requires
`critical: true`. Gate cases cannot inflate the sample size of the primary estimate.

Decision fields: `margin` (strictly positive practical difference), `alpha` (between
0 and 1), `min_clusters`, `quality_floor` (0–1), `sampling` (`representative` or
`curated`), `holdout_frozen` and `grader_validated` (booleans). The last fields are
auditable design attestations, not automatic facts established by setting a flag.
Read [METHOD.md](METHOD.md) before choosing them.

## Graders

The target model never receives the grader or expected answer.

- `{"type":"exact","expected":"text"}` compares after stripping outer whitespace.
  Use only when that normalization is part of the task contract.
- `{"type":"json_equal","expected":{"value":"Beta"}}` compares parsed JSON values,
  ignoring object key order/whitespace, while distinguishing boolean and numeric types.
  Numeric representations are strict (`1` and `1.0` differ); use a Python grader when
  numeric tolerance or coercion is part of the task contract.
  Non-JSON model output fails the task; it is not a transport failure.
- `{"type":"python","path":"check_output.py"}` executes a **trusted, reviewed** grader
  with `--allow-python-graders`. It receives JSON `{"input":...,"output":...}` on stdin
  and must emit `{"passed":true}` or `{"passed":false}` on stdout. Other output,
  nonzero exit, changed script bytes or timeout invalidates the run. Default timeout:
  30 seconds. The grader runs without a shell in a fresh temporary working directory.

Python graders are arbitrary code, **not a sandbox**. Audit them before enabling; never
use model-generated output as a command or an unreviewed grader. A grader that runs
generated programs must use a separate real sandbox. Hash/pin its dependencies and
fixtures as part of the experiment; the runner pins the grader entrypoint, not its
transitive imports. Functional checks should admit all valid solutions rather than
requiring incidental wording or one implementation strategy.

## Evidence and external harnesses

The JSONL starts with a `manifest` containing the frozen config, source snapshots and
hashes, model digest, engine/template settings, runner/grader hashes and hardware.
Each `request` is persisted before execution, then a `result` records output, grade,
validity, trial and arm. Only a complete matrix receives a `complete` footer. Errors
remain in the file. Preserve all raw evidence; do not overwrite files to “repair” a run.

An existing harness (for example Promptfoo or a sandboxed agent harness) should use
its own validated outcome collection and apply the decision principles in METHOD.md.
The bundled scorer validates the local Ollama text-run contract; it is not a generic
score-CSV importer. Integrating another producer requires a separately tested adapter
and evidence validation appropriate to its tools and artifacts. Do not impersonate
an Ollama text run to bypass these checks. Local result coordinates are
`case_id`, `arm` (`a`/`b`), and zero-based `trial`; `passed`/`valid` must be booleans,
and `output` the actual response/transcript. Preceding request records carry the same
coordinates, exact payload and `request_hash` of canonical UTF-8 JSON (sorted keys,
no extra separators, non-ASCII preserved). Results carry that request hash too.
Any future adapter must enforce environment pins, reset state, provide artifact/trace
evidence, and terminate on infrastructure errors just as the local runner does.

The offline scorer validates completeness, execution pins, frozen-request linkage and
the built-in grades against recorded outputs. It cannot prove that
a hand-authored manifest is honest or a declared grader is adequate. Audit the producer.
Exit codes: 0 improvement/practical equivalence, 1 regression, 2 inconclusive, 3 invalid.
