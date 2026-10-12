---
name: less-is-more
description: 'Minimize cognitive load in production changes; challenge new helpers, flags and abstractions.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# less-is-more

Minimize **cognitive load, not line count**, within code touched by the task. Unrelated cleanup/refactoring needs separate scope.

Before adding code:

1. **Modify the right existing code.** Understand and test it instead of adding parallel helpers, wrappers, copied variants, or threaded flags to avoid changing it.
2. **Search for an existing capability.** Do not implement it twice.
3. **Require abstractions to earn their place.** Avoid interfaces for one implementation, layers for one caller, or configuration for one value unless the repo's documented architecture calls for them.
4. **Remove what the edit orphans.** Delete unreachable paths and their tests/config in the touched area in the same change; git retains the history.

Named rules, guard clauses, and explicit steps may use more lines yet be easier to understand. Prefer the version a stranger understands faster.

Never shrink the diff by cutting error handling, validation, or tests, violating repo patterns, or combining unrelated concerns.
