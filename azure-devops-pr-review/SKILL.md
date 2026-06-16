---
name: azure-devops-pr-review
description: Review a pull request hosted on Azure DevOps (dev.azure.com / visualstudio.com) end to end from the command line — resolve the PR, produce a clean reviewable diff with full repo context, then post findings back as inline PR comments. Use when given an Azure DevOps pull request URL or PR id to review or comment on, when `az repos` / `az devops invoke` auth or the diffs API misbehaves, or when the user invokes /azure-devops-pr-review.
---

# Review an Azure DevOps pull request

Drive an Azure DevOps PR review from the terminal: resolve the PR, get a trustworthy diff with
surrounding context, and post inline comments. The non-obvious part is the **plumbing** — Azure
DevOps auth, the diff API, and console encoding all have sharp edges. This skill encodes the path
that works so you don't rediscover it each time.

> Mechanics only. Apply your normal review judgement (or run `/code-review`) on the diff this produces.

## Prerequisites
- `az` CLI with the **azure-devops** extension (`az extension add --name azure-devops`).
- Signed in so the extension works (`az repos pr show ...` returns JSON) **and** `git clone` of the
  repo succeeds (a git credential manager has cached creds). Short version of the auth model: the
  **extension** and **`git clone`** work; raw bearer tokens often don't. See [REFERENCE.md](REFERENCE.md).

## 1. Parse the URL
Azure DevOps PR URLs look like:
```
https://dev.azure.com/<ORG>/<PROJECT>/_git/<REPO>/pullrequest/<PR_ID>
```
Extract `<ORG>`, `<PROJECT>`, `<REPO>`, `<PR_ID>`. The org base URL is `https://dev.azure.com/<ORG>`.

## 2. Resolve the PR
```bash
az repos pr show --id <PR_ID> --org https://dev.azure.com/<ORG> \
  --query "{title:title, status:status, source:sourceRefName, target:targetRefName, \
            repoId:repository.id, projectId:repository.project.id, \
            sourceCommit:lastMergeSourceCommit.commitId, \
            targetCommit:lastMergeTargetCommit.commitId}" -o json
```
Record the **source** (PR head) and **target** commits, and the repo/project ids. Works on open
*and* completed/merged PRs (you can still post comments on a merged PR — they land as discussion).

## 3. Get a reviewable diff (clone — don't fight the diffs API)
The REST `diffs` resource is unreliable through the extension (a version-parse bug — see REFERENCE).
Clone and diff locally; this also gives you whole-file context to read, not just hunks:
```bash
git clone --no-checkout https://dev.azure.com/<ORG>/<PROJECT>/_git/<REPO> repo && cd repo
git fetch origin <sourceCommit> <targetCommit>
git diff --stat <targetCommit>...<sourceCommit>   # 3-dot = changes since the merge-base only
git diff       <targetCommit>...<sourceCommit>
git checkout <sourceCommit> -- .                   # read files AT PR head for context
```
The three-dot form diffs from `git merge-base <target> <source>`, so you see the PR's own changes,
not unrelated target-branch drift.

## 4. Review
Read the diff **and** the surrounding code — entities/models, callers, DI/registration, sibling
implementations — before judging. A change is only correct in context (e.g. an invariant removed in
one file may have been silently relied on in another). Capture each finding as `file:line` +
severity + a concrete suggested fix.

## 5. Post inline comments
Each inline comment is a PR **thread** with a `threadContext`. Write the body to a JSON file (this
avoids shell-escaping markdown that contains backticks/quotes), then POST it:
```bash
az devops invoke --org https://dev.azure.com/<ORG> \
  --area git --resource pullRequestThreads \
  --route-parameters project=<PROJECT> repositoryId=<REPO> pullRequestId=<PR_ID> \
  --http-method POST --in-file thread.json --media-type application/json \
  --api-version 7.1 -o json > resp.json
```
Post **one** thread first and confirm the response has a numeric `id` and the expected
`threadContext.filePath` before sending the rest. Full thread/comment JSON schema, left-vs-right
side anchoring, and general (non-inline) comments are in [REFERENCE.md](REFERENCE.md).

## Console / encoding (bites on Windows every time)
- `export PYTHONUTF8=1 PYTHONIOENCODING=utf-8` before `az` calls, and redirect JSON to a file —
  `az rest` can crash trying to print Unicode through a legacy code page.
- `az devops invoke` prepends a line like `Please wait a couple of seconds...` before the JSON —
  strip everything before the first `[` or `{` when parsing.
- Parse captured output with `errors='replace'`; never assume the console code page is UTF-8.

See **[REFERENCE.md](REFERENCE.md)** for the auth model + troubleshooting, the full thread JSON
schema, and how to discover resource names/versions.
