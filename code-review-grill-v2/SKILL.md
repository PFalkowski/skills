---
name: code-review-grill-v2
description: 'Opt-in v2 of code-review-grill, used only when named: model-checked traces ground ordering findings.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# code-review-grill-v2 — one more way to ground an ordering finding

Run [code-review-grill](../code-review-grill/SKILL.md) in full. This overlay adds one grounding method for ordering claims (races, check-then-act, a crash between two writes) and changes nothing else. Use it only when a person or a calling skill names it. [ADR-0004](../docs/adr/0004-opt-in-v2-exhaustive-checks.md) records why.

## Why

The base skill grounds a claim about what code does at runtime only by running it. A race rarely runs on demand, so a true ordering finding ends under **Not run** and is never posted. A model checker can show the bad order as a trace of steps, and each step can point at the code.

## The model-checked method

The lead appends this section, word for word, to every reviewer brief ([brief templates](../code-review-grill/REFERENCE.md#brief-templates)).

- For an ordering claim you cannot reproduce by running the code, write a small model of the steps involved. Write it in a new temp folder (`mktemp -d`), never in the reviewed tree. Every action in the model cites the `path:line` it stands for, and one indivisible step in the code is one action.
- Run it with the commands in [formal-check's TLC.md](../formal-check/TLC.md), and with no others. TLC is the model checker for TLA+, a language for describing how a system moves from state to state.
- Where the bad order can be forced on the real code, replay the trace as a deterministic test. That test is a snippet: it follows every snippet rule, and the finding is an ordinary `snippet` finding.
- Where it cannot be forced, say why; "not attempted" is not a reason. Report the method as `model-checked`, label the finding "model-checked, not run on the code", and put the model, its config, the command, the output and the trace with its `path:line` citations in the finding detail, verbatim.
- A trace step with no `path:line` keeps the claim under **Not run**.

## What it overrides, and only here

Inside a v2 review, and for this method only, a `model-checked` finding is not withheld by the rule that an executable claim must be run: the rule in code-review-grill ([Step 5](../code-review-grill/SKILL.md#step-5--run-the-review-fresh-adversarial-grilling), [finding payload](../code-review-grill/REFERENCE.md#standard-finding-payload-every-agent-returns-this)) and the same rule in [fact-check](../fact-check/SKILL.md#the-method--strongest-evidence-first). Every other claim is grounded as the base skill says.

## The lead

- **Severity is at most ⚠️**, for every kind, `data` and `rollback` included ([severity legend](../code-review-grill/REFERENCE.md#severity-legend)). The trace was never run on the code.
- **Rerun before offering.** Write the model from the finding detail into a temp folder of your own and run the checker again. If the checker cannot run here, or the rerun does not give the same trace, the claim goes under **Not run**, never ❓.
- **Read the model against the code.** Open each cited `path:line`. A step the code cannot take, or two code steps merged into one action, means the model is wrong: the claim goes under **Not run** with that reason.
- At [Step 6](../code-review-grill/SKILL.md#step-6--consolidate-into-the-findings-table) a model-checked artifact that passed these checks counts as usable.

## Downstream, unchanged

- A manager drives this skill by the code-review-grill row of [PRINCIPAL.md](../manager/PRINCIPAL.md#per-skill-notes--where-each-ones-questions-surface). A model-checked finding counts as verified for posting; a claim under **Not run** is still not a finding.
- [fix-pr](../fix-pr/SKILL.md#step-2--fact-check-every-comment-all-modes-no-exceptions) is unchanged. It cannot run a model-checked finding on the code, so it returns it as `needs-discussion`: a person or the calling skill decides. In an autonomous loop such a finding therefore reaches a person.
