#!/usr/bin/env bash
# Publishes a freshly-built CW Leaders Studio installer to S3 and
# updates the live update manifest so users start auto-updating.
#
# Usage (from inside lead-desktop/ after a successful `npm run tauri build`):
#   ./scripts/publish-release.sh
#
# It auto-detects:
#   - the current version (from package.json)
#   - the installer file (Mac DMG / Windows MSI / Linux AppImage)
#   - the platform key matching tauri-plugin-updater's expectations

set -euo pipefail

INSTALLERS_BUCKET="lead-installers-069422358723"
REGION="us-east-1"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=$(node -p "require('./package.json').version")
say()  { printf "\033[1;36m▶\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m✗\033[0m %s\n" "$*"; exit 1; }

say "Publishing CW Leaders Studio v$VERSION"

# ── Find the most recent installer for THIS platform ─────────────────────
PLATFORM_KEY=""
INSTALLER=""
INSTALLER_NAME=""

if [[ "$(uname -s)" == "Darwin" ]]; then
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then PLATFORM_KEY="mac-aarch64"; else PLATFORM_KEY="mac-x86_64"; fi
  INSTALLER=$(/usr/bin/find src-tauri/target -maxdepth 6 -type f -name '*.dmg' 2>/dev/null | /usr/bin/sort | /usr/bin/tail -1)
elif [[ "$(uname -s)" == "Linux" ]]; then
  PLATFORM_KEY="linux-x86_64"
  INSTALLER=$(/usr/bin/find src-tauri/target -maxdepth 6 -type f -name '*.AppImage' 2>/dev/null | /usr/bin/sort | /usr/bin/tail -1)
elif [[ "$(uname -s)" =~ "MINGW" ]] || [[ -n "${OS:-}" && "$OS" == "Windows_NT" ]]; then
  PLATFORM_KEY="win-x86_64"
  INSTALLER=$(/usr/bin/find src-tauri/target -maxdepth 6 -type f -name '*.msi' 2>/dev/null | /usr/bin/sort | /usr/bin/tail -1)
fi

[ -z "$INSTALLER" ] && fail "No installer found. Run 'npm run tauri build' first."
[ ! -f "$INSTALLER" ] && fail "Installer file missing: $INSTALLER"
INSTALLER_NAME=$(basename "$INSTALLER")
say "Found installer: $INSTALLER_NAME ($(/usr/bin/du -sh "$INSTALLER" | /usr/bin/awk '{print $1}'))"

# ── Sign installer with Tauri minisign (creates .sig) ──────────────────
# This is REQUIRED — without .sig the Tauri updater rejects every update.
# Private key comes from env: TAURI_SIGNING_PRIVATE_KEY (base64) or _PATH
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
  fail "TAURI_SIGNING_PRIVATE_KEY (or _PATH) must be set; without it, updates will not work."
fi
say "Signing $INSTALLER_NAME with minisign…"
npx --yes @tauri-apps/cli@latest signer sign \
  ${TAURI_SIGNING_PRIVATE_KEY_PATH:+--private-key-path "$TAURI_SIGNING_PRIVATE_KEY_PATH"} \
  ${TAURI_SIGNING_PRIVATE_KEY:+--private-key "$TAURI_SIGNING_PRIVATE_KEY"} \
  ${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:+--password "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD"} \
  -- "$INSTALLER"
[ ! -f "${INSTALLER}.sig" ] && fail "minisign signing produced no .sig file"
ok "  signed → ${INSTALLER_NAME}.sig"

# ── Compute SHA256 ──────────────────────────────────────────────────────
SHA256=$(/usr/bin/openssl dgst -sha256 -binary "$INSTALLER" | /usr/bin/openssl base64 -A)
echo "$SHA256  $INSTALLER_NAME" > "${INSTALLER}.sha256"
ok "  sha256 computed"

# ── Upload to S3 under v<VERSION>/<platform>/ ───────────────────────────
S3_KEY="v${VERSION}/${PLATFORM_KEY}/${INSTALLER_NAME}"
say "Uploading → s3://${INSTALLERS_BUCKET}/${S3_KEY}"
aws s3 cp "$INSTALLER"          "s3://${INSTALLERS_BUCKET}/${S3_KEY}"        --region "$REGION"
aws s3 cp "${INSTALLER}.sig"    "s3://${INSTALLERS_BUCKET}/${S3_KEY}.sig"    --region "$REGION"
aws s3 cp "${INSTALLER}.sha256" "s3://${INSTALLERS_BUCKET}/${S3_KEY}.sha256" --region "$REGION"
SIG_CONTENT=$(/bin/cat "${INSTALLER}.sig")
ok "  installer + .sig + .sha256 uploaded"

# ── Fetch existing manifest (so other platforms keep their entries) ─────
EXISTING_MANIFEST=$(aws s3 cp "s3://${INSTALLERS_BUCKET}/manifest/latest.json" - --region "$REGION" 2>/dev/null || echo '{}')

NEW_MANIFEST=$(node -e "
const existing = $EXISTING_MANIFEST;
const platforms = (existing.version === '$VERSION' ? existing.platforms : null) || {};
platforms['$PLATFORM_KEY'] = {
  installerKey: '$S3_KEY',
  installerName: '$INSTALLER_NAME',
  ${SIG_CONTENT:+signature: \`$SIG_CONTENT\`,}
};
console.log(JSON.stringify({
  version: '$VERSION',
  notes: existing.version === '$VERSION' ? (existing.notes || '') : 'See https://lead.cwleaders.com/changelog',
  pub_date: new Date().toISOString(),
  platforms,
}, null, 2));
")

echo "$NEW_MANIFEST" > /tmp/lead-manifest.json
say "Publishing manifest:"
/bin/cat /tmp/lead-manifest.json

# Archive existing latest as previous (for rollback channel)
say "Archiving prior manifest as previous.json (rollback channel)…"
aws s3 cp "s3://${INSTALLERS_BUCKET}/manifest/latest.json" \
          "s3://${INSTALLERS_BUCKET}/manifest/previous.json" \
          --region "$REGION" --content-type "application/json" 2>/dev/null \
   || echo "  (no prior latest — first publish)"

aws s3 cp /tmp/lead-manifest.json "s3://${INSTALLERS_BUCKET}/manifest/latest.json"   --region "$REGION" --content-type "application/json"
aws s3 cp /tmp/lead-manifest.json "s3://${INSTALLERS_BUCKET}/manifest/v${VERSION}.json" --region "$REGION" --content-type "application/json"
ok "Manifest published — desktop apps will auto-update on next launch."

# ── Verify the public download endpoint serves the new installer ────────
say "Verifying public download endpoint…"
sleep 4   # let the desktop-update Lambda's 60s cache miss
HTTP_CODE=$(/usr/bin/curl -sS -o /dev/null -w "%{http_code}" "https://api.cwleaders.com/desktop/download?platform=${PLATFORM_KEY}")
if [ "$HTTP_CODE" = "302" ]; then
  ok "  /desktop/download → 302 (redirects to S3 presigned URL)"
else
  printf "\033[1;33m!\033[0m  unexpected HTTP %s — manifest may need a few seconds to propagate\n" "$HTTP_CODE"
fi
echo ""
ok "Release v${VERSION} for ${PLATFORM_KEY} is LIVE."
echo "    Public download: https://api.cwleaders.com/desktop/download?platform=${PLATFORM_KEY}"
echo "    Studio CTA:      https://studio.cwleaders.com  (auto-detects user's OS)"
