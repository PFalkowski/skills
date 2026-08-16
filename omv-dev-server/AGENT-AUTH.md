# Letting an agent push and open a PR

An agent finishes the work, commits it, and cannot push. Every blocker is in the image, not
the code — and the five error messages look like five unrelated problems.

The premise that makes this hard: **the agent has no terminal**. Every interactive fallback
is a hang rather than an error, and its shell state does not persist between tool calls, so
`export GH_TOKEN=…` is gone by the next command. Authentication has to be already there.

## Check egress first

One command saves an hour of investigating the wrong thing:

```bash
curl -sI https://api.github.com | head -1      # HTTP/2 200
```

Network is usually fine. It is authentication that is missing, and the errors do not say so.

## The four rules

### 1. Credential helper at *system* scope

```dockerfile
RUN git config --system credential.helper '!gh auth git-credential'
```

`git push` then authenticates through whatever token `gh` holds — no per-command flags,
nothing written to the user's config. System scope matters twice: it survives a fresh home
directory, and it avoids writing to a `~/.gitconfig` that may be mounted read-only.

### 2. Never run `gh auth setup-git` at runtime

The obvious command is the one that fails. It writes to `~/.gitconfig`, and git saves config
by temp-file-and-rename, which a bind-mounted file rejects:

```
$ gh auth setup-git
failed to set up git credential helper: failed to run git:
error: could not write config file /root/.gitconfig: Device or resource busy
```

Rule 1 makes it unnecessary. If you would rather keep `setup-git`, mount the home
*directory* rather than the gitconfig file — see [DEVCONTAINER.md](DEVCONTAINER.md).

### 3. Token from the run environment

```bash
if [ -n "${GH_TOKEN:-}" ]; then args+=( -e "GH_TOKEN=${GH_TOKEN}" ); fi
```

`gh` reads `GH_TOKEN` directly, so there is no login step and no interactive flow to hang
on. Pass it **only when set** — an empty `GH_TOKEN=` is worse than absent, because `gh`
treats it as a configured-but-broken credential instead of falling back to a stored login.

**Never bake a token into an image layer.** It remains in the layer after you delete it from
a later one. Runtime environment only.

A fine-grained token scoped to the repositories in play, with **contents: write** and
**pull requests: write**, is enough to push and open PRs.

### 4. Make the failure legible

```dockerfile
ENV GIT_TERMINAL_PROMPT=0
```

Without it, git reports the absent terminal rather than the absent credential, and whoever
reads the message goes hunting a broken mount:

```
unset:  fatal: could not read Username for 'https://github.com': No such device or address
=0:     fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

Setting the variable to the empty string also disables prompts — only genuinely unsetting it
(`env -u GIT_TERMINAL_PROMPT`) restores the confusing message. Worth knowing when you try to
reproduce this.

### Also: install `openssh-client`, or remove the keys

A private key sitting in `~/.ssh` with **no `ssh` binary in the image** costs real debugging
time — the key's presence says "SSH is the way in", and git cannot use a key without the
client. Either install `openssh-client`, or, if the image is deliberately HTTPS-only, delete
the stray keys so the next reader is not misled. `jq` belongs in the same install line;
scripts assume it exists.

## Smoke test

Run on a cold container, as the last build step or on first boot, so it fails loudly rather
than at the moment someone needs to push:

```bash
gh --version                                  # binary present, pinned version
gh auth status                                # token reachable
git config --system --get credential.helper   # !gh auth git-credential
command -v ssh && command -v jq               # present, or knowingly absent
git ls-remote --heads origin >/dev/null && echo "push path OK"
```

The last line exercises the real credential path against the real remote without writing
anything. One caveat when interpreting it: against a **public** repository it succeeds
anonymously, so it proves reachability rather than authentication. Point it at a private
repo to test the credential.

## Fallback when you cannot change the image

```bash
git -c credential.helper='!gh auth git-credential' push -u origin <branch>
```

This works and is what gets a blocked PR out today. It is not the fix — every future call
has to remember the flag.

A human can also run `gh auth login` from their own prompt, complete the device flow in a
browser, and leave the credential behind for the agent to inherit. The agent cannot drive
that flow itself; the device-code prompt needs a TTY and simply hangs without one.

## Security notes

- `gh` stores credentials in plain text and says so at login. The container usually outlives
  the session. Prefer a short-lived `GH_TOKEN` that expires on its own, or revoke the
  authorization when the job is done.
- Scope tokens to the repositories actually in play. An agent with org-wide write is a much
  larger blast radius than the task needs.
