#!/usr/bin/env bash
# release-due.sh: run once a day from a checkout kept for it. Posts and updates are committed ahead with a future
# date and stay out of the build until that date; this rebuilds trunk's tip and, when the build releases something
# the live site doesn't have yet, deploys it through deploy-landed.sh.
#
# Output, for whatever wraps it: "released <line from released.txt>" per new item, "scheduled <date> <kind> <slug>"
# per item still waiting, and a final "release-due: ..." summary. Exits non-zero on any failure.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="https://github.com/unlicensedthought/unlicensed-thought"
LIVE="https://unlicensedthought.com"
cd "$ROOT"

[ -z "$(git status --porcelain --untracked-files=all)" ] \
  || { echo "release-due: $ROOT has local changes; this checkout is for releases only" >&2; exit 1; }
git fetch -q "$REPO" hee-haw
git checkout -q --detach FETCH_HEAD
sha="$(git rev-parse HEAD)"

env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npm ci --no-audit --no-fund --loglevel=error
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npm run build
want="$(cat build/released.txt)"
live="$(curl -fsS -m 20 -H 'Cache-Control: no-cache' "$LIVE/released.txt")" \
  || { echo "release-due: could not read $LIVE/released.txt" >&2; exit 1; }

new="$(comm -13 <(printf '%s\n' "$live" | sort) <(printf '%s\n' "$want" | sort) | sed '/^$/d')"
gone="$(comm -23 <(printf '%s\n' "$live" | sort) <(printf '%s\n' "$want" | sort) | sed '/^$/d')"
node scripts/schedule.mjs | sed 's/^/scheduled /'

if [ -z "$new" ] && [ -z "$gone" ]; then
  echo "release-due: nothing due; live matches $sha's release set"
  exit 0
fi
[ -z "$gone" ] || echo "release-due: live has items this build drops (trunk removed them):"$'\n'"$gone" >&2

bash scripts/deploy-landed.sh "$sha" "$sha"
for _ in $(seq 1 30); do
  got="$(curl -fsS -m 10 -H 'Cache-Control: no-cache' "$LIVE/released.txt" 2>/dev/null || true)"
  [ "$got" = "$want" ] && break
  sleep 5
done
[ "$got" = "$want" ] || { echo "release-due: deployed $sha but live released.txt still differs" >&2; exit 1; }
[ -z "$new" ] || printf '%s\n' "$new" | sed 's/^/released /'
echo "release-due: deployed $sha; live released.txt matches"
