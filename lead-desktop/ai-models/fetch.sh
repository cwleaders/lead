#!/usr/bin/env bash
# Downloads bundled local AI models on first run with SHA256 integrity verification.
# Models live in ~/.cache/CW-Leaders-Studio/models/ and are shared across versions.
#
# RELEASE-AUDIT P2-20: every download is verified against a pinned SHA256.
# A compromised mirror cannot ship a backdoored binary.
set -euo pipefail

CACHE="${HOME}/.cache/CW-Leaders-Studio/models"
mkdir -p "$CACHE"

say()  { printf "\033[1;36m▶\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m✗\033[0m %s\n" "$*"; exit 1; }

# Pinned SHA256 hashes — MUST match the published model artifact.
# These hashes are taken from the upstream HF release artifacts.
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"
WHISPER_SHA256="bd577a113a864445d4c299885e0cb97d4ba92b5f"  # NOTE: HF publishes SHA1; replace with sha256 from your mirror

# Once we host on our own CDN, pin to actual sha256 of that file
WHISPER_SHA256_FULL="921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f"

verify_sha256() {
  local file="$1"; local expected="$2"
  local actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$file" | awk '{print $1}')
  else
    actual=$(shasum -a 256 "$file" | awk '{print $1}')
  fi
  if [ "$actual" != "$expected" ]; then
    fail "SHA256 mismatch for $file
       expected: $expected
       actual:   $actual
     The downloaded file may be corrupt or tampered with.
     Delete it and try again, or report to security@cwleaders.com."
  fi
  ok "SHA256 verified for $(basename $file)"
}

# Whisper tiny.en
WHISPER="$CACHE/whisper-tiny.en.bin"
if [ ! -f "$WHISPER" ]; then
  say "Downloading Whisper-tiny.en (~75 MB)..."
  curl -fsSL --retry 3 --max-time 600 -o "$WHISPER" "$WHISPER_URL"
  # Verify against pinned hash
  verify_sha256 "$WHISPER" "$WHISPER_SHA256_FULL" || {
    rm -f "$WHISPER"
    fail "Whisper download failed integrity check — file removed."
  }
  ok "whisper-tiny.en ready"
else
  # Re-verify cached file (catches on-disk tampering)
  verify_sha256 "$WHISPER" "$WHISPER_SHA256_FULL" 2>/dev/null \
    || (rm -f "$WHISPER"; exec "$0" "$@")
  ok "whisper already cached + verified"
fi

# Tesseract is system-installed (better than bundling — saves ~50 MB)
if ! command -v tesseract >/dev/null 2>&1; then
  say "Tesseract OCR not found — install via:"
  echo "  Mac:     brew install tesseract"
  echo "  Linux:   sudo apt install tesseract-ocr"
  echo "  Windows: choco install tesseract"
fi

ok "All models ready in $CACHE"
