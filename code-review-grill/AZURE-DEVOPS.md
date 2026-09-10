# Azure DevOps pull requests — mechanics

Reference for `code-review-grill` and `fix-pr` when the PR lives on Azure DevOps
(`dev.azure.com` / `visualstudio.com`). Read it when you need to resolve a PR, produce a
reviewable diff, or post inline comments there; the CLI is ordinary, the workarounds are not.

> Mechanics only. Apply your normal review judgement (or run `/code-review`) on the diff it produces.

## Prerequisites
- `az` CLI with the **azure-devops** extension (`az extension add --name azure-devops`).
- Signed in so the extension works (`az repos pr show ...` returns JSON) **and** `git clone` of the
  repo succeeds (a git credential manager has cached creds). Short version of the auth model: the
  **extension** and **`git clone`** work; raw bearer tokens (and the `mcp__azure-devops__*` MCP tools,
  which hit the same wall) often don't. See [the reference below](#reference).

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
The REST `diffs` resource is unreliable through the extension (a version-parse bug — see [below](#why-clone-instead-of-the-diffs-rest-resource)).
Clone and diff locally:
```bash
git clone --no-checkout https://dev.azure.com/<ORG>/<PROJECT>/_git/<REPO> repo && cd repo
git fetch origin <sourceCommit> <targetCommit>
git diff --stat <targetCommit>...<sourceCommit>   # 3-dot = changes since the merge-base only
git diff       <targetCommit>...<sourceCommit>
git checkout <sourceCommit> -- .                   # read files AT PR head for context
```
**Resolving an unfamiliar path or symbol** (before, or instead of, the full clone above): both
`git ls-tree -r <ref> --name-only | grep -i <keyword>` and `git grep <pattern> <ref>` search a remote
ref directly, no clone/checkout/archive needed. Don't guess a file's path from a class/symbol name
(they often don't match) or archive+extract a ref just to grep it — `git grep <pattern> <ref>` alone
does that.

## 4. Review
Read the diff **and** the surrounding code — entities/models, callers, DI/registration, sibling
implementations — before judging. A change is only correct in context (e.g. an invariant removed in
one file may have been silently relied on in another). Capture each finding as `file:line` +
severity + a concrete suggested fix. A nit opens with the nit marker
([REFERENCE](REFERENCE.md), § The nit marker) above its body.

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
side anchoring, and general (non-inline) comments are in [the reference below](#reference).

## Console / encoding (bites on Windows every time)
- `export PYTHONUTF8=1 PYTHONIOENCODING=utf-8` before `az` calls, and redirect JSON to a file —
  `az rest` can crash trying to print Unicode through a legacy code page.
- `az devops invoke` prepends a line like `Please wait a couple of seconds...` before the JSON —
  strip everything before the first `[` or `{` when parsing.
- Parse captured output with `errors='replace'`; never assume the console code page is UTF-8.

See **[the reference below](#reference)** for the auth model + troubleshooting, the full thread JSON
schema, and how to discover resource names/versions.

---

## Reference

All examples use placeholders `<ORG>` `<PROJECT>` `<REPO>` `<PR_ID>`
and commit shas `<sourceCommit>` (PR head) / `<targetCommit>` (merge target).

### Auth model — what works, what doesn't

Azure DevOps orgs backed by **personal / MSA accounts** are the common gotcha:

| Approach | Result |
|---|---|
| `az repos pr ...`, `az devops invoke ...` | ✅ Works — the azure-devops extension handles auth. |
| `git clone https://dev.azure.com/...` over HTTPS | ✅ Works — Git Credential Manager supplies cached creds. |
| Raw bearer token: `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798` then `curl`/`az rest` | ❌ Often redirects to a sign-in HTML page (`<html>...Sign In` / `Object moved`). AAD tokens are frequently not accepted for MSA-backed orgs. |
| `mcp__azure-devops__*` MCP tools (e.g. `repo_get_pull_request_by_id`) | ❌ Frequently hit the same MSA-org wall (`TF400813: not authorized`) even when the CLI works fine on the same PR. Don't try these first for PR resolution — use the CLI approach below. |

So: **prefer the extension and local git.** Don't burn time minting bearer tokens.

If `az devops invoke` *itself* returns sign-in HTML, you are not authenticated — run `az login`, or
`az devops login` with a Personal Access Token (`--organization https://dev.azure.com/<ORG>`), then retry.

`499b84ac-1321-427f-aa17-267ca6975798` is the well-known Azure DevOps application id (useful to
recognise in redirect URLs); it is not a secret.

### Why clone instead of the diffs REST resource

`az devops invoke --area git --resource diffs ...` is unreliable through the extension:
- at `--api-version 6.0/7.0`: `ERROR: --resource and --api-version combination is not correct`
- at preview versions: `ERROR: could not convert string to float: '7.1.1'` (a version-parse bug).

Clean up the temp clone when done.

### Posting comments — thread JSON schema

POST a thread to:
`git / pullRequestThreads`, route params `project`, `repositoryId`, `pullRequestId`, api-version `7.1`.

`project` and `repositoryId` accept **either** the GUIDs from `az repos pr show`
(`repository.project.id`, `repository.id`) **or** the `<PROJECT>` / `<REPO>` names straight from the URL.

#### Inline comment on an added/changed line (PR-head / "right" side)
```json
{
  "comments": [
    { "parentCommentId": 0, "commentType": "text", "content": "**Severity — title.**\n\nMarkdown body. Backticks and code fences are fine." }
  ],
  "status": "active",
  "threadContext": {
    "filePath": "/path/from/repo/root/File.cs",
    "rightFileStart": { "line": 77, "offset": 1 },
    "rightFileEnd":   { "line": 91, "offset": 1 }
  }
}
```
- A ⛏️ nit prepends the nit marker to `content`, before the severity line — an image in Markdown,
  so it survives the same JSON escaping as the rest of the body
  (`"![Ackchyually](https://raw.githubusercontent.com/PFalkowski/skills/main/code-review-grill/assets/ackchyually.png)\n\n**⛏️ — title.**\n\n…"`).
  Definition in [REFERENCE](REFERENCE.md), § The nit marker.
- `filePath` **must** start with `/` (path from repo root, forward slashes).
- `offset` is a **1-based column**. To highlight a whole line range, `rightFileStart.offset = 1` and
  `rightFileEnd.offset = (last line length) + 1`. A single point (start == end) is also accepted.
- Anchor `rightFile*` to line numbers in the **source/PR-head** version of the file (what `git diff`
  shows on the `+` side / the file after `git checkout <sourceCommit> -- .`) — read the actual
  checked-out file to get real 1-indexed line numbers; don't count from the diff's hunk-relative
  `@@` numbers, which reset per hunk and won't match.

#### Comment on a removed line (target / "left" side)
Use `leftFileStart` / `leftFileEnd` instead, with line numbers from the **target** version.
You can set both left and right for a comment that spans a replacement.

#### General (non-inline) PR comment
Omit `threadContext` entirely — the thread shows in the PR **Overview** discussion:
```json
{ "comments": [ { "parentCommentId": 0, "commentType": "text", "content": "Overview summary..." } ], "status": "active" }
```

#### Replying to / resolving threads
- Reply: POST to `pullRequestThreadComments` (route adds `threadId`), or PATCH a thread.
- `status` values: `active`, `fixed`, `wontFix`, `closed`, `pending`, `byDesign`. Use `active` for a
  finding that needs attention; `closed` for purely informational notes.

#### Always write the JSON to a file
Pass it with `--in-file thread.json --media-type application/json`. Building the JSON inline in a
shell string mangles the markdown (backticks, quotes, `$`). One file per thread keeps it clean and
lets you verify each `resp.json` independently.

### Discovering resource names / versions

`az devops invoke` with no `--area` lists every REST resource location:
```bash
az devops invoke --org https://dev.azure.com/<ORG> -o json > resources.json
```
Then strip the `Please wait...` preamble (everything before the first `[`) and search for the area +
resource you need, e.g. `area == "git"` and a `resourceName` containing `thread`
(→ `pullRequestThreads`, released version `7.1`). Use a resource's `releasedVersion` as `--api-version`.

### Encoding recipes (Windows)

```bash
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8     # before az calls
az ... -o json > out.json 2>err.txt            # redirect; don't print Unicode to a legacy code page
```
Parsing captured `az devops invoke` output (skips the preamble, tolerates bad bytes):
```python
raw = open("out.json", encoding="utf-8", errors="replace").read()
data = json.loads(raw[raw.find("["):])   # or raw.find("{") for a single object
```
Plain Windows installs often only have the `py` launcher on PATH (no `python3`/`python`) — use
`py -c "..."` if `python3` isn't found.
`az rest` may still raise `'charmap' codec can't encode ...` when writing to stdout — use
`--output-file <path>` (or the redirect above) and read the file back.
