# Writing an answer key for passages of instruction prose

Each passage is a section of a Markdown instruction file (a guide for an AI agent).
Another agent will later rewrite each passage in a plainer style. Your answer key lets a
script check that a rewrite kept the passage's content. You write the key only. Read
nothing but the input file named in your task and this brief.

## Output format

One JSON file:

```json
{"cases": [
  {"id": "r1d01",
   "facts": ["gh pr merge", "--force", "30 minutes"],
   "rules": [
     {"id": "R1", "rule": "Never force-push a shared branch.",
      "patterns": ["(never|do not|don't|must not|no)\\b.{0,40}force.?push", "force.?push.{0,60}\\b(never|forbidden|not allowed)"]}
   ]}
]}
```

## Facts

Strings that must survive verbatim in any faithful rewrite. Start from the passage's
`candidate_facts` (inline code, paths, flags, numbers with units, found mechanically) and
prune them:

- Keep commands, file names, paths, flags, identifiers, setting names, numbers with units.
- Drop junk: lone punctuation (`/`, `{}`), common English words, list numbers, fragments
  cut out of a larger string, and code spans longer than about 40 characters (keep a
  short distinctive part of such a span only if it is a real identifier).
- Drop anything from a table cell that a rewrite could legitimately reformat.
- At most 10 facts per passage; fewer is fine; zero is allowed.
- Each fact must appear in the passage exactly as written, after these steps: curly
  quotes become straight, `**` and backticks are removed, runs of whitespace become one
  space. Write the fact without backticks.

## Rules

One entry per distinct instruction the passage gives: each requirement, prohibition,
default, condition, ordering, or stated consequence the reader must act on. Pure
explanation that tells the reader to do nothing is not a rule; a stated reason attached
to an instruction is part of that instruction, not a separate rule. A typical passage
has 3 to 8 rules.

Each rule has 1 to 3 Python regular expressions. The checker joins the rewrite into one
line (curly quotes straightened, `**` and backticks removed, all whitespace collapsed to
one space) and calls `re.search(pattern, text, re.IGNORECASE)` for each pattern. The
rule is kept when any pattern matches.

Write patterns that a FAITHFUL paraphrase would match and a rewrite that drops or
reverses the instruction would not:

- Anchor on the content words that any correct restatement must contain: the object,
  the action, the identifier. Allow synonyms and word forms (`(finish|complete|done)`,
  `merg(e|es|ed|ing)`), either word order (two alternatives, or two patterns), and gaps
  (`.{0,60}`), since a rewriter may reorder or split a sentence.
- For a prohibition or condition, include the negation or condition word within a
  window, with its common forms: `(never|not|n't|no|avoid|without)`.
- Never anchor on stylistic wording a rewriter is likely to change: dashes, bold,
  colons, filler words, intensifiers, metaphors, or the exact phrasing of a sentence.
- Keep patterns specific enough that the same rule does not match another rule's
  sentence, and that deleting the sentences of this rule makes it fail.
- Every pattern must match the passage itself. Escape regex metacharacters in literals
  (`\\.`, `\\(`); remember JSON needs doubled backslashes.

Before you finish, check your own file with a short Python script: every fact is in the
normalized passage, every pattern compiles, and every rule matches the normalized
passage. Fix anything that fails.
