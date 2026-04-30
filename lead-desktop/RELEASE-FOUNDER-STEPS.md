# Release v0.1.1 — Founder Steps (the only manual gate)
**Audit verdict driver:** every code/config fix is in. These are the steps that require human credentials I cannot programmatically perform.

Total estimated time: **~90 minutes** (most of it waiting for Apple's notarization queue).

---

## ✓ Already done by the audit (no founder action)

| Item | Status |
|---|---|
| v0.1.0 unsigned DMG removed from public download channel | ✅ done — manifest cleared, /desktop/download returns "coming soon" page |
| `tauri.conf.json` updated with Wareactics signingIdentity + Team ID | ✅ done — `Developer ID Application: Wareactics Corporation (CWT985BC6W)` |
| `entitlements.plist` written for hardened runtime | ✅ done |
| Devtools removed from release build | ✅ done — gated to `cfg(debug_assertions)` |
| `shell:allow-execute` + `fs:allow-home-*` removed | ✅ done — capabilities tightened to scope arrays |
| CSP hardened: removed `'unsafe-inline'` script-src; added frame-ancestors / base-uri / object-src | ✅ done |
| Tauri minisign keypair generated | ✅ done — public key in `tauri.conf.json` |
| GitHub Actions release workflow scaffolded | ✅ done — `.github/workflows/release-desktop.yml` |
| `cargo-deny` policy + `rust-toolchain.toml` + `.nvmrc` | ✅ done |
| Welcome / EULA acceptance screen | ✅ done — `lead-desktop/src/welcome.html` |
| License JWT moved to OS keyring (Keychain/Credential Manager/Secret Service) | ✅ done — `keyring` crate added |
| 6 release-gate smoke tests | ✅ done — `tests/security_smoke.rs` |
| AI-model SHA256 verification | ✅ done — `ai-models/fetch.sh` |
| S3 versioning enabled on installers bucket + 90d/365d lifecycle | ✅ done |
| Rollback channel (`?channel=previous`) | ✅ done — `desktop-update` Lambda redeployed |
| `publish-release.sh` archives prior manifest as `previous.json` | ✅ done |
| Tauri single-instance plugin | ✅ done |
| 293-file initial git commit ready to push | ✅ done — remote wired |

---

## 🔐 STEP 1 — Push to GitHub (5 minutes)

The repo is committed locally; you push it.

```bash
cd /Users/bassinet/Documents/Playground/leadsoftware
git push -u origin main
```

If first push fails on credentials, GitHub CLI handles it:
```bash
gh auth login
gh repo set-default cwleaders/lead
git push -u origin main
```

**Verification:** open https://github.com/cwleaders/lead — you should see 293 files.

---

## 🔐 STEP 2 — Move the Tauri minisign private key off `/tmp` (10 minutes)

The audit generated a fresh keypair at `/tmp/cwleaders-tauri-private.key`. `/tmp` is wiped on reboot — move it now.

```bash
# Copy to 1Password (or your password manager)
cat /tmp/cwleaders-tauri-private.key
# → paste into 1Password as new secure-note "cwleaders-tauri-minisign-private"

# Save the matching password (was empty in our generation; if you set one, store it)

# Delete the /tmp copy
rm /tmp/cwleaders-tauri-private.key /tmp/cwleaders-tauri-private.key.pub
```

Then upload to GitHub Actions:
```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY    < <(cat <<<"<paste from 1Password>")
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""
```

---

## 🔐 STEP 3 — Apple Developer ID export → GitHub Secrets (30 minutes)

You said the Apple Developer Team ID is `CWT985BC6W` (Wareactics Corporation). The cert + identity are already in your local Keychain (or will be after Apple's signing flow if you haven't downloaded it yet).

### 3a. Confirm cert exists
```bash
security find-identity -v -p codesigning | grep "CWT985BC6W"
# expected: "Developer ID Application: Wareactics Corporation (CWT985BC6W)"
```

If absent → log into developer.apple.com → Certificates → create "Developer ID Application" → download → double-click to install in Keychain Access.

### 3b. Export the cert as `.p12`

```
Keychain Access → My Certificates →
  right-click "Developer ID Application: Wareactics Corporation (CWT985BC6W)" →
  Export → Format: Personal Information Exchange (.p12) →
  Save to ~/Desktop/cwleaders-codesign.p12 →
  Set a strong password (you'll add it as a GH secret)
```

### 3c. Generate an app-specific password

```
appleid.apple.com → Sign-In & Security → App-Specific Passwords → +
  Label: "CW Leaders Notarization"
  Save the 19-char password (xxxx-xxxx-xxxx-xxxx)
```

### 3d. Upload to GitHub Secrets

```bash
# 1) The Developer ID Application cert (base64-encoded for transport)
base64 -i ~/Desktop/cwleaders-codesign.p12 | gh secret set MACOS_CERTIFICATE

# 2) The .p12 password
gh secret set MACOS_CERT_PASSWORD --body "<the password from step 3b>"

# 3) Apple ID account
gh secret set APPLE_ID --body "<your apple ID email>"
gh secret set APPLE_PASSWORD --body "<19-char app-specific password from 3c>"
gh secret set APPLE_TEAM_ID --body "CWT985BC6W"
gh secret set APPLE_SIGNING_IDENTITY --body "Developer ID Application: Wareactics Corporation (CWT985BC6W)"

# 4) Random password for the temporary build keychain
gh secret set KEYCHAIN_PASSWORD --body "$(openssl rand -hex 24)"
```

### 3e. Securely shred the local cert export
```bash
shred -u ~/Desktop/cwleaders-codesign.p12 2>/dev/null || rm -P ~/Desktop/cwleaders-codesign.p12
```

---

## 🔐 STEP 4 — Windows code signing cert (optional for v0.1.1; recommended for v0.2)

Without this, Windows MSI users get a SmartScreen warning ("Microsoft Defender prevented an unrecognized app from starting"). They CAN proceed via "Run anyway" but it costs trust.

### 4a. Acquire EV Code Signing certificate (1-3 day procurement)

Recommended: DigiCert ($474/yr) or Sectigo ($299/yr). EV certs warm up SmartScreen instantly; OV certs need ~30k installs to warm.

### 4b. Export to `.pfx` (Windows) and upload to GH

```powershell
# On a Windows machine where the cert is installed:
certutil -exportPFX -p "<password>" My <cert-thumbprint> cert.pfx
```

```bash
base64 -i cert.pfx | gh secret set WIN_CERT_BASE64
gh secret set WIN_CERT_PASSWORD --body "<password>"
```

### 4c. If you skip this for v0.1.1
Add to the `release-desktop.yml` matrix:
```yaml
- if: matrix.os == 'windows-latest'
  run: echo "Skipping signing — unsigned MSI for v0.1.1; will be signed in v0.2.0"
```
*(Acceptable risk — Mac is the primary launch surface; document in CHANGELOG.md.)*

---

## 🔐 STEP 5 — AWS OIDC role for GitHub Actions (15 minutes)

The release workflow uses OIDC (no long-lived AWS keys in GH).

### 5a. Create IAM role
```bash
cat > /tmp/oidc-trust.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::069422358723:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:cwleaders/lead:ref:refs/tags/v*"
      }
    }
  }]
}
JSON

aws iam create-role --role-name lead-deploy-prod \
  --assume-role-policy-document file:///tmp/oidc-trust.json

aws iam attach-role-policy --role-name lead-deploy-prod \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

aws iam attach-role-policy --role-name lead-deploy-prod \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
```

### 5b. Create the OIDC provider if it doesn't exist
```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

---

## 🚀 STEP 6 — Cut the release

```bash
cd /Users/bassinet/Documents/Playground/leadsoftware
git tag -a v0.1.1 -m "v0.1.1 — first signed + notarized release"
git push origin v0.1.1
```

This triggers `release-desktop.yml`. Watch the workflow at:
https://github.com/cwleaders/lead/actions

Expected sequence (~25 min):
1. Audit — npm/cargo audit + cargo-deny → ✅
2. Test — `cargo test --release` runs 6 smoke tests → ✅
3. Build matrix (4 jobs in parallel: mac-aarch64, mac-x86_64, win-x86_64, linux-x86_64)
   - Apple cert imported → DMG signed → notarytool submit → staple
   - Windows MSI signtool with timestamp
   - Linux AppImage produced
4. Each artifact: SHA256 → minisign `.sig` → upload to S3
5. SBOM (CycloneDX JSON) generated and published
6. SLSA build provenance attestation
7. Verify step: each `?platform=` returns 302 + has `.sig` in S3
8. GitHub Release created with CHANGELOG body

---

## ✅ STEP 7 — Verify ship-ready

```bash
# 1. Public download endpoint resolves for all 4 platforms
for plat in mac-aarch64 mac-x86_64 win-x86_64 linux-x86_64; do
  curl -sIL "https://api.cwleaders.com/desktop/download?platform=$plat" | head -1
done

# 2. Mac DMG is signed + notarized
curl -sLo /tmp/cw.dmg "https://api.cwleaders.com/desktop/download?platform=mac-aarch64"
codesign -dv --verbose=4 /tmp/cw.dmg 2>&1 | grep -E "Authority|TeamIdentifier"
spctl -a -v /tmp/cw.dmg
# expected: "Developer ID Application: Wareactics Corporation (CWT985BC6W)"
# expected: "source=Notarized Developer ID"

# 3. .sig files present
aws s3 ls s3://lead-installers-069422358723/v0.1.1/ --recursive | grep ".sig$"

# 4. Auto-update will work — manifest validates
curl -s "https://api.cwleaders.com/desktop/update?platform=mac-aarch64&current=0.1.0" | jq
```

If all 4 verifications pass → **Release Ready** at 100/100. The first paying customer can download a properly-signed installer that auto-updates correctly.

---

## ❓ Troubleshooting

| Symptom | Diagnosis | Fix |
|---|---|---|
| `notarytool submit` returns "Invalid" | Apple ID password wrong, or app-specific password expired | Regenerate at appleid.apple.com → re-upload as `APPLE_PASSWORD` secret |
| `signtool` fails on Windows job | Cert thumbprint or password wrong | Re-export `.pfx` from Windows Keychain → re-base64 → re-upload `WIN_CERT_BASE64` |
| Tauri build fails: `Could not find pubkey` | `tauri.conf.json` is the v1 backup | Confirm `cat lead-desktop/src-tauri/tauri.conf.json` has the new pubkey starting `dW50cnVzdGVk...` |
| `cargo-deny check` fails on a license | New transitive dep with disallowed license | Add to `deny.toml` `licenses.allow` if reviewed and acceptable; or upstream-pin |
| OIDC 403 from S3 | Trust-policy `sub` claim doesn't match the actual ref | Update trust policy: `repo:cwleaders/lead:ref:refs/tags/v*` (must be tags only) |

---

## 🔁 Rollback playbook (if v0.1.1 has a P1 bug post-launch)

```bash
# 1. Trip the rollback channel
aws s3 cp s3://lead-installers-069422358723/manifest/previous.json \
          s3://lead-installers-069422358723/manifest/latest.json \
          --content-type application/json

# 2. Inform users (in-app banner)
# Edit studio-app/index.html banner; deploy via existing flow

# 3. Verify
curl -s "https://api.cwleaders.com/desktop/update?platform=mac-aarch64&current=0.1.1" | jq .version
# expected: 0.1.0 if you have a v0.1.0 in previous.json
```
