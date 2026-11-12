---
name: atomic-decomposition
description: 'Split a claim, plan or finding into falsifiable atoms; one refuted atom refutes its branch.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# atomic-decomposition

Divide a claim until one check can prove each piece wrong, then settle the pieces. A plan is the claim "this works", a decision is the claim "this option is right", and a review finding is the claim "this code is wrong".

Use it when a claim is too large or too vague to check in one step and a wrong answer is costly. Skip it when one check already settles the claim.

## Build the tree

1. **Make the root falsifiable.** Replace vague words with concrete values: "the import is slow" becomes "the import runs one query per row". If no observation could prove the claim wrong, it is not ready to split; rewrite it first.
2. **Split it into the claims it needs.** Each child must hold for the parent to hold, so a parent needs all of its children. When a parent can hold in more than one way, give each way its own branch and mark the parent `any`.
3. **Check the split before the pieces.** Ask: if every child held, could the parent still be false? If so, a child is missing; add it. Children that together say less than the parent turn a fully confirmed tree into proof of a claim nobody checked. When the claim is costly to get wrong, an agent that did not write the split makes this check.
4. **Stop at atoms.** An atom is a claim that one method settles in one step another person can repeat: one run, one quoted `path:line`, one cited source, or one answer from the person who owns the decision. Keep splitting while a piece needs two methods or two steps. A piece that can be neither split nor checked is still an atom: keep it and mark it unsettled.

## Settle the atoms

5. **The claim's type fixes the method**, per [fact-check](../fact-check/SKILL.md): run what is executable, quote the code for what the code says, cite a primary source for what a document says. Look an answer up before asking a person for it.
6. **State the expected answer before checking.** Each atom carries the answer its author expects, so the check tests a prediction.
7. **Work one atom at a time, in dependency order.** Among atoms that are ready, check first the one that is cheapest to refute or that the most rests on.
8. **The author does not settle their own atom.** A fresh agent, a run or a source does.
9. **Attach the evidence**: the command and its real output, the quoted lines, or the link.

## Carry verdicts up

Every node ends as refuted, unsettled or confirmed.

- **Refuted** when any child is refuted. The verdict climbs to the root, or stops at an `any` parent that still has a live branch. Stop checking the rest of a refuted branch, then split its parent again: the claim needs another way to hold, or it is false.
- **Unsettled** when no child is refuted and at least one is unsettled. It is never reported as confirmed and never dropped.
- **Confirmed** only when every child is confirmed.
- An `any` parent is confirmed by one confirmed branch and refuted only when every branch is.

## Lose nothing

Report the whole tree. Each atom gets a verdict, its method and its evidence. Each unsettled atom also names what would settle it: the command, the test, or the person. Then answer the root claim exactly as it was first asked. Report confirmed atoms even when the root is unsettled.

What to do about a verdict (block, fix, ticket, ignore) is decided afterwards, by the skill that asked.

## Example

Root: "Removing `retry()` is safe." It needs all of:
- A1 "No caller outside `client.js` uses it": `git grep` shows none. Confirmed.
- A2 "The HTTP client retries on its own": the library docs say only for idempotent methods. Refuted.

A2 refutes the root, so A3 "the tests still pass" is never run. Splitting again gives a narrower claim that can hold: "Removing `retry()` is safe for GET calls."

The method draws on [grill-me](https://github.com/mattpocock/skills) (resolve each branch, one question at a time, with a recommended answer), [fact-check](../fact-check/SKILL.md) (the claim fixes the method) and [code-review-grill](../code-review-grill/SKILL.md) (a fresh agent verifies; grounded atoms are reported).
