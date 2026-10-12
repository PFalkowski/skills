# Skill context regression benchmark

Compare original and shortened skill instructions with local inference and mechanical
scoring. Fixtures and success criteria are fixed before running either arm. No hosted
model is used for inference or judging.

## Protocol

- Baseline: `3d40574c4379c031e1dd14d763eb40c89dae8351`.
- Candidate: `8cfe3ec72c1b43dd4997770af002bf65efbaa398`.
- Local Ollama model: `qwen2.5-coder:7b`, digest
  `dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
- Record the actual engine, model metadata, hardware, options, fixture hash and request
  hashes with each run. Changing any pin requires a new experiment.
- Greedy generation: temperature 0, seed 0, top-k 1, top-p 1, repeat penalty 1;
  context 32,768 tokens, output budget 64 tokens. Requests run sequentially.
- Unload the model before every request and verify its absence. For each case run
  baseline then candidate, twice. Do not reuse saved responses as inference results.
- Read skill content from the pinned Git objects, not the working tree. Load only
  fixture-specified references; select equivalent references for moved content.
- Keep raw responses and exact requests outside the repository in one JSONL file.
  Never overwrite a run.

## What is measured

**Routing:** choose a skill from the complete active-skill description catalogue.
This tests descriptions directly; it does not simulate a host's implicit-invocation filter.

**Behavior:** choose the next action for a synthetic scenario with the full skill supplied.
Every active skill has coverage, with additional contrast cases for important gates.
The answer key and its rationale are withheld from the model. Structured output only
constrains the response shape and valid choice IDs, not the correct answer.

**Repeatability:** exact raw-output equality for the same fixture and arm across repeats.
Different text between arms is not itself a regression. Report baseline-pass/candidate-fail
and baseline-fail/candidate-pass separately, along with failures shared by both arms.
Malformed or output-budget-truncated answers fail; incomplete runs cannot support a verdict.

The acceptance bar is **no baseline-pass/candidate-fail cases and repeatable outputs**.
Report absolute scores too: equivalently poor answers are not evidence of useful skills.
No percentage non-inferiority margin or significance claim is inferred from this small suite.

## Limits

This is a decision benchmark, not an end-to-end agent evaluation. It does not execute
tools, assess generated code or prose quality, or prove equivalence for unseen requests.
Supplied references test their contents, not an agent's ability to discover and read them.
Choice recognition may be easier than producing an action without suggestions.
Deterministic scoring is guaranteed by the harness; deterministic generation is measured,
not guaranteed by a temperature setting. Two repeats are a smoke test, not a reliability bound.

Any fixture correction after inference must be documented and both arms rerun. Do not
tune candidate skill wording to the answer key and call the result general equivalence.

## Run

From the repository root, with the model already installed and Ollama listening on loopback:

```powershell
python benchmarks/skill-context/benchmark.py --baseline 3d40574 --candidate 8cfe3ec --cases benchmarks/skill-context/cases.json --model qwen2.5-coder:7b --output "$env:TEMP/skill-context-run.jsonl" --repeats 2
```

Use a new output filename for each experiment. The runner records failures as well as
successes. Commit only a concise results report; local raw artifacts retain the evidence.

## Interrupted runs

Keep the original JSONL. For an HTTP 500 interruption, first verify the engine, model,
hardware, runner hash and canonical fixtures still match its metadata. Create a temporary
fixture file containing only cases without all four completed responses, unchanged and
in their original order. Run those cases to a new JSONL file; rerun an interrupted case
in full rather than retaining just its successful arm.

Combine the segments against the original fixture file:

```powershell
python benchmarks/skill-context/report.py --cases benchmarks/skill-context/cases.json "$env:TEMP/skill-context-run.jsonl" "$env:TEMP/skill-context-continuation.jsonl"
```

The combiner validates matching pins and fixtures, retains only complete cases, reports
the interruption, and refuses conflicting duplicate results. Missing cases yield an
incomplete report and nonzero exit. Other errors require investigation or a fresh full
experiment; they cannot be excused as HTTP 500 interruptions.
