#!/usr/bin/env bash
# trunkq runs this for every land: type check, tests, build plus the post-build gate.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund
npm run check
npm test
npm run build
if [[ -n "${PIGGY_TOKENS_UPSTREAM:-}" ]]; then
  node scripts/tokens.mjs --check
else
  echo "verify: SKIPPED token parity (PIGGY_TOKENS_UPSTREAM unset on this host)" >&2
fi
