#!/usr/bin/env bash
# trunkq runs this for every land: type check, tests, build plus the post-build gate.
# Contract: the last stdout line is `VERIFY {json}` with verdict pass or fail.
set -uo pipefail
cd "$(dirname "$0")/.."
step() {
  local name="$1"; shift
  if ! "$@"; then
    echo "VERIFY {\"verdict\":\"fail\",\"failed\":\"$name\"}"
    exit 1
  fi
}
step install npm ci --no-audit --no-fund
step check npm run check
step test npm test
step build npm run build
if [[ -n "${PIGGY_TOKENS_UPSTREAM:-}" ]]; then
  step token-parity node scripts/tokens.mjs --check
else
  echo "verify: SKIPPED token parity (PIGGY_TOKENS_UPSTREAM unset on this host)" >&2
fi
echo 'VERIFY {"verdict":"pass","gates":4}'
