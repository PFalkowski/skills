# Azure DevOps PR review — reference

Detail behind the [SKILL.md](SKILL.md) workflow: the auth model, the thread/comment JSON schema, and
how to discover REST resources. All examples use placeholders `<ORG>` `<PROJECT>` `<REPO>` `<PR_ID>`
and commit shas `<sourceCommit>` (PR head) / `<targetCommit>` (merge target).

## Auth model — what works, what doesn't

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

## Why clone instead of the diffs REST resource

`az devops invoke --area git --resource diffs ...` is unreliable through the extension:
- at `--api-version 6.0/7.0`: `ERROR: --resource and --api-version combination is not correct`
- at preview versions: `ERROR: could not convert string to float: '7.1.1'` (a version-parse bug).

Cloning and running `git diff <target>...<source>` is both reliable and gives you the full tree to
read for context. Clean up the temp clone when done.

## Posting comments — thread JSON schema

POST a thread to:
`git / pullRequestThreads`, route params `project`, `repositoryId`, `pullRequestId`, api-version `7.1`.

`project` and `repositoryId` accept **either** the GUIDs from `az repos pr show`
(`repository.project.id`, `repository.id`) **or** the `<PROJECT>` / `<REPO>` names straight from the URL.

### Inline comment on an added/changed line (PR-head / "right" side)
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
- `filePath` **must** start with `/` (path from repo root, forward slashes).
- `offset` is a **1-based column**. To highlight a whole line range, `rightFileStart.offset = 1` and
  `rightFileEnd.offset = (last line length) + 1`. A single point (start == end) is also accepted.
- Anchor `rightFile*` to line numbers in the **source/PR-head** version of the file (what `git diff`
  shows on the `+` side / the file after `git checkout <sourceCommit> -- .`) — read the actual
  checked-out file to get real 1-indexed line numbers; don't count from the diff's hunk-relative
  `@@` numbers, which reset per hunk and won't match.

### Comment on a removed line (target / "left" side)
Use `leftFileStart` / `leftFileEnd` instead, with line numbers from the **target** version.
You can set both left and right for a comment that spans a replacement.

### General (non-inline) PR comment
Omit `threadContext` entirely — the thread shows in the PR **Overview** discussion:
```json
{ "comments": [ { "parentCommentId": 0, "commentType": "text", "content": "Overview summary..." } ], "status": "active" }
```

### Replying to / resolving threads
- Reply: POST to `pullRequestThreadComments` (route adds `threadId`), or PATCH a thread.
- `status` values: `active`, `fixed`, `wontFix`, `closed`, `pending`, `byDesign`. Use `active` for a
  finding that needs attention; `closed` for purely informational notes.

### Always write the JSON to a file
Pass it with `--in-file thread.json --media-type application/json`. Building the JSON inline in a
shell string mangles the markdown (backticks, quotes, `$`). One file per thread keeps it clean and
lets you verify each `resp.json` independently.

## Discovering resource names / versions

`az devops invoke` with no `--area` lists every REST resource location:
```bash
az devops invoke --org https://dev.azure.com/<ORG> -o json > resources.json
```
Then strip the `Please wait...` preamble (everything before the first `[`) and search for the area +
resource you need, e.g. `area == "git"` and a `resourceName` containing `thread`
(→ `pullRequestThreads`, released version `7.1`). Use a resource's `releasedVersion` as `--api-version`.

## Encoding recipes (Windows)

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
