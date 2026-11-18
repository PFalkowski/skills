#!/usr/bin/env bash
# Runs formal-check's TLC worked example with the commands in TLC.md: LeaseAtomic must pass (exit 0)
# and LeaseRace must break its invariant (exit 12). The offline checks run everywhere. The TLC runs
# need java: without it they are skipped locally and fail inside GitHub Actions, where the runner
# image puts Java on PATH.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/formal-check"
URL=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar
SHA=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
EMPTY_SHA=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
JAVA_LINE='java -Djava.io.tmpdir="$run" -cp "$work/tla2tools.jar" tlc2.TLC -workers 1 -metadir "$run/meta" -config <M>.cfg <M>.tla'

fail=0
total=0

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git -C "$ROOT" status --porcelain --ignored > "$work/status.before"

check() {
  local desc="$1"
  total=$((total + 1))
  if "${@:2}"; then
    echo "PASS: $desc"
  else
    echo "FAIL: $desc"
    fail=$((fail + 1))
    return 1
  fi
}

has() { printf '%s' "$1" | grep -qF -- "$2"; }
empty() { [ -z "$1" ]; }

finish() {
  git -C "$ROOT" status --porcelain --ignored > "$work/status.after"
  check "the run left git status unchanged" cmp "$work/status.before" "$work/status.after"
  echo "$((total - fail))/$total passed"
  [ "$fail" -eq 0 ]
  exit
}

verify_sha256() {
  local actual
  case "$3" in
    sha256sum) actual=$(sha256sum "$1" | awk '{print $1}') ;;
    shasum) actual=$(shasum -a 256 "$1" | awk '{print $1}') ;;
  esac
  [ "$actual" = "$2" ] && return 0
  echo "SHA-256 mismatch for $1: expected $2, actual $actual"
  return 1
}

tools=()
for t in sha256sum shasum; do
  command -v "$t" >/dev/null 2>&1 && tools+=("$t")
done
check "sha256sum or shasum is on PATH" test "${#tools[@]}" -gt 0
: > "$work/empty"
for t in "${tools[@]}"; do
  echo "digest self-test: running with $t"
  out=$(verify_sha256 "$work/empty" "$SHA" "$t")
  rc=$?
  printf '  %s\n' "$out"
  check "digest self-test ($t): a file with the wrong digest is refused" test "$rc" -ne 0
  check "digest self-test ($t): the message holds the expected digest" has "$out" "$SHA"
  check "digest self-test ($t): the message holds the file's real digest" has "$out" "$EMPTY_SHA"
done

for s in "$URL" "$SHA" "$JAVA_LINE"; do
  check "TLC.md holds verbatim: $s" grep -qF -- "$s" "$DIR/TLC.md"
done

atomic=$(grep '^AtMostOneHolder ==' "$DIR/LeaseAtomic.tla")
race=$(grep '^AtMostOneHolder ==' "$DIR/LeaseRace.tla")
check "both modules define AtMostOneHolder" test -n "$atomic" -a -n "$race"
check "the AtMostOneHolder line is identical in both modules" test "$atomic" = "$race"
for m in LeaseAtomic LeaseRace; do
  check "$m.cfg checks INVARIANT AtMostOneHolder" grep -qxF 'INVARIANT AtMostOneHolder' "$DIR/$m.cfg"
done

check "no SKILL.md under formal-check other than its own" empty "$(find "$DIR" -name SKILL.md ! -path "$DIR/SKILL.md")"
check "no .claude folder under formal-check" empty "$(find "$DIR" -name .claude)"
check "no line under formal-check starts with 'Sync commit: '" empty "$(grep -rlE '^Sync commit: ' "$DIR")"

if ! command -v java >/dev/null 2>&1; then
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    echo "FAIL: Java is missing -- 'java' is not on PATH inside GitHub Actions, so TLC cannot run"
    total=$((total + 1))
    fail=$((fail + 1))
  else
    echo "SKIP: 'java' is not on PATH -- TLC worked-example runs not run"
  fi
  finish
fi
[ "$fail" -eq 0 ] || finish

if ! curl -fsSL --retry 3 -o "$work/tla2tools.jar" "$URL"; then
  echo "FAIL: could not download $URL"
  exit 1
fi
verify_sha256 "$work/tla2tools.jar" "$SHA" "${tools[0]}" || exit 1

tlc() {
  local run
  run=$(mktemp -d "$work/run.XXXXXX")
  cp "$DIR/$1.tla" "$DIR/$1.cfg" "$run/"
  out=$(cd "$run" && java -Djava.io.tmpdir="$run" -cp "$work/tla2tools.jar" tlc2.TLC -workers 1 -metadir "$run/meta" -config "$1.cfg" "$1.tla" 2>&1)
  status=$?
}

tlc LeaseAtomic
check "LeaseAtomic: TLC exits 0 (status $status)" test "$status" -eq 0 ||
  printf '%s\n' "$out" | tail -n 30

tlc LeaseRace
{ check "LeaseRace: TLC exits 12 (status $status)" test "$status" -eq 12 &&
  check "LeaseRace: output says 'Invariant AtMostOneHolder is violated.'" has "$out" 'Invariant AtMostOneHolder is violated.'; } ||
  printf '%s\n' "$out" | tail -n 30

finish
