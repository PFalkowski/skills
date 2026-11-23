# Writing reference rewrites of instruction prose

Each passage is a section of a Markdown instruction file. Write a rewrite of it that a
checking script must accept. Write each rewrite as Markdown into the file named in your
task, nothing else in the file.

A faithful rewrite:

- Keeps every instruction, requirement, prohibition, condition, default and stated
  reason of the passage, and adds none.
- Keeps every command, path, flag, identifier, setting name and number exactly as
  written (inside backticks is fine).
- Has between 0.6 and 1.15 times the passage's word count.
- Stays Markdown. A list may stay a list, a table may stay a table.

Its style follows these limits (they are what the checker counts):

- No em dashes, no spaced en dashes, no ` -- `. Use periods, commas or parentheses.
- No bold text at all, including bold labels at the start of list items such as
  `- **Name:** text`. Write `- Name: text` without bold, or prose.
- Headings, if any, in sentence case.
- No emojis and no curly quotes.
- No colon joining two clauses inside a sentence after a lead-in such as "If ...:",
  "When ...:", "Because ...:", "The fix ...:", "Here's why:". A colon before a list or
  an example is fine.
- No paragraph under 8 words, except headings, list items and table rows.
- None of these words or phrases: additionally, crucial, delve, enduring, enhance,
  foster, garner, interplay, intricate, landscape, pivotal, showcase, tapestry,
  testament, underscore, vibrant, serves as, stands as, boasts, "not just", "not only",
  "not merely", "in order to", "due to the fact that", "it is important to note",
  load-bearing, "earns its keep", honestly, frankly, "the honest answer", "worth
  noting", "this matters", "here's the thing", "the trap is", "full stop", "let me",
  "I'll now", "next, I'll", "could potentially", "hope this helps", "let me know if".
