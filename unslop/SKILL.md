---
name: unslop
description: 'Remove AI writing patterns from docs, READMEs, posts and other prose so it sounds human.'
license: MIT
metadata:
  author: Lauren Tan
  copyright: "© 2026 Lauren Tan"
  source: https://github.com/poteto/noodle/blob/00ad13458e5aeed004396835d0844b620396d86c/.agents/skills/unslop/SKILL.md
  modified-by: Piotr Falkowski
---

# Unslop

Edit text to remove AI patterns and add human voice.

## Process

1. Scan for the patterns below
2. Rewrite — preserve meaning, match intended tone
3. Add soul (see next section)
4. Self-audit: "What makes this obviously AI generated?" Fix remaining tells.

## Adding soul

Removing patterns is half the job. Sterile, voiceless writing is just as obvious.

- **Have opinions.** React to facts instead of neutrally listing pros and cons.
- **Vary rhythm.** Short sentences. Then longer ones that take their time. Mix it up.
- **Acknowledge complexity.** "Impressive but also kind of unsettling" beats "impressive."
- **Use "I" when it fits.** First person isn't unprofessional.
- **Let some mess in.** Perfect structure feels algorithmic.
- **Be specific.** Not "this is concerning" but "there's something unsettling about agents churning away at 3am."

## Patterns to detect and fix

### Content

1. **Significance inflation** — "pivotal moment", "testament to", "evolving landscape", "setting the stage for", "indelible mark", "deeply rooted". Cut puffery, state what happened.
2. **Notability name-dropping** — listing media outlets without context. Pick one, say what was said.
3. **Superficial -ing phrases** — "highlighting...", "ensuring...", "reflecting...", "showcasing...", "fostering...". Delete or expand with real sources.
4. **Promotional language** — "nestled", "vibrant", "breathtaking", "groundbreaking", "renowned", "stunning", "must-visit". Use neutral descriptions.
5. **Vague attributions** — "Experts believe", "Industry reports suggest", "Some critics argue". Name the source or delete.
6. **Formulaic challenges** — "Despite challenges... continues to thrive." Replace with specific facts.

### Language

7. **AI vocabulary** — Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant. Replace with plain words.
8. **Copula avoidance** — "serves as", "stands as", "boasts", "features". Just say "is" or "has".
9. **Negative parallelisms** — "It's not just X, it's Y." Also the trailing contrast: "It's a topology, not a genre." State the point directly.
10. **Rule of three** — forcing ideas into groups of three. Use the natural number.
11. **Synonym cycling** — protagonist/main character/central figure/hero in one paragraph. Pick one, repeat it.
12. **False ranges** — "from X to Y" where X and Y aren't on a meaningful scale. List topics directly.
13. **Stock metaphors** — "load-bearing", "earns its keep", "carries the argument". Say plainly what the thing does: "important", "the rest depends on it".
14. **Salience flags and signposts** — "It's worth noting", "This matters.", "Here's the part that...", "The trap is...", "full stop". Delete the flag and state the point.
15. **Honesty prefaces** — "The honest answer is", "honestly", "frankly". Delete; the sentence stands without it.

### Style

16. **Em dash overuse** — avoid em dashes entirely. Use periods, commas, or parentheses. Em dashes are an AI tell.
17. **Colon overuse** — colons are fine before a list or example. Not as mid-sentence connectors. "If you're coming from traditional automation: instead of registering event handlers, you describe conditions" adds nothing with the colon. Rewrite to let the point stand on its own without comparison framing. "Describing when the scheduler should fire works best as plain English." Same meaning, no crutch punctuation.
18. **Boldface overuse** — don't bold every proper noun or acronym.
19. **Inline-header lists** — "**Performance:** Performance improved..." Convert to prose.
20. **Title case headings** — use sentence case.
21. **Decorative emojis** — remove from headings and bullets.
22. **Curly quotes** — replace with straight quotes.
23. **Punchy fragments** — one-line paragraphs for effect, "Not a detail. A design decision." Join them into the sentence they belong to.

### Communication artifacts

24. **Chatbot phrases** — "I hope this helps!", "Let me know if...", "Of course!", "Certainly!" Remove.
25. **Cutoff disclaimers** — "While specific details are limited..." Find sources or remove.
26. **Sycophantic tone** — "Great question! You're absolutely right!" Respond directly.
27. **Next-step narration** — "I'll now...", "Let me...", "Next, I'll...". Remove from finished text; state what was done or what is true.

### Filler

28. **Filler phrases** — "In order to" → "To". "Due to the fact that" → "Because". "It is important to note that" → delete.
29. **Excessive hedging** — "could potentially possibly be argued that it might" → "may".
30. **Generic conclusions** — "The future looks bright." State specific plans or facts.
