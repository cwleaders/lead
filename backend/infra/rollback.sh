#!/usr/bin/env bash
# CW Leaders — Lambda rollback
# Repoints every lead-* Lambda to its previously-published version.
# Use case: a deploy went bad and /health is failing.
#
# Usage:
#   ./rollback.sh                    # roll all lead-* lambdas back one version
#   ./rollback.sh lead-stripe-webhook  # roll just one
#   ./rollback.sh --to v=12 lead-auth-request  # explicit version

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
TARGET="${1:-}"
EXPLICIT_VERSION=""

# Parse explicit version flag
if [[ "${1:-}" == "--to" ]]; then
  EXPLICIT_VERSION="$2"
  TARGET="$3"
fi

say()  { printf "\033[1;36m▶\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m✗\033[0m %s\n" "$*"; exit 1; }

rollback_one() {
  local fn="$1"
  say "Rolling back $fn"

  local target_version
  if [ -n "$EXPLICIT_VERSION" ]; then
    target_version="$EXPLICIT_VERSION"
  else
    # Get current published version, then go one before
    target_version=$(aws lambda list-versions-by-function \
      --function-name "$fn" --region "$REGION" \
      --query 'Versions[?Version!=`$LATEST`].Version' --output text \
      | tr '\t' '\n' | sort -n | tail -2 | head -1)
  fi

  if [ -z "$target_version" ] || [ "$target_version" = "None" ]; then
    warn "$fn — no prior version found, skipping"
    return 0
  fi

  # Get the code-zip URL of the target version
  local zip_url
  zip_url=$(aws lambda get-function \
    --function-name "${fn}:${target_version}" --region "$REGION" \
    --query 'Code.Location' --output text)

  # Download zip + re-deploy as $LATEST + publish new version (so we can audit)
  local tmp_zip="/tmp/cwl-rollback-${fn}-${target_version}.zip"
  curl -sf -o "$tmp_zip" "$zip_url" || fail "$fn — failed to download v${target_version}"

  aws lambda update-function-code \
    --function-name "$fn" --region "$REGION" \
    --zip-file "fileb://$tmp_zip" --publish \
    --query '{FunctionName:FunctionName,Version:Version}' --output text

  rm -f "$tmp_zip"
  ok "$fn rolled back to code from v${target_version}"
}

# ------------------------------------------------------------------------
if [ -n "$TARGET" ] && [[ "$TARGET" =~ ^lead- ]]; then
  rollback_one "$TARGET"
else
  say "Rolling back ALL lead-* functions"
  fns=$(aws lambda list-functions --region "$REGION" \
    --query 'Functions[?starts_with(FunctionName,`lead-`)].FunctionName' \
    --output text)
  for fn in $fns; do
    rollback_one "$fn" || warn "  $fn rollback failed (continuing)"
  done
  say "Verifying /health post-rollback"
  for i in 1 2 3; do
    sleep 5
    code=$(curl -sk -o /dev/null -w "%{http_code}" https://api.cwleaders.com/health)
    [ "$code" = "200" ] && ok "/health 200 — rollback verified" && exit 0
  done
  fail "/health still failing after rollback — escalate"
fi
