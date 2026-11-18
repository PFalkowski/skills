# Notice

This skill is adapted from two skills in the `pstack` plugin of
[cursor/plugins](https://github.com/cursor/plugins), at commit `34b1b7c`:
[`create-formal-verification-skill`](https://github.com/cursor/plugins/tree/34b1b7c96f09f81a21a6c78f65b7833f7dcb5b24/pstack/skills/create-formal-verification-skill)
and
[`maintain-formal-verification-skill`](https://github.com/cursor/plugins/tree/34b1b7c96f09f81a21a6c78f65b7833f7dcb5b24/pstack/skills/maintain-formal-verification-skill).

## What changed

- The create and maintain skills are merged into one skill with three uses. CHOOSE is new: it
  classifies a promise at plan time and names its check, or says why example tests reach it.
- The step that reads results with the pstack `statechart` skill is dropped.
- `disable-model-invocation` is dropped, so the skill can be invoked by the model.
- The path for a verifier that runs on the code itself is dropped. An every-input check runs
  bounded exhaustive enumeration first, then a property-test library, and every run prints its
  bound or its seed.
- TLC (the TLA+ model checker) is pinned by version and SHA-256 digest, with one set of commands
  and a tested worked example of a lease race.
- The proof path builds nothing: the skill says so, builds the strongest bounded check and records
  the proof as an open item.
- The project skill has a fixed location, and records its sync commit on a line of its own that
  MAINTAIN can find.
- Showing a check able to fail happens in a scratch copy of the code: the tracked files are
  exported to a temp folder, and the broken variant is made and run there, never in the working
  tree.

## Upstream licence

MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
