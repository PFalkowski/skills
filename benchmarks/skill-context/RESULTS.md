# Local comparison, 2026-10-12

No regression was detected in this decision suite. Both versions scored **51/52**,
with identical answers across the original and trimmed instructions. All **104**
within-version repeat comparisons were byte-identical. This supports the trim for
these scenarios; it does not establish equivalent free-form output or agent execution.

| Measure | Original | Trimmed |
|---|---:|---:|
| Behavior cases, covering 38 skills | 43/44 | 43/44 |
| Description-routing cases | 8/8 | 8/8 |
| Input tokens, across two repetitions | 213,666 | 141,968 |
| Request time, including cold loads | 1,416.81 s | 1,164.27 s |

The trimmed instructions used **33.6% fewer measured input tokens**. Request time
fell 17.8% in this cold-start experiment; this is not a production latency estimate.
There were zero pass-to-fail cases and zero fail-to-pass cases. All 208 retained
responses completed without output truncation or detected context saturation.

## Shared failure

`auto-mode-setup-rule`: both versions chose “the more specific project allow wins”
over a user-scope deny. The baseline and candidate instructions explicitly say the
deny wins across scopes. Thus agreement here is a shared model failure, not success
and not a regression caused by compression. No skill text was tuned to this answer key.

## Reproduction pin

- Original: `3d40574c4379c031e1dd14d763eb40c89dae8351`.
- Trimmed: `8cfe3ec72c1b43dd4997770af002bf65efbaa398`.
- Ollama: `0.34.2`; model `qwen2.5-coder:7b`, Q4_K_M.
- Model digest: `dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.
- Host GPU: NVIDIA GeForce GTX 1070 Ti, 8,192 MiB, driver 560.94.
- Settings, fixture method and acceptance bar: [protocol](README.md).

Two local HTTP 500 errors interrupted inference. Completed cases were retained;
each interrupted case was rerun in full with unchanged prompts and pins. Across
three segments, 211 responses were captured; three partial-case responses were
excluded, leaving 208 scored responses. Segment compatibility and complete coverage
were checked mechanically, including unchanged engine, model, hardware and runner.

Raw prompts, responses and metadata are stored outside the repository under
`~/.agent-state/skills/skill-context-benchmark/2026-10-12/`.
The JSONL segment fingerprints are:

| File | SHA-256 |
|---|---|
| `skill-context-20261012-paired.jsonl` | `5db30929ebc173e6c512597073f565bea62ad2a76b9c7e6ef6e18c0c68968514` |
| `skill-context-20261012-continuation.jsonl` | `670a3fec7b50759d95e362eb7651a5eed84a84c3e6ba01b9ba22b36411e08361` |
| `skill-context-20261012-final.jsonl` | `a520dbc2390e0ca4e46a1240d5a6f58d930438e1a821cb73265266927a1b77a4` |

## Interpretation limits

The suite uses constrained action choices and deterministic answer keys, not a model
judge. Some distractors are easy to reject without reading a skill. Routing tests use
the full description catalogue, not a host's automatic-invocation policy. Relevant
references are supplied explicitly. There are no real tool executions or free-form
artifact-quality checks. Two repetitions demonstrate repeatability in this run,
not a universal determinism guarantee. Results apply to this local model and pin.
