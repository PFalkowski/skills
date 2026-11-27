@templates/CLAUDE.md
@templates/autonomy.md

# This repository is public
Everything here is world-readable, commits, branch names, PR text and comments included. Never name a private repository or anything that identifies one: its issue or PR numbers, paths, product or domain. Say "the managed repo" or "one lifecycle run" instead, and keep only counts that show scale.

# Changing a skill
A change to what a skill tells an agent to do is benchmarked while it is developed. Before editing, freeze the cases with [benchmark-skill](benchmark-skill/SKILL.md); before opening the PR, run the old text against the new and put the verdict, and what was not measured, in the PR. An edit that only fixes a typo or a link is exempt; a rewrite or a shortening is not. A REGRESSION verdict blocks the PR. An INCONCLUSIVE one goes in the PR with the observed counts, for the reviewer to weigh.
