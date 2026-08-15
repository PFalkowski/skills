---
name: no-comment
description: 'Keeps code free of comments by refactoring until the code says it itself — naming, extraction, types. Any comment that survives must state WHY, not WHAT. Use whenever about to write a comment in code, and when reviewing code that already carries them. Exceptions are listed in ALLOWLIST.md.'
---

# no-comment

A comment is usually a failure to say it in code. Fix the code first.

## Before writing any comment

1. Can a better **name** say it? Rename.
2. Can an **extracted function** say it? Extract — the name becomes the comment.
3. Can a **type** say it? Encode it.

Only when all three fail has a comment earned its place — or when it is on the
[allowlist](ALLOWLIST.md).

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

## Delete on sight

Commented-out code — git remembers it. And any comment that has drifted from the code beneath it,
which is worse than none.
