# The Salvage — clearing worktrees nobody can clean up

```
/nights-watch salvage worktrees=C:/src/app-fix,C:/src/app-spike once            # run from the repository root
/nights-watch salvage worktrees=C:/src/app-fix,C:/src/app-spike max=1 once
/nights-watch salvage worktrees=C:/src/app-fix,C:/src/app-spike dry-run once    # classify and plan; change nothing
```

A worktree that holds unpushed commits, uncommitted changes, or ignored files that are not build output cannot be removed without losing work. The salvage preserves that work in pull requests (PRs), proves it is on a remote, and only then removes the worktree and its local branch. It is one-shot: `once` is implied, and there is no loop, muster or claim.

- **One session per repository**, started in that repository's root. Every path in `worktrees=` must be a linked worktree of this repository; anything else is refused.
- **`max=<n>`** caps how many worktrees this run touches (default 5). The first `n` eligible paths, in the order given, are worked; the rest are reported as `deferred`.
- **`dry-run`** runs steps 1 and 2 and reports the plan in the same JSON shape. It writes nothing, takes no lock, and pushes nothing.

## The outcomes (decided by the maintainer)

- A **feature** (a branch with coherent, reviewable work: its own purpose, tests or substantial code) gets **its own PR**, or its existing PR is updated.
- Everything else is a **leftover**. All leftovers of a run go into **one salvage PR per repository**.
- Once every commit of a worktree is on the branch of its PR and nothing else is left in it but build output, the worktree and its local branch are removed. Merging is not required first.
- A file that looks like a secret is **never committed**. Its worktree is left in place and reported.
- Never merge, approve, force-push, or delete a remote branch. Never push to a branch whose open PR another person authored.

## The guards are code

[`scripts/salvage-gate.sh`](scripts/salvage-gate.sh) decides every safety question, so no model decides when a destructive step is safe. Its [test](scripts/salvage-gate.test.sh) drives each refusal against real repositories.

| Command | Decides |
|---|---|
| `preflight <worktree>` | Eligible, or refused: not a linked worktree of this repository, the main worktree, locked, initialized submodules (their commits live in the folder removal deletes), a rebase, merge, bisect, cherry-pick or revert in progress, another worktree inside it, or a live Claude session that started in it. `claude agents --json` reports only the folder a session started in, so a session started elsewhere that edits the worktree is not seen. When the live sessions cannot be listed (`claude agents --json`, read with `jq`), every worktree is refused. |
| `secrets <worktree>` | Lists the uncommitted, untracked and ignored files that look secret, by name (`appsettings*.json`, `*settings.local.json`, `.env*`, keys and certificates, `secrets.*`, `credentials*`, `.npmrc`, `.netrc`) or by content (private-key headers, GitHub, AWS, Slack and Anthropic token shapes, connection-string passwords). Build output folders are skipped. Prints paths, never contents. |
| `push-check <dir> <ref>` | Passes only when no commit of `<ref>` that no remote holds adds a secret-looking file or line, merge commits included (against their first parent). Run before **every** push. |
| `discard <worktree> <pr-url>` | Re-runs `preflight`, fetches, then removes the worktree (`git worktree remove --force`) and its local branch (`git branch -D`) only when the PR is open or merged, HEAD is contained in that PR's branch on a remote, and nothing is left in the worktree except the build output folders. Otherwise it refuses and touches nothing. |

The build output folders, the only ignored files treated as disposable: `bin`, `obj`, `.vs`, `node_modules`, `coverage`, `__pycache__`, `TestResults`, `_preview`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.tox`, `.gradle`, `.next`, `.nuxt`, `.parcel-cache`, `.turbo`.

`discard` is stricter than the maintainer's rule, which allows uncommitted changes to be thrown away once the commits are safe. After step 3 nothing should be uncommitted, so anything that is means a writer missed it. Refusing costs one manual cleanup; the other way costs someone's work.

## Step by step

**1. Preflight** — the watcher. Take the lock `~/.agent-state/<repo-slug>/nights-watch/salvage/.lock/` (an `owner.md` naming host and start; older than 2 hours is stale), so two sessions never race on one salvage branch. Run `preflight` on every path. Refused paths go straight to the report with their reason; eligible paths past `max` are `deferred`. Running these deterministic commands on the main context is allowed by Oath rule 2: they are the guard itself, and the report says so.

**2. Classify** — one read-only agent for all eligible worktrees, at `medium` on the house worker tier. Per worktree it lists the unshipped work (commits no remote holds, including a detached HEAD; uncommitted and untracked changes; ignored files outside the build output folders), runs `secrets`, and returns:

```json
{ "path": "C:/src/app-fix", "branch": "fix/csv-export", "class": "feature",
  "why": "one purpose, a test and the fix", "existingPr": null,
  "keep": ["src/Export.cs", "tests/ExportTests.cs", "docs/notes.md"],
  "reported": [".claude/settings.local.json"], "discarded": ["bin/", "obj/"] }
```

`keep` holds every file to commit, ignored ones included; `reported` is exactly what `secrets` printed; `discarded` is build output only. A feature whose open PR another person authored is planned as `left-in-place`. A dry run stops here and reports.

**3. Preserve** — one writer agent per worktree, **one at a time**, because leftovers share a branch. Tier `medium`. The brief restates Oath rule 8: no commit message, PR title or body names this skill or its agents.

- First `push-check <worktree> HEAD`. If it fails, the worktree's own commits hold a secret: nothing of it is pushed, and it is left in place.
- Commit the `keep` files on the worktree's HEAD (`git add -f` for ignored ones), never a `reported` file. Then run `push-check` again.
- **Feature:** a detached HEAD gets a new branch, `feat/<slug>`, with `-2`, `-3` added when the name is taken on the remote. Push without force; a rejected push leaves it in place. Open a PR, or update the existing one by pushing to it.
- **Leftover:** the salvage branch is the head of an open PR whose branch starts `salvage/`, else a new `salvage/<YYYY-MM-DD>` from the default branch, checked out in `~/.agent-state/<repo-slug>/nights-watch/salvage/<date>/`. Merge the worktree's HEAD into it with `git merge --no-ff`, the message naming the source folder, its branch (or short sha) and why it is a leftover. On a conflict, `git merge --abort` and leave the worktree in place. Run `push-check` on the salvage branch, push it, and open the salvage PR once.

Why a merge and not a squashed commit: the issue asks for one commit per worktree, and a merge is exactly one commit per worktree on the salvage branch's main line. A squash would leave the worktree's original commits on no remote, so `discard` could never prove them safe.

The salvage PR body is one row per source: its folder name (never the absolute path, which can carry a user name), branch, reason, and **how many** secret-looking files stayed behind. The file names go only in the session report and the JSON, because a PR on a public repository is publication.

**4. Discard** — the watcher runs `discard <worktree> <pr-url>` for each preserved worktree. It is not delegated, for the same reason as step 1. A refusal leaves the worktree in place with its reason. A worktree holding a reported secret is always refused here, by construction, so the secret stays where it was. Finally, remove the salvage checkout with a plain `git worktree remove` and release the lock.

**5. Report** — a table for the human, then the JSON below as the **last fenced block** of the final message, so a caller can parse it.

## The report

```json
{
  "mode": "salvage",
  "repo": "C:/src/app",
  "dryRun": false,
  "salvagePr": "https://github.com/o/app/pull/88",
  "worktrees": [
    { "path": "C:/src/app-fix", "branch": "fix/csv-export", "outcome": "feature-pr",
      "pr": "https://github.com/o/app/pull/87", "reason": "one purpose, a test and the fix",
      "kept": ["src/Export.cs", "tests/ExportTests.cs"], "reported": [], "discarded": ["bin/", "obj/"],
      "removed": { "worktree": true, "branch": true } },
    { "path": "C:/src/app-spike", "branch": null, "outcome": "left-in-place",
      "pr": "https://github.com/o/app/pull/88", "reason": "secret-looking file kept in the worktree",
      "kept": ["docs/spike.md"], "reported": ["appsettings.json"], "discarded": [],
      "removed": { "worktree": false, "branch": false } },
    { "path": "C:/src/app-live", "branch": "wip", "outcome": "refused",
      "pr": null, "reason": "live Claude session started in it (C:\\src\\app-live)",
      "kept": [], "reported": [], "discarded": [],
      "removed": { "worktree": false, "branch": false } }
  ]
}
```

`outcome` is one of `feature-pr`, `salvaged`, `left-in-place`, `refused` or `deferred`. In a dry run it is the planned outcome, `pr` and `salvagePr` are null, and nothing is removed. A worktree whose work reached a PR but was not removed is `left-in-place` with its `pr` set, as the second row shows.

## Worked example: a dry run

Three worktrees are handed over with `max=2`. `app-fix` has two unpushed commits with a test; `app-spike` has a detached HEAD, an ignored `docs/spike.md` and an ignored `appsettings.json`; `app-old` is eligible but third in line.

1. `preflight` passes all three; `app-old` is past the cap and becomes `deferred`.
2. The classifier calls `app-fix` a feature and `app-spike` a leftover. `secrets` prints `appsettings.json` for `app-spike`.
3. The plan: `app-fix` gets its own PR and is removed; `app-spike` goes into the salvage PR with `docs/spike.md` and stays in place, because `appsettings.json` is reported and never committed.

The dry-run JSON carries `"dryRun": true`, `app-fix` as `feature-pr`, `app-spike` as `left-in-place` with `"kept": ["docs/spike.md"]` and `"reported": ["appsettings.json"]`, and `app-old` as `deferred`.
