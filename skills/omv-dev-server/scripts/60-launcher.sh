#!/usr/bin/env bash
# Install the `dev` launcher into ~/bin and make sure a login shell can find it.
. "$(dirname "$0")/lib.sh"
load_env
here="$(cd "$(dirname "$0")" && pwd)"

head_ "install ~/bin/dev"
do_ "create ~/bin"        mkdir -p "$HOME/bin"
do_ "install dev"         install -m 755 "$here/dev" "$HOME/bin/dev"

head_ "PATH"
# The subtle one: a login shell reads ~/.profile, not ~/.bashrc. Debian's stock .profile is
# what sources .bashrc AND what adds ~/bin to PATH — but only if ~/bin existed at login.
# With a home that was never seeded from /etc/skel there is no .profile at all, so a PATH
# line appended to .bashrc is never read and `dev` is "command not found" for reasons that
# have nothing to do with the launcher.
if [ ! -f "$HOME/.profile" ]; then
  warn "~/.profile missing — home was not seeded from /etc/skel; run 10-dev-user.sh"
elif grep -q 'HOME/bin' "$HOME/.profile"; then
  ok "~/.profile adds ~/bin to PATH"
else
  warn "~/.profile does not add ~/bin"
fi

if bash -lc 'command -v dev' >/dev/null 2>&1; then
  ok "a login shell resolves: $(bash -lc 'command -v dev')"
else
  warn "not on PATH in a login shell yet — open a new session, or: source ~/.profile"
fi

head_ "defaults the launcher will use"
info "DEV_REPO_ROOT = ${DEV_REPO_ROOT:-\$HOME/repos}   (override in your shell rc)"
info "DEV_HOME_DIR  = ${DEV_HOME_DIR:-\$HOME/.dev-home}"
info "DEV_IMAGE     = ${IMAGE}"
info "GH_TOKEN      = ${GH_TOKEN:+<set>}${GH_TOKEN:-<unset — agents cannot push>}"

finish
