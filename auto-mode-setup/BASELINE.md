# Baseline rule sets

Starting points, not a drop-in file. Every rule below carries the reason it exists so you can drop
the ones that do not apply to the tree in front of you. A rule nobody can justify is a rule that
gets deleted in six months by someone who assumes it was cargo-culted.

Rule syntax reminders that bite in practice:

- `:*` is recognised **only at the end** of a pattern. `Bash(git:* push)` matches nothing.
- `Bash(ls:*)` and `Bash(ls *)` are equivalent forms.
- Deny rules match past a leading environment assignment, so `Bash(rm *)` still catches
  `FOO=bar rm -rf tmp/`. Allow rules do **not** match past an assignment of an unknown variable.
- `Bash(*)` and a bare `Bash` are the same rule. As a deny, both remove the tool entirely.

---

## The deny list — user scope, `~/.claude/settings.json`

This is the part that matters. Ordered by what it protects.

### Irreversible history loss

```
Bash(git push --force:*)
Bash(git push -f:*)
Bash(git reset --hard:*)
Bash(git clean -fdx:*)
Bash(git filter-branch:*)
Bash(git branch -D:*)
Bash(git tag -d:*)
Bash(git push --delete:*)
Bash(git push origin --delete:*)
Bash(git reflog expire:*)
```

Force-push and `reset --hard` are the two that actually destroy unattended work. `--force-with-lease`
is deliberately absent from the deny list — it is the safe form, and denying it pushes people toward
the unsafe one. Add it only if you want no rewriting at all.

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

Safe in any repo, read-only, and frequent enough in real transcripts to be worth the rule. Anything
in Claude Code's built-in read-only set is deliberately **omitted** — those never prompt.

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

Deliberately absent everywhere: `git push` in any form. Let the agent commit freely and push
through the one path you have reviewed — a skill like `go-go-go` or `merge-stack` — rather than as
an ambient standing grant.

---

## Cross-checking a finished setup

```bash
claude --debug                     # confirm which files and rules loaded
```

Then in a sample repo, confirm three things by observation rather than by reading JSON: the session
starts in auto mode, one representative denied command is refused, and the rules still apply from a
worktree of the repo as well as the main checkout.
