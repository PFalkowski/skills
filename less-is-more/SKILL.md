---
name: less-is-more
description: 'Code is a liability — every line must be read, maintained, and loaded into context forever. Make the smallest change that fits the repo''s architecture, measured in cognitive load rather than line count: modify existing code with confidence instead of bolting on parallel additive paths, but split dense cleverness into named parts even when that adds lines. Use whenever writing or changing production code — especially when tempted to add a new helper, wrapper, flag, or class beside existing code instead of changing it, or when a diff is growing beyond the task.'
---

# less-is-more

Every line of production code is a liability: someone must read it, test it, keep it
correct, and load it into their head — or their context window — before every future
change. The asset is the behaviour; the code is the cost of having it.

The unit of "less" is **cognitive load, not line count**. A change that adds lines but
makes the code easier to hold in one's head is less. A compressed one that makes it
harder is more.

## Scope

This applies to **code you are touching for the task at hand**. It is not a license to
sweep the project deleting unused code or refactoring untouched modules — that is
separate, deliberate work. But inside your blast radius, own the code fully.

## Before writing new code

1. **Does the change belong in existing code?** Modifying a function you understand is
   better than adding a sibling because modifying feels risky. Additive-only changes —
   the parallel helper, the wrapper around the wrapper, the copy-pasted variant, the
   new boolean flag threading through — are fear, not safety. Safety is tests and
   understanding. Read the code until you are comfortable changing it, then change it.
2. **Does something in the repo already do this?** Search before you write. A second
   implementation of an existing capability is pure liability.
3. **Does the abstraction earn its place?** No interface for one implementation, no
   layer for one caller, no config for one value. Follow the repo's architecture
   (DDD, Clean Architecture, layering — whatever its docs and structure show) and add
   structure only when that architecture calls for it.
4. **What does this change orphan?** If your edit makes code in the touched area
   unreachable — the old path, its tests, its config — delete it in the same change.
   Git remembers.

## The nuance: more lines can be less code

Compression is not the goal; density has its own cognitive cost.

```cs
// MORE (despite fewer lines) — one expression, five decisions, zero names
var eligible = orders.Where(o => o.Status == Status.Paid && (o.Total > 100 ||
    o.Customer.Tier >= Tier.Gold) && !o.Items.Any(i => i.Restricted)).ToList();

// LESS (despite more lines) — each rule named, testable, and readable alone
var eligible = orders.Where(IsEligibleForFreeShipping).ToList();

bool IsEligibleForFreeShipping(Order order) =>
    order.IsPaid() && QualifiesByValueOrTier(order) && order.HasNoRestrictedItems();
```

The same holds for guard clauses over nested conditionals, and explicit steps over a
clever expression. Prefer whichever version a stranger understands faster — that is
the version with less code, whatever the line counter says.

## What less never means

- Not less error handling, validation, or tests to shrink the diff.
- Not a hack that minimises the diff while violating the repo's patterns — the
  smallest *architecturally honest* change wins over the smallest textual one.
- Not merging unrelated concerns into one function because two functions are "more".
