# Installing CW Leaders Studio

Welcome to Studio — the unified, lightweight desktop app for recording, sharing, hiring, and managing your team. **One install. Free forever.**

---

## Mac

### What you'll need
- macOS 11 (Big Sur) or newer
- ~50 MB free disk space
- ffmpeg installed (for screen recording)

### Step 1 — Install ffmpeg (one-time, ~30 seconds)

ffmpeg is what Studio uses to capture your screen. It's free, open-source, and probably already on your Mac.

Open Terminal and run:
```bash
# If you don't have Homebrew yet:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Then install ffmpeg:
brew install ffmpeg
```

### Step 2 — Download Studio

1. Visit **https://studio.cwleaders.com** and click **Download for Mac →**
2. Open the downloaded `.dmg` file
3. Drag **CW Leaders Studio** into your **Applications** folder
4. Open Studio from your Applications folder

### Step 3 — First launch (one-time Gatekeeper trust)

The first time you open Studio, macOS will show:
> *"CW Leaders Studio cannot be opened because the developer cannot be verified."*

This is normal for indie apps that haven't been notarized yet. To trust it:

1. **Right-click** (or Control-click) on **CW Leaders Studio** in Applications
2. Choose **Open**
3. Click **Open** again in the dialog that appears

You only need to do this once. Studio will remember the trust forever.

> *We're working on Apple notarization which removes this step entirely. It'll roll out automatically with the next update — no action needed on your end.*

---

## Windows

### Step 1 — Install ffmpeg
1. Download ffmpeg from [ffmpeg.org/download.html#build-windows](https://ffmpeg.org/download.html#build-windows)
2. Or via Chocolatey: `choco install ffmpeg`

### Step 2 — Download + run the installer
1. Visit **https://studio.cwleaders.com** and click **Download for Windows →**
2. Run the downloaded `.msi`
3. If SmartScreen appears (it will, until we sign the app), click **More info** → **Run anyway**
4. Studio installs and adds itself to your Start Menu

---

## Linux

### Step 1 — Install ffmpeg
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Fedora: `sudo dnf install ffmpeg`
- Arch: `sudo pacman -S ffmpeg`

### Step 2 — Download Studio
1. Visit **https://studio.cwleaders.com** and click **Download for Linux →**
2. Make it executable and run:
   ```bash
   chmod +x CW-Leaders-Studio.AppImage
   ./CW-Leaders-Studio.AppImage
   ```
3. (Optional) Move it to `~/Applications/` and create a desktop entry.

---

## What you can do once installed

- 🎬 **Record your screen** — local-first, no upload required
- 📦 **Send files** — drop a file in the Send tab, get a link
- 👥 **Open MyHire** — manage your applicants and Skill Checks
- 🤖 **Arm an agent** — Capture, Courier, Triage, Coach, or Bridge agents working in the background

## Free vs paid

The download is **free forever**. You can record up to 30-min videos at 1080p, share files up to 1 GB, and use 500 AI credits per month. To unlock more, paste a license key from your Studio account at any time.

[View pricing →](https://studio.cwleaders.com#pricing)

---

## Trouble?

| Problem | Fix |
|---|---|
| "ffmpeg not found" toast on Record | Run the ffmpeg install step above, then restart Studio |
| App won't open on Mac (Gatekeeper) | Right-click → Open (one-time trust) |
| Recording is choppy | Studio auto-detects your hardware. If you're on a low-end machine, recording defaults to 24fps/720p — perfectly normal |
| License key won't validate | Make sure you're online for the first redemption — Studio caches the license for 14 days of offline use after that |

Email **hello@cwleaders.com** if anything's still wrong — a real person will reply within one business day.
