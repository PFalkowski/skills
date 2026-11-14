---
name: unslop
description: 'Remove AI writing patterns from docs, READMEs, posts and other prose so it sounds human.'
license: MIT
metadata:
  author: Lauren Tan (noodle), adapted by Piotr Falkowski
  copyright: "© 2026 Lauren Tan; adaptation © 2026 Piotr Falkowski"
  source: https://github.com/PFalkowski/skills
  upstream: https://github.com/poteto/noodle/blob/00ad13458e5aeed004396835d0844b620396d86c/.agents/skills/unslop/SKILL.md
---

# Unslop

Edit text to remove AI patterns and add a human voice.

## Process

1. Scan for the patterns below.
2. Rewrite, keeping the meaning and the intended tone.
3. Add soul (next section).
4. Self-audit: ask "What makes this obviously AI generated?" and fix the remaining tells.

## Adding soul

Sterile, voiceless writing is as obvious as the patterns.

- **Have opinions.** React to facts instead of neutrally listing pros and cons.
- **Vary rhythm.** Mix short sentences with longer ones that take their time.
- **Acknowledge complexity.** "Impressive but also kind of unsettling" beats "impressive."
- **Use "I" when it fits.** First person isn't unprofessional.
- **Let some mess in.** Perfect structure feels algorithmic.
- **Be specific.** Not "this is concerning" but "agents churning away at 3am is unsettling."

## Patterns to detect and fix

### Content

1. **Significance inflation.** "pivotal moment", "testament to", "evolving landscape", "setting the stage for", "indelible mark", "deeply rooted". Cut the puffery and state what happened.
2. **Notability name-dropping.** Listing media outlets without context. Pick one and say what it said.
3. **Superficial -ing phrases.** Clauses such as "highlighting...", "ensuring...", "reflecting...", "showcasing...", "fostering...". Delete them or expand them with real sources.
4. **Promotional language.** nestled, vibrant, breathtaking, groundbreaking, renowned, stunning, must-visit. Use neutral description.
5. **Vague attributions.** "Experts believe", "Industry reports suggest", "Some critics argue". Name the source or delete.
6. **Formulaic challenges.** "Despite challenges... continues to thrive." Replace with specific facts.

### Language

7. **AI vocabulary.** Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant. Use plain words.
8. **Copula avoidance.** "serves as", "stands as", "boasts", "features". Say "is" or "has".
9. **Negative parallelisms.** "It's not just X, it's Y", and the trailing contrast against an alternative nobody proposed: "It's a topology, not a genre." State the point directly. Keep a contrast that corrects a likely misreading: "Use rebase, not merge."
10. **Rule of three.** Forcing ideas into groups of three. Use the natural number.
11. **Synonym cycling.** Protagonist, main character, central figure and hero in one paragraph. Pick one name and repeat it.
12. **False ranges.** "From X to Y" where X and Y are not on a meaningful scale. List the topics directly.
13. **Stock metaphors.** "load-bearing", "earns its keep", "carries the argument", used figuratively. Say plainly what the thing does: "the rest depends on it", "important". Keep the literal sense, such as a load-bearing wall.
14. **Salience flags and signposts.** "It's worth noting", "This matters.", "Here's the part that...", "The trap is...", "full stop". Delete the flag and state the point.
15. **Honesty prefaces.** "The honest answer is", "honestly", "frankly". Outside quotations, delete them; the sentence stands without them.

### Style

16. **Em dash overuse.** Use no em dashes at all. Use periods, commas or parentheses.
17. **Colon overuse.** Colons are fine before a list or example, not as mid-sentence connectors. Rewrite "If you're coming from traditional automation: instead of registering event handlers, you describe conditions" so the point stands on its own, without the colon or the comparison framing: "Describing when the scheduler should fire works best as plain English."
18. **Boldface overuse.** Don't bold every proper noun or acronym.
19. **Inline-header lists.** "**Performance:** Performance improved..." Convert to prose.
20. **Title case headings.** Use sentence case.
21. **Decorative emojis.** Remove them from headings and bullets.
22. **Curly quotes.** Replace them with straight quotes.
23. **Punchy fragments.** Verbless one-line paragraphs for effect, such as "Not a detail. A design decision." Join them into the sentence they belong to. A short complete sentence, such as "Requires Python 3.10.", stays.

### Communication artifacts

24. **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Of course!", "Certainly!" Remove them.
25. **Cutoff disclaimers.** "While specific details are limited..." Find sources or remove.
26. **Sycophantic tone.** "Great question! You're absolutely right!" Respond directly.
27. **Next-step narration.** "I'll now...", "Let me...", "Next, I'll...". Remove from finished text; state what was done or what is true. Keep a promised follow-up, stated as a plan: "The runbook update follows in a separate PR."

### Filler

28. **Filler phrases.** "In order to" becomes "To". "Due to the fact that" becomes "Because". Delete "It is important to note that".
29. **Excessive hedging.** "could potentially possibly be argued that it might" becomes "may".
30. **Generic conclusions.** "The future looks bright." State specific plans or facts.
