---
name: no-comment
description: 'Use whenever about to write a comment in code. Default is: do not. Refactor until the code says it — naming, extraction, types. A comment that survives states WHY, never WHAT. Exceptions only from the allowlist below.'
disable-model-invocation: true
---

# no-comment

A comment is usually a failure to say it in code. Fix the code first.

## Before writing any comment

1. Can a better **name** say it? Rename.
2. Can an **extracted function** say it? Extract — the name becomes the comment.
3. Can a **type** say it? Encode it.

Only when all three fail has a comment earned its place.

## If one earns its place

State **why**. The code already states what.

```cs
// WRONG — restates the code
// increment the retry count
retries++;

// RIGHT — not derivable from the code
// Broker silently drops the 4th concurrent request, so we retry one past their documented limit.
retries++;
```

## Allowlist

Exempt, and the project may extend this list:

- **AAA markers** in unit tests — `// Arrange`, `// Act`, `// Assert`
- **Hack or hotfix rationale** — why the non-obvious thing was necessary, with a ticket id where one exists
- Whatever the project's own conventions require: license headers, doc comments on public APIs, lint or pragma suppressions (which must carry their reason)

## Delete on sight

Commented-out code — git remembers it. And any comment that has drifted from the code beneath it,
which is worse than none.
