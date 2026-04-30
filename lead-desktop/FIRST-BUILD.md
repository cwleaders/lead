# Building Your First Customer-Ready Release

The full Tauri project is scaffolded, all icons are generated, scripts are ready. To produce the actual `.dmg` (or `.msi`/`.AppImage`) and ship it to your S3 installers bucket, follow these steps **on your Mac**.

> **Heads-up:** This is a one-time setup. Subsequent releases are just `npm version patch && npm run tauri build && ./scripts/publish-release.sh`.

---

## 1. Install Rust (~10 minutes, ~1.5 GB)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
source ~/.cargo/env
rustc --version       # should print rustc 1.x.x
```

## 2. Install Xcode Command Line Tools (if not already)

```bash
xcode-select --install
```

## 3. Install Homebrew + ffmpeg (you'll need ffmpeg locally to test recording)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install ffmpeg
```

## 4. Install JS dependencies

```bash
cd /Users/bassinet/Documents/Playground/leadsoftware/lead-desktop
npm install
```

## 5. Generate Tauri update signing keys (one-time)

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/cwleaders-studio-key
# Choose a password when prompted (remember it!)
```

This creates two files:
- `~/.tauri/cwleaders-studio-key` — **PRIVATE** (never commit)
- `~/.tauri/cwleaders-studio-key.pub` — public

Open the `.pub` file and copy its single-line content. Then open
`src-tauri/tauri.conf.json` and replace `REPLACE_AT_FIRST_BUILD_WITH_SIGNING_KEY_PUB`
with that public key string.

## 6. Test in dev mode

```bash
npm run dev
```

Studio opens in a 1180×760 window. Hit ⌘C to stop. If this works, you're ready to build.

## 7. Build the production DMG

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/cwleaders-studio-key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<the password you chose in step 5>"

npm run tauri build
```

This will:
- Compile the Rust core (5-10 min on first build, < 1 min on subsequent)
- Bundle the webview assets
- Produce `src-tauri/target/release/bundle/dmg/CW Leaders Studio_0.1.0_aarch64.dmg`

## 8. (Optional) Test the DMG locally

Open it, drag CW Leaders Studio to /Applications, right-click → Open the first time. You should see the Mind-Free shell with the "Welcome to Studio" splash.

## 9. Publish to S3

```bash
./scripts/publish-release.sh
```

This auto-detects the platform, uploads to `s3://lead-installers-069422358723/v0.1.0/mac-aarch64/`, writes the manifest, and verifies the download endpoint returns 302 (real installer). Done.

## 10. Smoke-test the public flow

```bash
open https://studio.cwleaders.com
# Click "Download for Mac →" — confirms a real DMG downloads, not the "coming soon" page
```

---

## When you're ready to add Apple notarization

So users don't see the Gatekeeper warning, set these env vars before building:

```bash
export APPLE_ID="you@apple.com"
export APPLE_PASSWORD="app-specific-password"        # appleid.apple.com → Generate
export APPLE_TEAM_ID="ABCDE12345"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"

npm run tauri build
```

Tauri handles signing + notarization automatically. The build takes an extra 1-3 minutes for notarization to round-trip with Apple.

---

## Subsequent releases (the easy path)

```bash
# 1. Bump version
npm version patch       # 0.1.0 → 0.1.1

# 2. Build
npm run tauri build

# 3. Ship
./scripts/publish-release.sh
```

Existing installs auto-update silently within 24 hours.

---

## What's the disk situation?

You currently have ~18 GB free. Rust toolchain + Tauri build artifacts + node_modules will use ~3-5 GB. After your first build, recurring builds reuse cached artifacts (~30 sec to recompile from change).

If disk gets tight, `cargo clean` inside `lead-desktop/src-tauri/` reclaims most of it.
