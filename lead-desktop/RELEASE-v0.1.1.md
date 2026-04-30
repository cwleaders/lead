# Releasing CW Leaders Studio v0.1.1

The mastering pass has bumped Cargo.toml, package.json, and tauri.conf.json to **0.1.1** and updated `CHANGELOG.md`. To ship the build:

## 1. Mac (your current machine)

```bash
cd /Users/bassinet/Documents/Playground/leadsoftware/lead-desktop
npm install                 # picks up any dep changes
npm run tauri build         # produces a fresh .dmg in src-tauri/target/release/bundle/dmg/
./scripts/publish-release.sh # uploads to s3://lead-installers-069422358723 and updates the latest.json manifest
```

If you haven't yet captured the Apple credentials in `LAUNCH-STATE.md`, the .dmg will still build and ship — it just won't be auto-notarized. (User work-around: right-click → Open the first time.) When you have:

```bash
export APPLE_ID=...
export APPLE_PASSWORD=...           # app-specific password
export APPLE_TEAM_ID=...
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
npm run tauri build
```

## 2. Windows

Run on a Windows host (or VM with Visual Studio Build Tools):

```powershell
cd lead-desktop
npm install
npm run build:win
.\scripts\publish-release.sh
```

## 3. Linux

```bash
cd lead-desktop
npm install
npm run build:linux
./scripts/publish-release.sh
```

## 4. Verify

```bash
# 1. Latest manifest (consumed by tauri-plugin-updater)
curl -s https://api.cwleaders.com/desktop/update | jq

# 2. Direct download links (302 redirects to signed S3 URL)
curl -sIL https://api.cwleaders.com/desktop/download?platform=mac    | grep -i location
curl -sIL https://api.cwleaders.com/desktop/download?platform=win    | grep -i location
curl -sIL https://api.cwleaders.com/desktop/download?platform=linux  | grep -i location
```

Each should return HTTP 302 → an installer .dmg/.msi/.AppImage URL.

## 5. Rollback (if needed)

To revert to v0.1.0, restore the `latest.json` manifest from S3 versioning:

```bash
aws s3api list-object-versions --bucket lead-installers-069422358723 --prefix latest.json
aws s3api copy-object --bucket lead-installers-069422358723 \
  --copy-source "lead-installers-069422358723/latest.json?versionId=<previous-version-id>" \
  --key latest.json
```
