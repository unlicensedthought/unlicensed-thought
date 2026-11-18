#!/usr/bin/env bash
# deploy-landed.sh <before> <sha>: runs after a commit lands on hee-haw. Builds that exact commit,
# deploys it, and fails unless the live site serves it.
#
# Deploys only when <sha> is GitHub's hee-haw tip right now; an overtaken land is skipped
# (the newer land deploys itself). Cloudflare credentials come from the environment or `bf`.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
for tool in git npm node curl; do
  command -v "$tool" >/dev/null || { echo "deploy-landed: $tool is not on PATH ($PATH)" >&2; exit 1; }
done

before="${1:?usage: deploy-landed.sh <before> <sha>}"
sha="${2:?usage: deploy-landed.sh <before> <sha>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="https://github.com/unlicensedthought/unlicensed-thought"
LIVE="https://unlicensedthought.com"

full="$(git -C "$ROOT" rev-parse --verify -q "$sha^{commit}")" \
  || { echo "deploy-landed: $sha is not a commit in this checkout" >&2; exit 1; }
[ "$(git -C "$ROOT" rev-parse HEAD)" = "$full" ] \
  || { echo "deploy-landed: checkout is not at $sha" >&2; exit 1; }
tip="$(git -C "$ROOT" ls-remote "$REPO" refs/heads/hee-haw | cut -f1)"
[ "$tip" = "$full" ] \
  || { echo "deploy-landed: $full is not trunk's tip on GitHub (tip is ${tip:-unreadable}); not deploying" >&2; exit 1; }
echo "deploy-landed: deploying $full (trunk was $before)"

cd "$ROOT"
# Install and build run with no Cloudflare credentials in their environment; only wrangler sees them.
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npm ci --no-audit --no-fund --loglevel=error
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npm run build
[ "$(cat build/build.txt)" = "$full" ] \
  || { echo "deploy-landed: build/build.txt does not name $full" >&2; exit 1; }

cf_token="${CLOUDFLARE_API_TOKEN:-}"
cf_account="${CLOUDFLARE_ACCOUNT_ID:-}"
if [ -z "$cf_token" ] || [ -z "$cf_account" ]; then
  command -v bf >/dev/null || { echo "deploy-landed: no Cloudflare credentials in the environment and no bf" >&2; exit 1; }
  [ -n "$cf_token" ] || cf_token="$(bf get CF_WORKERS_TOKEN)"
  [ -n "$cf_account" ] || cf_account="$(bf get CLOUDFLARE_ACCOUNT_ID)"
fi
[ -n "$cf_token" ] && [ -n "$cf_account" ] \
  || { echo "deploy-landed: empty Cloudflare token or account id" >&2; exit 1; }
CLOUDFLARE_API_TOKEN="$cf_token" CLOUDFLARE_ACCOUNT_ID="$cf_account" ./node_modules/.bin/wrangler deploy
unset cf_token cf_account

got=""
for _ in $(seq 1 30); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' -m 10 "$LIVE/" || true)"
  got="$(curl -fsS -m 10 -H 'Cache-Control: no-cache' "$LIVE/build.txt" 2>/dev/null || true)"
  if [ "$code" = "200" ] && [ "$got" = "$full" ]; then
    echo "deploy-landed: live / is 200 and build.txt is $got"
    exit 0
  fi
  sleep 5
done
echo "deploy-landed: live / is '${code:-none}', build.txt is '${got:-unreadable}', expected $full" >&2
exit 1
