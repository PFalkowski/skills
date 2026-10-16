# Notice

This skill is adapted from the `systematic-debugging` skill in
[obra/superpowers](https://github.com/obra/superpowers), at commit
[`bb92a77`](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/systematic-debugging).

## What changed

- `SKILL.md` is condensed to this repository's size rules. The method is unchanged: the same four
  phases, the stop after three failed fixes, and the same warning signs.
- Pointers to skills that exist only in superpowers are replaced. The failing test and the
  verification before claiming success are stated inline, and the evidence standard points to the
  sibling `fact-check` skill.
- A line says project-specific debugging skills are tools inside this process.
- `find-polluter.sh` (npm-only) and `condition-based-waiting-example.ts` are not included. The two
  reference passages that pointed to them now describe the technique in general terms.
- `references/` otherwise holds the upstream support files with their text unchanged.

## Upstream licence

MIT License

Copyright (c) 2025 Jesse Vincent

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
