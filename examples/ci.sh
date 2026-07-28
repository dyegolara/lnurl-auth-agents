#!/usr/bin/env bash
# Example: CI/CD workflow using lnurl-auth --json for scripting.
#
# Usage:
#   ./ci.sh "<lnurl1...>"
#
# Shows how to parse machine-readable JSON output for automation.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LNURL="${1:-}"

if [[ -z "$LNURL" ]]; then
  echo "Usage: $0 \"<lnurl1...>\"" >&2
  exit 2
fi

echo "== Decoding and verifying dry-run info =="

# Dry-run: extract fields with jq
DRY_RUN=$(node "$SKILL_DIR/lnurl_auth.js" "$LNURL" --dry-run --json)

echo "Domain:       $(echo "$DRY_RUN" | jq -r .domain)"
echo "Action:       $(echo "$DRY_RUN" | jq -r .action)"
echo "Pubkey:       $(echo "$DRY_RUN" | jq -r .linkingPubkey)"
echo "Callback URL: $(echo "$DRY_RUN" | jq -r .callbackUrl)"
echo "Method:       $(echo "$DRY_RUN" | jq -r .method)"

echo
echo "== Submitting login =="

# Real login: capture response status
RESPONSE=$(node "$SKILL_DIR/lnurl_auth.js" "$LNURL" --json)
STATUS=$(echo "$RESPONSE" | jq -r '.response.status // "ERROR"')
HTTP=$(echo "$RESPONSE" | jq -r '.httpStatus // 0')

echo "HTTP status:  $HTTP"
echo "Login status: $STATUS"

if [ "$STATUS" = "OK" ]; then
  echo "Authentication successful!"
  exit 0
else
  REASON=$(echo "$RESPONSE" | jq -r '.response.reason // "unknown"')
  echo "Authentication failed: $REASON"
  exit 3
fi