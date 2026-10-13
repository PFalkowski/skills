---
name: no-comment
description: 'Improve code instead of adding comments; apply when writing or reviewing comments.'
license: MIT
metadata:
  author: Piotr Falkowski
  copyright: "© 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
---

# no-comment

Express meaning in code before adding a comment:

1. Rename to explain it.
2. Extract a function whose name explains it.
3. Encode it in a type.

A comment earns its place only if all three fail or the [allowlist](ALLOWLIST.md) permits it. Explain **why**, not what the code does: “Broker drops the fourth concurrent request” adds information; “increment retry count” does not.

Delete commented-out code and comments that no longer match the code. Git retains history.
