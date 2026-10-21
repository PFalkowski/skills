# Dev image for agent work. Swap the base for your stack; everything below the toolchain
# is what makes an agent able to finish a job without a human at a terminal.
#
# Runs as an ARBITRARY uid — the launcher passes --user "$(id -u):$(id -g)" so files written
# into the mounted repo stay owned by the host user. Nothing here may assume /root or a
# named account; HOME is injected at runtime.
# From .NET 10 on, the sdk images are Ubuntu; there is no Debian variant. Pinned to noble
# (24.04) because the userdel below assumes it, and a newer Ubuntu is already tagged.
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble

# The Ubuntu base ships a user `ubuntu` with uid 1000. The launcher's generated /etc/passwd
# starts from the image's, so on a host whose dev user is uid 1000 that entry would win
# getpwuid() and point ssh at /home/ubuntu instead of /dev-home.
RUN userdel --remove ubuntu

ENV DEBIAN_FRONTEND=noninteractive

# openssh-client: a key in ~/.ssh with no ssh binary is a decoy that costs real debugging
# time. jq: scripts assume it exists. tmux: long runs survive a dropped mobile connection.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg git openssh-client \
        jq tmux ripgrep less nano procps unzip \
    && rm -rf /var/lib/apt/lists/*

ARG NODE_MAJOR=22
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI, pinned and checksum-verified. The apt route tracks upstream automatically but
# is unpinned, and a CLI that changes behaviour under an unchanged Dockerfile is the hardest
# class of build regression to trace. The tarball MUST keep its release filename —
# `sha256sum -c` reads the name from the checksum list.
ARG GH_VERSION=2.63.2
RUN set -eux; \
    cd /tmp; \
    pkg="gh_${GH_VERSION}_linux_amd64.tar.gz"; \
    curl -fsSL -o "$pkg" \
      "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${pkg}"; \
    curl -fsSL -o gh_checksums.txt \
      "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_checksums.txt"; \
    grep " ${pkg}\$" gh_checksums.txt | sha256sum -c -; \
    tar -xzf "$pkg"; \
    install -m755 "gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh; \
    rm -rf "$pkg" gh_checksums.txt "gh_${GH_VERSION}_linux_amd64"

# Headless browser, so an agent can look at a page instead of only reasoning about it. Chrome
# stable at the path chrome-devtools MCP looks in by default; its apt dependencies also cover
# Playwright's. Installing libraries later is impossible: the runtime user has no root and no
# apt lists.
# --no-sandbox is baked into a wrapper because Chrome's sandbox needs user namespaces, which
# Docker's default seccomp profile blocks; the container is the isolation boundary. The wrapper
# keeps the real binary in the same directory, since Chrome finds its resources next to itself.
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable fonts-liberation \
 && rm -rf /var/lib/apt/lists/* \
 && mv /opt/google/chrome/chrome /opt/google/chrome/chrome.real \
 && printf '#!/bin/sh\nexec /opt/google/chrome/chrome.real --no-sandbox "$@"\n' > /opt/google/chrome/chrome \
 && chmod 755 /opt/google/chrome/chrome

# Docker CLI only, no daemon: the launcher mounts the host socket when DEV_DOCKER_SOCK=1 (see
# DEVCONTAINER.md for what that grants). Needed by Testcontainers-style integration tests.
RUN . /etc/os-release \
 && curl -fsSL "https://download.docker.com/linux/${ID}/gpg" \
      | gpg --dearmor -o /usr/share/keyrings/docker.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

# --- non-interactive auth: see AGENT-AUTH.md -------------------------------------------
# SYSTEM scope, not user scope. `gh auth setup-git` writes to ~/.gitconfig, and git saves
# config by temp-file-and-rename, which fails outright on a bind-mounted file with
# "Device or resource busy". System scope also survives a fresh HOME.
RUN git config --system credential.helper '!gh auth git-credential'

# Without this, a missing credential reports "could not read Username ...: No such device or
# address" — git describing the absent terminal, which reads as a broken mount and sends you
# hunting the wrong bug. With it: "terminal prompts disabled".
ENV GIT_TERMINAL_PROMPT=0

# The token arrives at run time (see the launcher). NEVER bake one into a layer: it survives
# being deleted in a later layer.

# Runtime `npm i -g` as an arbitrary uid cannot write the system prefix, and chmod 777 on a
# global module tree is the wrong fix. Point the runtime prefix at the persistent HOME
# instead: installs survive container recreation and need no elevated permissions. This
# comes AFTER the build-time install above, which must land in the system prefix.
ENV NPM_CONFIG_PREFIX=/dev-home/.npm-global
ENV PATH=/dev-home/.npm-global/bin:$PATH

# Fail the build rather than someone's push, months later.
RUN gh --version \
 && git config --system --get credential.helper \
 && command -v ssh && command -v jq && command -v tmux \
 && docker --version \
 && /opt/google/chrome/chrome --headless=new --dump-dom about:blank >/dev/null

WORKDIR /workspace
CMD ["bash"]
