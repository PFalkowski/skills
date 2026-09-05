# Baseline rule sets

Starting points, not a drop-in file. Every rule below carries the reason it exists so you can drop
the ones that do not apply to the tree in front of you. A rule nobody can justify is a rule that
gets deleted in six months by someone who assumes it was cargo-culted.

Rule syntax reminders that bite in practice:

- `:*` is recognised **only at the end** of a pattern. `Bash(git:* push)` matches nothing.
- `Bash(ls:*)` and `Bash(ls *)` are equivalent forms.
- A `*` can appear anywhere in a rule — start, middle, or end — not only in trailing position.
  `Bash(git push * --force)` matches `git push origin main --force` even though the flag is not
  the token right after the subcommand.
- A trailing `*` (with a space before it) also matches the bare command, but only when it is the
  rule's **only** wildcard. Once a rule already has a `*` earlier in the pattern, a trailing `*`
  requires something to actually follow it — it stops covering the bare form. That is why a flag
  in trailing position, like `--force`, needs two rules below: one with a trailing `*` and one
  without.
- An **allow** rule with a `*` before the subcommand (e.g. `Bash(git * main)`) is flagged at
  startup and does not auto-approve, because it would also match options inserted at that
  position. A **deny** rule carries no such warning. Every rule below keeps the `*` after the
  subcommand for this reason.
- Deny rules match past a leading environment assignment, so `Bash(rm *)` still catches
  `FOO=bar rm -rf tmp/`. Allow rules do **not** match past an assignment of an unknown variable.
- `Bash(*)` and a bare `Bash` are the same rule. As a deny, both remove the tool entirely.

---

## The deny list — user scope, `~/.claude/settings.json`

This is the part that matters. Ordered by what it protects.

### Irreversible history loss

```
Bash(git push --force:*)
Bash(git push * --force)
Bash(git push * --force *)
Bash(git push -f:*)
Bash(git push * -f)
Bash(git push * -f *)
Bash(git push --delete:*)
Bash(git push origin --delete:*)
Bash(git push * --delete)
Bash(git push * --delete *)
Bash(git push -d:*)
Bash(git push * -d)
Bash(git push * -d *)
Bash(git push --mirror:*)
Bash(git push * --mirror)
Bash(git push * --mirror *)
Bash(git push * +*)
Bash(git reset --hard:*)
Bash(git clean -fdx:*)
Bash(git filter-branch:*)
Bash(git branch -D:*)
Bash(git tag -d:*)
Bash(git reflog expire:*)
```

Force-push and `reset --hard` are the two that actually destroy unattended work. `--force-with-lease`
is deliberately absent from the deny list — it is the safe form, and denying it pushes people toward
the unsafe one. Add it only if you want no rewriting at all.

The `git push` rules above come in pairs because the flag can land as the last token of the command
(`git push origin main --force`) or with more after it (`git push origin main --force --quiet`); a
single trailing-wildcard rule only covers the second shape once the pattern already has an earlier
wildcard — see the syntax reminders at the top of this file. The leading-flag rules
(`Bash(git push --force:*)` and siblings) stay too: they catch the flag written right after `push`,
a shape the `* --flag` rules do not match. One destructive shape has no expressible rule at all —
see the note under the allow list below, where `git push` itself is granted.

### Publishing and outward-facing actions

An unattended agent must not ship. These are the ones that reach other people.

```
Bash(dotnet nuget push:*)
Bash(nuget push:*)
Bash(npm publish:*)
Bash(pnpm publish:*)
Bash(cargo publish:*)
Bash(gh release create:*)
Bash(gh pr merge:*)
Bash(gh repo delete:*)
Bash(docker push:*)
```

Relevant to any tree holding public packages: a mistaken `dotnet nuget push` cannot be withdrawn,
only delisted, and the version number is burned permanently.

### Infrastructure and data

```
Bash(terraform destroy:*)
Bash(terragrunt destroy:*)
Bash(az group delete:*)
Bash(az sql server delete:*)
Bash(az sql db delete:*)
Bash(az postgres flexible-server delete:*)
Bash(az storage account delete:*)
Bash(az functionapp delete:*)
Bash(kubectl delete:*)
Bash(dotnet ef database drop:*)
```

`dotnet ef database drop` and `az group delete` are the two that turn a bad night into a bad week.

Enumerate the specific `az ... delete` verbs rather than writing `Bash(az * delete:*)`. The broad
form is tempting, but deny carries no exceptions, so the first repo that legitimately needs one
delete verb forces you to unpick the whole rule. Listing them costs ten lines and stays surgical.

---

## The ask tier — the one people skip

`ask` is the right home for commands that are legitimate during interactive work but must never
proceed unwatched. Denying these is too blunt: it breaks the human's own workflow, and the usual
next step is someone disabling the rule entirely.

```
Bash(terraform apply:*)
Bash(terragrunt apply:*)
Bash(terragrunt force-unlock:*)
Bash(dotnet ef database update:*)
Bash(dotnet ef migrations remove:*)
Bash(docker system prune:*)
Bash(docker volume rm:*)
Bash(docker volume prune:*)
```

The failure mode is the point. In an interactive session these prompt, and you approve them in a
second. In an unattended run there is nobody to answer, so the agent **stalls instead of applying**
— exactly the outcome you want from `terraform apply` at 03:00.

Note that `ask` beats `allow` across every scope, so an ask rule here overrides a repo that has
already granted the same command via "Yes, don't ask again". That is usually what you want, and it
is the main reason to prefer `ask` over trusting per-repo hygiene.

### Filesystem

```
Bash(rm -rf /:*)
Bash(rm -rf ~:*)
Bash(sudo:*)
Bash(chmod -R 777:*)
```

`sudo` denied outright is the right default for an unattended agent. If a run genuinely needs
privilege, that is a decision for a human at the time, not a standing grant.

### Secrets and credentials

```
Read(**/.env)
Read(**/.env.*)
Read(~/.aws/**)
Read(~/.ssh/**)
Read(~/.azure/**)
Read(~/.claude/.credentials.json)
Read(**/*.pfx)
Read(**/*.pem)
Read(**/id_rsa*)
Read(**/appsettings.*.Production.json)
```

Use `~/` or `//` absolute forms in **user** settings. A bare `Read(/secrets/**)` written in user
settings resolves against the home directory, not against each project — a common silent no-op.

A `Read` deny also blocks Edit and Write on the same path. It does **not** block a subprocess that
opens the file itself. See the sandbox note in SKILL.md.

### Network exfiltration

```
Bash(curl * -d:*)
Bash(curl * --data:*)
Bash(wget --post-data:*)
```

Optional, and noisy in repos that legitimately POST to local services. Include it where the tree
holds anything worth exfiltrating; skip it where it will just generate friction.

---

## The allow list — user scope

Frequent enough in real transcripts to be worth the rule, and safe in any repo — with one
exception. `Bash(git push:*)` is the one rule in this block that is not read-only; it is granted
because the deny-list pairs under "Irreversible history loss" above cover the destructive forms.
See the note after the block for what that does and does not close off. Everything else here is
read-only, and anything already in Claude Code's built-in read-only set is deliberately
**omitted** — those never prompt.

```
Bash(git log:*)
Bash(git diff:*)
Bash(git status:*)
Bash(git show:*)
Bash(git branch:*)
Bash(git rev-parse:*)
Bash(git ls-files:*)
Bash(git ls-tree:*)
Bash(git merge-base:*)
Bash(git rev-list:*)
Bash(git cat-file:*)
Bash(git check-ignore:*)
Bash(git remote -v:*)
Bash(git worktree list:*)
Bash(git push:*)
Bash(gh pr view:*)
Bash(gh pr list:*)
Bash(gh issue view:*)
Bash(gh issue list:*)
Bash(gh run view:*)
Bash(gh run list:*)
Bash(gh api:*)
Bash(docker ps:*)
Bash(docker images:*)
Bash(docker inspect:*)
Bash(docker logs:*)
Bash(dotnet --version:*)
Bash(dotnet --list-sdks:*)
```

`gh api` is read-only only by convention — it will happily `-X DELETE`. Narrow it to
`Bash(gh api -X GET:*)` if the tree contains repos you do not control.

`Bash(git push:*)` relies entirely on the deny-list pairs above to stay safe: `--force`, `-f`,
`--delete`, `-d`, `--mirror`, and the `+` force-refspec are all blocked, in both leading and
trailing position. The colon delete-refspec is not: `git push <remote> :<branch>` gets through
whether the colon-refspec is the last token (`git push origin :b1`) or has more after it
(`git push origin :b1 main`). `:*` is always read as the ordinary trailing-wildcard suffix, never
as a literal colon, no matter where in the pattern it sits — so a rule like `Bash(git push * :* *)`
does not narrow the gap to "only when nothing follows the colon", it matches nothing at all and
blocks nothing. There is no variant of that pattern this permission system can express that
catches the colon-refspec in any position — this is a real gap in what it can express, not an
oversight to patch with a cleverer pattern. `--force-with-lease` also stays ungated, as noted
above, deliberately.

---

## Per-repo overrides — `<repo>/.claude/settings.json`

Grant here, never in the baseline. Commit the file.

**A .NET library or service:**

```json
{
  "permissions": {
    "allow": [
      "Bash(dotnet build:*)",
      "Bash(dotnet test:*)",
      "Bash(dotnet restore:*)",
      "Bash(dotnet format:*)"
    ]
  }
}
```

**A repo with an MCP server or local tooling to run:**

```json
{
  "permissions": {
    "allow": ["Bash(dotnet run --project tools/:*)", "Bash(npm run:*)"]
  }
}
```

**An infrastructure repo** — grant the read half only, and leave `apply` to a human:

```json
{
  "permissions": {
    "allow": ["Bash(terraform plan:*)", "Bash(terraform validate:*)", "Bash(terraform fmt:*)"]
  }
}
```

---

## Cross-checking a finished setup

```bash
claude --debug                     # confirm which files and rules loaded (interactive only —
                                   # the -p print mode emits no permission lines)
```

Then in a sample repo, confirm three things by observation rather than by reading JSON: the session
starts in auto mode, one representative denied command is refused, and the rules still apply from a
worktree of the repo as well as the main checkout.
