# Every-input checks

Read this before writing an every-input check. These checks run against the real code, never a
hand model of it. Every run prints its bound or its seed, so a failure can be reproduced.

## 1. First: bounded exhaustive enumeration

Write a small grammar of inputs (for example, every string of up to four characters from a set of
five that matter to a redactor) and run the real code on every input it generates. Use the repo's
own test framework and add no dependency. The run prints its bound: the count of inputs and the
largest size checked. A pass covers exactly that bound, and the project skill says so.

## 2. Else: a property-test library

When the input space is too large to enumerate, use a property-test library: it generates random
inputs, checks the property on each, and shrinks a failing input to a small one.

- Use a library the repo already depends on. Otherwise add one as a test-only dependency pinned to
  an exact version, and name it in the handoff.
- Every run prints its seed. The project skill records how to rerun with that seed, citing the
  library's own documentation for the seed option.

## 3. Libraries

Named here with their documentation only. Read the library's own documentation for every call and
option you use; write nothing from memory.

- Hypothesis, for Python: https://hypothesis.readthedocs.io/
- fast-check, for JavaScript and TypeScript: https://fast-check.dev/
- FsCheck, for .NET: https://fscheck.github.io/FsCheck/
- proptest, for Rust: https://proptest-rs.github.io/proptest/
- jqwik, for Java: https://jqwik.net/docs/current/user-guide.html
- QuickCheck, for Haskell: https://hackage.haskell.org/package/QuickCheck
