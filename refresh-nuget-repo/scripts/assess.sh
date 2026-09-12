#!/usr/bin/env bash
# assess.sh — snapshot a .NET/NuGet repo so the agent can resume refresh-nuget-repo at the
# right phase. Read-only. Run from the repo root (Git Bash on Windows or Linux).
set -u

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Not a git repo."; exit 1; }

echo "== git =="
echo "branch:  $(git rev-parse --abbrev-ref HEAD)"
def="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#origin/##')"
echo "default: ${def:-unknown}"
if git status --porcelain | grep -q .; then echo "tree:    DIRTY"; else echo "tree:    clean"; fi
[ -f .git/MERGE_HEAD ] && echo "WARNING: merge in progress (resolve before Phase 0 branch)"

echo "== projects & target frameworks =="
found=0
while IFS= read -r p; do
  found=1
  tf="$(grep -oiE '<TargetFrameworks?>[^<]+' "$p" | sed -E 's/<[^>]+>//')"
  echo "  $p -> ${tf:-?}"
done < <(find . -name '*.csproj' -not -path '*/obj/*' -not -path '*/bin/*' 2>/dev/null)
[ "$found" = 0 ] && echo "  (no .csproj found)"

echo "== package version(s) =="
versions="$(find . -name '*.csproj' -not -path '*/obj/*' -not -path '*/bin/*' -exec \
  grep -hoiE '<Version>[^<]+' {} \; 2>/dev/null | sed -E 's/<[^>]+>//' | sort -u)"
if [ -n "$versions" ]; then echo "$versions" | sed 's/^/  /'; else echo "  (none)"; fi

echo "== workflows =="
workflows="$(ls .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null)"
if [ -n "$workflows" ]; then echo "$workflows" | sed 's/^/  /'; else echo "  (none)"; fi

echo "== open issues =="
if command -v gh >/dev/null 2>&1; then
  if issues="$(gh issue list --state open 2>/dev/null)"; then
    if [ -n "$issues" ]; then echo "$issues" | sed 's/^/  /'; else echo "  (none)"; fi
  else
    echo "  (gh not authed)"
  fi
else
  echo "  (gh CLI not available)"
fi

echo "== published vs repo version (DIVERGENCE CHECK) =="
# If NuGet has versions newer than the repo, the repo is STALE/diverged: the real
# source may have been published from an unpushed working copy. STOP and reconcile
# before refreshing (see REFERENCE "Phase 1 - divergence / stale-repo").
pkgcsproj="$(find . -name '*.csproj' -not -path '*/obj/*' -not -path '*/bin/*' -exec grep -liE '<GeneratePackageOnBuild>|<PackageId>|<Version>' {} \; 2>/dev/null | head -1)"
if [ -n "$pkgcsproj" ]; then
  id="$(grep -oiE '<PackageId>[^<]+' "$pkgcsproj" | sed -E 's/<[^>]+>//')"
  [ -z "$id" ] && id="$(basename "$pkgcsproj" .csproj)"
  idlc="$(printf '%s' "$id" | tr '[:upper:]' '[:lower:]')"
  echo "  package id: $id"
  echo "  published on NuGet:"
  versions_nuget="$(curl -s "https://api.nuget.org/v3-flatcontainer/$idlc/index.json" 2>/dev/null \
    | grep -oE '"[0-9][^"]*"' | tr -d '"' | tail -5)"
  if [ -n "$versions_nuget" ]; then echo "$versions_nuget" | sed 's/^/    /'; else echo "    (not found / never published)"; fi
  echo "  -> If the highest published version is ABOVE the repo's <Version>, the repo is"
  echo "     STALE. Do NOT refresh/publish from it. Reconcile the real source first."
fi

echo
echo "Next: build + test for a baseline before claiming anything —"
echo "  dotnet build -c Release && dotnet test -c Release"
echo "Then map the above to the first incomplete phase in SKILL.md."
