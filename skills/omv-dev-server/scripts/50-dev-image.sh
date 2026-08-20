#!/usr/bin/env bash
# Build the dev image and verify it can actually push.
. "$(dirname "$0")/lib.sh"
load_env
here="$(cd "$(dirname "$0")" && pwd)"

head_ "docker"
command -v docker >/dev/null && ok "$(docker --version)" || { bad "docker not installed"; finish; }
docker info >/dev/null 2>&1 && ok "daemon reachable without sudo" \
  || bad "cannot talk to the daemon — is $USER in the docker group? (log out and back in after adding)"

head_ "build $IMAGE"
if [ "$CHECK_ONLY" = 1 ]; then
  info "would: docker build -t $IMAGE -f $here/Dockerfile $here"
  docker image inspect "$IMAGE" >/dev/null 2>&1 && ok "image already present" || warn "image not built yet"
else
  # The Dockerfile's final RUN is itself a smoke test, so a future edit that drops gh, ssh,
  # jq or the credential helper fails the build instead of someone's push months later.
  if docker build -t "$IMAGE" -f "$here/Dockerfile" "$here"; then ok "built $IMAGE"; else bad "build failed"; finish; fi
fi

head_ "smoke test"
if [ "$CHECK_ONLY" = 1 ]; then
  info "would: $here/smoke-test.sh $IMAGE"
else
  "$here/smoke-test.sh" "$IMAGE" "${PRIVATE_TEST_REPO:-}" || bad "smoke test reported problems"
fi

finish
