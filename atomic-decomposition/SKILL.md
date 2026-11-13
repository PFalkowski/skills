---
name: atomic-decomposition
description: 'Split a claim, plan or finding into atoms one check can settle, then carry the verdicts up the tree.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# atomic-decomposition

Divide a claim until one check can settle each piece, true or false, then settle the pieces. The method favours neither verdict: a check counts only if it could come out either way. A plan is the claim "this works", a decision is the claim "this option is right", and a review finding is the claim "this code is wrong".

Use it when a claim is too large or too vague to check in one step and a wrong answer is costly. Skip it when one check already settles the claim.

## Build the tree

1. **Make the root testable.** Replace vague words with concrete values: "the import is slow" becomes "the import runs one query per row". If no observation could show the claim true or show it false, it is not ready to split; rewrite it first.
2. **Split it into the claims it needs.** Each child must hold for the parent to hold, so a parent needs all of its children. When a parent can hold in more than one way, give each way its own branch and mark the parent `any`.
3. **Check every split before its pieces.** When the claim is costly to get wrong, an agent that did not write the split makes these checks.
   - *Enough* (a parent that needs all its children): if every child held, could the parent still be false? If so, a child is missing; add it. Otherwise a confirmed tree proves a claim nobody checked.
   - *Needed* (the same parent): if this child were false, would the parent have to be false? If not, the child is too strong and its failure would wrongly refute the parent; weaken it to what the parent needs.
   - *Sufficient* (an `any` parent): if this branch alone held, could the parent still be false? If so, the branch is too weak and would wrongly confirm the parent; strengthen it.
   - *Every way* (an `any` parent): show that the branches cover every way it can hold (an enumeration, a type, the only code paths), or add a branch "it holds some other way". That branch stays unsettled until it can be checked.
4. **Stop at atoms.** An atom is a claim that one method settles in one step another person can repeat, where that step could come out either way: one run, one quoted `path:line`, the sources `fact-check` requires, or one answer from the person who owns the decision. Keep splitting while a piece needs two methods or two steps. A piece that can be neither split nor checked is still an atom: keep it and mark it unsettled.

## Settle the atoms

5. **The claim's type fixes the method**, per [fact-check](../fact-check/SKILL.md): run what is executable, quote the code for what the code says, cite primary sources for what a document says. Only its two Confirmed statuses count as confirmed here; Likely, Unverified and Not run are unsettled. An atom is refuted on the same basis: a run whose output contradicts it, or two independent authoritative sources against it. Weaker evidence against it leaves it unsettled. Look an answer up before asking a person for it.
6. **State the expected answer before checking.** Each atom carries the answer its author expects, so the check tests a prediction. Design the check to find the truth, not to reach that answer or to defeat it.
7. **Work one atom at a time, in dependency order.** Among atoms that are ready, check first the one whose result, either way, would fix the most verdicts above it, then the cheapest.
8. **The author's judgement never settles an atom.** A run or a source does; when the claim is costly to get wrong, a fresh agent carries out the check.
9. **Attach the evidence**: the command and its real output, the quoted lines, or the links.

## Carry verdicts up

- A parent that needs all its children is **refuted** if any child is refuted, **confirmed** if every child is confirmed, and **unsettled** otherwise.
- An `any` parent is **confirmed** if any branch is confirmed, **refuted** if every branch is refuted, and **unsettled** otherwise.
- A verdict is fixed when no result still to come could change it: one refuted child under a parent that needs all its children, or one confirmed branch under an `any` parent. Then stop checking under that parent. Each child left over, and everything beneath it, is **not checked**, names the atom that decided the parent, and counts toward no verdict. An unsettled child fixes nothing; keep checking its siblings.
- A settled claim keeps its verdict. A narrower claim that might hold, or a wider one that might follow, is a new root: propose it and decompose it separately, never as a change to the old one.

## Lose nothing

Report the whole tree. Each atom gets a verdict, its method and its evidence. Each unsettled atom also names what would settle it: the command, the test, or the person. Then answer the root claim exactly as it was first asked. Report confirmed atoms even when the root is unsettled.

What to do about a verdict (block, fix, ticket, ignore) is decided afterwards, by the skill that asked.

## Example

Root: "After removing `retry()`, every request that succeeded before still succeeds." It needs all of:
- A1 "No caller outside `client.js` uses it": `git grep` shows none. Confirmed.
- A2 "The HTTP library itself retries each failure `retry()` retried": a script sends a POST, which `retry()` retries on a 503, to a local server that returns 503 once. The server sees one attempt. Refuted.
- A3 "The tests still pass": not checked, because A2 refuted the root.

The root is refuted. A new root is proposed: "After removing `retry()`, every GET request that succeeded before still succeeds."

The method draws on [grill-me](https://github.com/mattpocock/skills) (resolve each branch, one question at a time, with a recommended answer), [fact-check](../fact-check/SKILL.md) (the claim fixes the method) and [code-review-grill](../code-review-grill/SKILL.md) (a fresh agent verifies; grounded atoms are reported).
