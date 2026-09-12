---
name: fingerprint-drift-splits-one-defect
description: Two lenses found one bug and it was not marked corroborated — different flaw tokens split the grouping key
type: gotcha
---

The `correctness` and `logic` lenses independently found the same defect in
`omv-dev-server/scripts/20-storage.sh` — the whole-disk `PKNAME` case reporting a USB-attached disk
as internal. Findings are grouped across lenses on `file:symbol:subject:flaw` to mark them
`corroborated`, and that did **not** fire, because the two lenses chose different values for two of
those four fields:

| | correctness | logic |
|---|---|---|
| `flaw` | `logic-error` | `unhandled-failure-path` |
| `subject` | `DATA_DISK removable-transport detection` | `TRAN detection via lsblk PKNAME` |

`flaw` is a closed enum, so neither value was invented — both are plausible tokens for this one
defect, which is exactly the bounded drift the fingerprint design accepts on purpose. The cost is
the designed one (a duplicate, never a silent drop). The practical effect, though, is that **the
strongest signal a hunt can produce was computed as absent** and had to be caught by reading the
two findings side by side.

So: when two findings name the same file and describe the same mechanism, check corroboration by
hand rather than trusting the silence of the `corroborated` field. If this recurs, it is an
observation about the process rather than a fact about this repo.
