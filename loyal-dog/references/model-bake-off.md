# Model bake-off — provenance of this design

`loyal-dog`'s design was chosen by evidence, not vibes. Before writing any code we ran a
controlled bake-off (per the `model-bake-off` skill): the identical design brief was given to
three model tiers at matched effort, the outputs were scored **blind** against a rubric written
*before* any output was read, every load-bearing complexity claim was **verified**, and the
candidates were ranked by **actual dollar cost** — not token count. This file records that run so
the design decisions are auditable.

## Task class

Skill/spec design — creative + architectural generation of a self-contained agent skill from a
prose brief. The recommendation below generalizes only within this class (design/architecture of a
file-based tool), not to code implementation or long-horizon agentic execution.

## The brief — verbatim prompt (for reproduction)

Each of the three models received **this exact prompt** (identical, character-for-character):

```
Design a Claude Code "skill" called **loyal-dog**: a cross-context memory that follows the
user across sessions and projects, like a loyal dog following its owner wherever they go and
writing things down. It is FILE-BASED (must work on any OS/architecture with no database
engine, no server). As the memory grows large, retrieval must be **O(log N) or faster** — not
a linear scan of everything.

A "skill" here is a Markdown file (SKILL.md) with YAML frontmatter (name + description) that
Claude Code loads and follows; it can bundle helper files. Skills use progressive disclosure
and a description that routes the right requests to them.

Produce a DESIGN (not a full implementation). Cover exactly these five parts, clearly labeled:

1. **Core concept + trigger** — what loyal-dog is, and when/how it activates.
2. **On-disk data structure for sub-linear retrieval** — the concrete file/directory layout
   that makes lookup O(log N) or better as N memories grow. Include a WORKED explanation of
   *why* the complexity holds. Be rigorous and honest about the Big-O — including which
   operations remain linear (e.g. full-content/semantic search) and why. Do not claim a
   complexity the structure does not actually deliver.
3. **Cross-platform, atomicity & corruption-safety** — atomic writes, Windows-vs-POSIX
   path/locking concerns, recovery from a half-written file.
4. **Capture → index → retrieve workflow** — how the dog records a memory, indexes it, and
   later finds it. The loop must close: what gets written must be findable.
5. **SKILL.md frontmatter sketch** — a `name:` and a `description:` that would actually route
   relevant requests to this skill.

Be precise and concise. Return the design directly as your final message (it is the
deliverable, not a message to a human).
```

**Harness / reproduction settings:**
- Invoked via three parallel subagents (Claude Code `Agent` tool), one per model, with the
  prompt above sent identically to each.
- Model IDs: `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-5`.
- Effort: matched — inherited session effort, identical across all three; no per-agent override.
- No system-prompt / tool / temperature customization beyond the model override; each agent
  returned its design as its final message.

## Candidates & pricing

Per-token rates pulled from the `claude-api` skill (not from memory), cache dated 2026-06-24:

| Model | Input $/1M | Output $/1M |
|---|---|---|
| Fable 5 (`claude-fable-5`) | $10.00 | $50.00 |
| Opus 4.8 (`claude-opus-4-8`) | $5.00 | $25.00 |
| Sonnet 5 (`claude-sonnet-5`) | $3.00 ($2.00 intro thru 2026-08-31) | $15.00 ($10.00 intro) |

## What each model proposed (mechanism for sub-linear retrieval)

All three cleared the capability floor: each grounded its O(log N) claim in a **real** mechanism
*and* honestly conceded that full-content / semantic search stays O(N). None fabricated a Big-O.

| Model | Mechanism | Notable |
|---|---|---|
| **Fable 5** | Prefix trie `terms/<c1>/<c2>/<term>.tsv`; leans O(log N) on the filesystem's own directory B-tree | Most *honest* about its weak points (postings-rewrite inserts, FAT32 caveat) |
| **Opus 4.8** | Hash-sharded objects + **append-only** postings (O(1) locate, O(k) read, **O(1) inserts**) + byte-offset binary search on a sorted keys file; **lockless** writes via unique ULID | Cleanest, most elegant; caught the lockless-write and `mkdir`-mutex insights |
| **Sonnet 5** | Full **LSM-tree**: O(1) delta-log append → leveled merge (O(log N) amortized insert), **fixed-width-record** binary search (`k×width` byte offset) | Most rigorous; explicitly **named and avoided** the "sorted flat file = O(N) writes" trap |

## Scores (blind, weighted) & cost

Rubric criteria and weights: retrieval-complexity correctness ×3 (the load-bearing one),
cross-platform durability ×2, skill-idiom fit ×2, completeness ×1, concision ×1. Cost-efficiency
scored last, after pricing. Tokens are the run's billable totals; the **dollar ranking is
identical under every input/output split tried** (all-input floor, 40/60, 20/80), so it is robust.

| Model | Quality (÷9 wtd) | Tokens | $ @ 40/60 split | **Quality ÷ $** |
|---|---|---|---|---|
| **Sonnet 5** | 4.67 | 42,385 | **$0.38** | **🏆 12.3** |
| **Opus 4.8** | **4.83** | 35,983 | $0.61 | 7.9 |
| **Fable 5** | 4.61 | 32,444 | $1.10 | 4.2 |

**The token-count trap, observed live:** Sonnet emitted the **most** tokens (42k) yet is the
**cheapest** in dollars; Fable emitted the **fewest** (32k) yet costs **~3× more**. Ranking by
tokens would have inverted the truth — which is exactly why the bake-off rule is "rank by dollars."

## Verdict (per task-class)

- **🏆 Best value / default pick — Sonnet 5.** Within 3% of Opus's quality, cheapest by a wide
  margin, best quality-per-dollar by far. On the single most important criterion it produced the
  most rigorous design of the three.
- **Best absolute answer — Opus 4.8.** Highest quality (elegance + correctness + the lockless /
  mkdir-mutex insights), at a modest ~1.6× premium over Sonnet. Pick it when you want the single
  best design and cost is secondary.
- **Over-provisioned here — Fable 5.** Genuinely excellent and the most honest/concise, but **no
  quality edge** on this bounded design task while costing the most. Reserve it for hard
  long-horizon work that needs the headroom.
- No "framing pre-pass" tier applies — every model delivered a real, buildable design.

## How the verdict shaped the shipped skill

The implementation synthesizes the best of all three, favoring the design that scored highest on
the load-bearing criterion while keeping inserts cheap and the store portable:

- **Opus's** hash-sharded, **append-only** inverted index (O(1) locate / O(k) read / **O(1)
  inserts**) and **lockless writes via unique ULID names** — the cheapest-insert, most-portable core.
- **Sonnet's** rigor about *why* the Big-O holds on disk (byte-addressable lookup, honest about the
  O(N) content-search floor) — reflected in `references/format.md`.
- **Fable's** `doctor --rebuild` (index is a rebuildable cache; memory files are truth) and the
  **post-capture closure self-test** (recall the just-written memory by its own term; report `kept`
  only if the index surfaces it).
