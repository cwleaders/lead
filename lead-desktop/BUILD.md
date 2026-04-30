# Building CW Leaders Studio (Desktop)

This is the unified desktop app — Mac, Windows, Linux — built with Tauri 2 + Rust.

**Goals (locked):** ≤12 MB installer · ≤90 MB idle RAM · runs on machines with 4 GB RAM and a dual-core CPU · all 4 tools (Record, Send, Hire, Command) in one app.

---

## Prerequisites (per platform)

### All platforms
- **Node.js 20+** (for Tauri CLI)
- **Rust 1.77+** (`rustup default stable`)
- **ffmpeg** — bundled with the user's OS or installed via:
  - Mac: `brew install ffmpeg`
  - Windows: `choco install ffmpeg` or grab from ffmpeg.org
  - Linux: `apt install ffmpeg` (or distro equivalent)

### Mac
- Xcode Command Line Tools: `xcode-select --install`
- Apple Developer ID for notarization (you have this)

### Windows
- Visual Studio Build Tools (with the "Desktop development with C++" workload)
- WebView2 runtime (auto-bundled by Tauri)

### Linux
- `apt install libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

---

## First-time setup

```bash
cd lead-desktop
npm install                      # installs Tauri CLI + JS deps
npm run tauri info               # confirms your toolchain is ready
```

---

## Run in dev mode (live reload)

```bash
npm run dev
```

The Mind-Free shell opens in a 1180×760 window. Edit `src/index.html`, `src/style.css`, `src/app.js` — webview reloads automatically. Edit `src-tauri/src/*.rs` — Rust recompiles automatically.

---

## Build production binaries

### Mac (universal, signed, notarized)
```bash
# Set Apple credentials once (in your shell or .env file — never commit)
export APPLE_ID="you@apple-id.com"
export APPLE_PASSWORD="app-specific-password"     # appleid.apple.com → Generate
export APPLE_TEAM_ID="ABCDE12345"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"

npm run build:mac
# → src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
```

### Windows
```bash
npm run build:win
# → src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/*.msi
```

For code-signing (required to avoid SmartScreen warnings):
```bash
export TAURI_SIGNING_PRIVATE_KEY="path/to/cert.pfx"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="cert-password"
```

### Linux
```bash
npm run build:linux
# → src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/{appimage,deb}/*
```

---

## Generating Tauri update signing keys (do this ONCE)

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/cwleaders-studio-key
# Outputs:
#   private key: ~/.tauri/cwleaders-studio-key
#   public key:  ~/.tauri/cwleaders-studio-key.pub
```

Then **paste the public key contents** into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

For CI builds, set `TAURI_SIGNING_PRIVATE_KEY` (private key file content) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub secrets.

---

## Releasing a new version

1. Bump `version` in **both** `package.json` AND `src-tauri/tauri.conf.json` AND `src-tauri/Cargo.toml`.
2. Tag and push: `git tag v0.2.0 && git push --tags`.
3. GitHub Actions (`.github/workflows/release.yml`) builds for all 3 platforms, signs them, and uploads to S3 at `s3://lead-installers-069422358723/v0.2.0/`.
4. The CI also writes `manifest/latest.json` which the `desktop-update` Lambda serves to running apps — they'll silently auto-update on next launch.

---

## Local AI models

Studio bundles a tiny Whisper model (~75 MB) for transcription, CLIP-INT8 (~150 MB) for scene detection, and Tesseract for OCR. To download them after install:

```bash
npm run fetch:models
```

Models live in `~/.cache/CW-Leaders-Studio/models/` and are shared across versions.

---

## Footprint targets (verify before release)

| Metric | Target | How to measure |
|---|---|---|
| Installer (mac dmg) | ≤ 12 MB | `ls -lh src-tauri/target/.../bundle/dmg/*.dmg` |
| Installer (win msi) | ≤ 10 MB | `ls -lh src-tauri/target/.../bundle/msi/*.msi` |
| Installer (linux appimage) | ≤ 8 MB | `ls -lh src-tauri/target/.../bundle/appimage/*.AppImage` |
| Idle RAM | ≤ 90 MB | Activity Monitor / Task Manager / `ps aux` |
| Recording RAM | ≤ 180 MB | Same — capture in progress |

Anything bigger means we have a regression. Audit deps with `cargo bloat --release`.
