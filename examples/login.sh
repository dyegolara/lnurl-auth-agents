#!/usr/bin/env bash
# Example: perform an LNURL-auth login from an lnurl1... string.
#
# Usage:
#   ./login.sh "<lnurl1...>"
#
# Steps:
#   1. Dry-run to see the decoded service URL + would-be callback (no submit).
#   2. Real login (submits the signature to the service).
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LNURL="${1:-}"

if [[ -z "$LNURL" ]]; then
  echo "Usage: $0 \"<lnurl1...>\"" >&2
  echo "Tip: get one from a 'Sign in with Lightning' QR/link (e.g. bitsimp.com)." >&2
  exit 2
fi

echo "== Dry-run (decode + sign, no submit) =="
node "$SKILL_DIR/lnurl_auth.js" "$LNURL" --dry-run --json

echo
echo "== Real login (submits signature to the service) =="
node "$SKILL_DIR/lnurl_auth.js" "$LNURL" --json
echo "exit code: $?"
