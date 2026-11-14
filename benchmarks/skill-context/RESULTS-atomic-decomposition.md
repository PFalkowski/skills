# atomic-decomposition: original against compact, 2026-11-13

No regression was detected in this decision suite. Both versions scored **24/24**, with
identical answers. All **48** within-version repeat comparisons were byte-identical. This
supports the compaction for these scenarios; it does not establish equivalent free-form
output or agent execution.

| Measure | Original | Compact |
|---|---:|---:|
| Behaviour cases, one per rule of the skill | 22/22 | 22/22 |
| Description-routing cases | 2/2 | 2/2 |
| `SKILL.md` size, characters | 7,044 | 5,466 |
| Input tokens, across two repetitions | 84,616 | 69,172 |
| Request time, including cold loads | 602.8 s | 541.9 s |

The compact skill is **22.4% smaller** and used **18.3% fewer measured input tokens**.
There were zero pass-to-fail cases, zero fail-to-pass cases and zero shared failures. All
96 responses completed without output truncation or detected context saturation.

## What this does not show

A perfect score on both arms is a ceiling: the suite cannot tell the two versions apart,
and it does not show how much either version helps. No arm ran without the skill, so some
cases may be answerable from the question alone. The cases were written and committed
before the skill was compacted, and the compact text was not tuned to the answer key.

## Reproduction

From the repository root, with the model installed and Ollama listening on loopback:

```bash
python3 benchmarks/skill-context/benchmark.py \
  --baseline 8746792 --candidate 434d641 \
  --cases benchmarks/skill-context/cases-atomic-decomposition.json \
  --model qwen3.8-32k:latest --no-think --repeats 2 \
  --output "$HOME/.agent-state/skills/skill-context-benchmark/<new-name>.jsonl"
```

To test a later edit of the skill, keep `--baseline` and set `--candidate` to the new commit.

- Original: `874679251c558a7bd257a3be4e883f1595e96a64`.
- Compact: `434d641b73521c4e77662b3e0b27c3354a719f7d`.
- Ollama: `0.34.2`; model `qwen3.8-32k:latest`, thinking disabled with `--no-think`.
- Model digest: `41a558fc459a96edbf0500938edc7d3ddaceedde727d1e7faa8ec4fbc9eb8772`.
- Fixture hash: `c619fa4af45f66d83a17ab040f00d701327fe028b7fab586f7b9fc3aaee6e7e1`.
- Host: Linux. The runner records only the NVIDIA GPU (GeForce GTX 1070 Ti, 8,192 MiB,
  driver 580.178.04). The host also has a Radeon AI PRO R9700; which GPU served the model
  was not checked.
- Settings and acceptance bar: [protocol](README.md). This model differs from the one the
  protocol pins, so this is a separate experiment, not a continuation of
  [the earlier one](RESULTS.md).
